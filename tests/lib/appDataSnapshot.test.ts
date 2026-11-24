import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyAppDataToLocalStorage,
  collectAppData,
  emptyAppData,
  parseAppDataSnapshot,
  APP_DATA_SNAPSHOT_VERSION,
  type AppDataSnapshot,
} from '../../src/lib/appDataSnapshot'
import {
  cacheFxRateForDate,
  FX_DAILY_STORAGE_KEY,
  readFxDailyCache,
} from '../../src/lib/historicalFxStorage'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v))
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    },
  })
})

describe('appDataSnapshot', () => {
  it('parses a minimal valid snapshot envelope', () => {
    const raw = {
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
    }
    const parsed = parseAppDataSnapshot(raw)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.version).toBe(1)
    expect(parsed.scenarios).toEqual([])
    expect(parsed.comparables).toEqual([])
    expect(parsed.annotations).toEqual([])
    expect(parsed.goals).toEqual([])
    expect(parsed.portfolioContributions).toEqual({ version: 1, currency: 'USD', byYear: {} })
    expect(parsed.portfolioActuals).toEqual({ version: 1, currency: 'USD', byMonth: {} })
    expect(parsed.linkedSaveMode).toBeUndefined()
    expect(parsed.portfolioCashMode).toBeUndefined()
    expect(parsed.portfolioSharedCash).toEqual({
      version: 1,
      currency: 'USD',
      deposits: [],
      perpetualYearlyDeposit: null,
    })
    expect(parsed.portfolioTrades).toEqual({ version: 1, trades: [] })
  })

  it('keeps portfolio actuals mode on a snapshot', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
      portfolioActualsMode: 'perPortfolio',
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.portfolioActualsMode).toBe('perPortfolio')
  })

  it('keeps portfolio cash mode and shared cash on a snapshot', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
      portfolioCashMode: 'shared',
      portfolioSharedCash: {
        version: 1,
        currency: 'CHF',
        deposits: [],
        perpetualYearlyDeposit: null,
      },
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.portfolioCashMode).toBe('shared')
    expect(parsed.portfolioSharedCash?.currency).toBe('CHF')
  })

  it('keeps linkedSaveMode on a snapshot', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
      linkedSaveMode: 'edits',
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.linkedSaveMode).toBe('edits')
  })

  it('promotes embedded portfolio actuals when snapshot has no shared store', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [
        {
          id: 'p1',
          name: 'Main',
          currentCash: 0,
          deposits: [],
          holdings: [],
          actions: [],
          actuals: { '2024-12': 42_000 },
          actualsCurrency: 'CHF',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.portfolioActuals).toEqual({
      version: 1,
      currency: 'CHF',
      byMonth: { '2024-12': 42_000 },
    })
  })

  it('keeps selectedPortfolioId on a snapshot', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      selectedPortfolioId: 'port-2',
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.selectedPortfolioId).toBe('port-2')
  })

  it('still rejects a v2 multi-account envelope as a single snapshot', () => {
    expect(
      parseAppDataSnapshot({
        version: 2,
        selectedId: 'a',
        accounts: [],
      }),
    ).toMatchObject({ error: expect.any(String) })
  })

  it('rejects invalid payloads', () => {
    expect(parseAppDataSnapshot(null)).toMatchObject({ error: expect.any(String) })
    expect(parseAppDataSnapshot({})).toMatchObject({ error: expect.any(String) })
    expect(parseAppDataSnapshot({ version: 1, scenarios: [] })).toMatchObject({
      error: expect.any(String),
    })
  })

  it('parses historicalFxUsdChfDaily when present and strips junk', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
      historicalFxUsdChfDaily: { '2024-07-01': 0.89, foo: 1 },
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.historicalFxUsdChfDaily).toEqual({ '2024-07-01': 0.89 })
  })

  it('accepts older snapshots without historicalFxUsdChfDaily', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.historicalFxUsdChfDaily).toBeUndefined()
  })

  it('collectAppData includes non-empty FX cache', () => {
    cacheFxRateForDate('2023-12-31', 0.861)
    const data = collectAppData()
    expect(data.historicalFxUsdChfDaily).toEqual({ '2023-12-31': 0.861 })
  })

  it('collectAppData omits empty FX cache', () => {
    const data = collectAppData()
    expect(data.historicalFxUsdChfDaily).toBeUndefined()
  })

  it('applyAppDataToLocalStorage merges FX cache into localStorage', () => {
    cacheFxRateForDate('2024-01-10', 0.87)
    const minimal: AppDataSnapshot = {
      ...emptyAppData(),
      historicalFxUsdChfDaily: {
        '2024-01-10': 0.5,
        '2024-01-11': 0.871,
      },
    }
    const applied = applyAppDataToLocalStorage(minimal)
    expect(applied).toEqual({ ok: true })
    expect(readFxDailyCache()).toEqual({
      '2024-01-10': 0.87,
      '2024-01-11': 0.871,
    })
    expect(store.get(FX_DAILY_STORAGE_KEY)).toContain('2024-01-11')
  })
})

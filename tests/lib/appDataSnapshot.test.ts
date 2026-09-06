import { describe, expect, it } from 'vitest'
import {
  parseAppDataSnapshot,
  APP_DATA_SNAPSHOT_VERSION,
} from '../../src/lib/appDataSnapshot'

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
})

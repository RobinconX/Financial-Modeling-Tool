import { beforeEach, describe, expect, it } from 'vitest'
import {
  corruptBackupKey,
  CORRUPT_BACKUP_PREFIX,
} from '../../src/lib/storageLoadRecovery'
import {
  loadPortfolioActuals,
  loadPortfolioActualsWithRecovery,
  PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY,
  PORTFOLIO_ACTUALS_KEY,
} from '../../src/lib/portfolioActualsStorage'
import { PORTFOLIO_STORAGE_KEY } from '../../src/lib/portfolioStorage'

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

describe('loadPortfolioActualsWithRecovery', () => {
  it('returns empty data when storage is unset', () => {
    const result = loadPortfolioActualsWithRecovery()
    expect(result.data).toMatchObject({ version: 1, currency: 'USD', byMonth: {} })
    expect(result.recovery).toBeNull()
  })

  it('archives corrupt JSON and exposes recovery notice', () => {
    const corrupt = '{not-json'
    store.set(PORTFOLIO_ACTUALS_KEY, corrupt)
    const result = loadPortfolioActualsWithRecovery()
    expect(result.data).toMatchObject({ byMonth: {} })
    expect(result.recovery).toMatchObject({
      storageKey: PORTFOLIO_ACTUALS_KEY,
      label: 'Portfolio actuals',
      reason: 'parse',
    })
    const backupKey = corruptBackupKey(PORTFOLIO_ACTUALS_KEY)
    expect(backupKey.startsWith(CORRUPT_BACKUP_PREFIX)).toBe(true)
    expect(store.get(backupKey)).toBe(corrupt)
    expect(store.get(PORTFOLIO_ACTUALS_KEY)).toBe(corrupt)
  })

  it('archives invalid shape without clearing the primary key', () => {
    const corrupt = JSON.stringify('not-an-object')
    store.set(PORTFOLIO_ACTUALS_KEY, corrupt)
    const result = loadPortfolioActualsWithRecovery()
    expect(result.recovery?.reason).toBe('shape')
    expect(store.get(corruptBackupKey(PORTFOLIO_ACTUALS_KEY))).toBe(corrupt)
  })

  it('archives content-corrupt byMonth payloads', () => {
    const corrupt = JSON.stringify({
      version: 1,
      currency: 'USD',
      byMonth: { '2024-13': 'not-a-number', 'bad-key': 1 },
    })
    store.set(PORTFOLIO_ACTUALS_KEY, corrupt)
    const result = loadPortfolioActualsWithRecovery()
    expect(result.recovery?.reason).toBe('content')
    expect(Object.keys(result.data.byMonth)).toHaveLength(0)
    expect(store.get(corruptBackupKey(PORTFOLIO_ACTUALS_KEY))).toBe(corrupt)
  })

  it('keeps valid shared actuals without recovery', () => {
    const valid = JSON.stringify({
      version: 1,
      currency: 'USD',
      byMonth: { '2024-06': 120_000 },
    })
    store.set(PORTFOLIO_ACTUALS_KEY, valid)
    const result = loadPortfolioActualsWithRecovery()
    expect(result.recovery).toBeNull()
    expect(result.data.byMonth['2024-06']).toBe(120_000)
  })

  it('flags corrupt per-portfolio actuals embedded in portfolio storage', () => {
    store.set(
      PORTFOLIO_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        portfolios: [
          {
            id: 'p1',
            name: 'Book',
            holdings: [],
            deposits: [],
            actions: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            actualsRecordStash: {
              actuals: { '2024-06': 'oops' },
              actualsCurrency: 'USD',
              moneyIn: { version: 1, currency: 'USD', byYear: {} },
            },
          },
        ],
        selectedId: 'p1',
      }),
    )
    const result = loadPortfolioActualsWithRecovery()
    expect(result.recovery).toMatchObject({
      storageKey: PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY,
      label: 'Portfolio actuals',
      reason: 'content',
    })
    expect(store.get(corruptBackupKey(PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY))).toBeTruthy()
  })

  it('prefers shared-store recovery over embedded when both are corrupt', () => {
    store.set(PORTFOLIO_ACTUALS_KEY, '{bad-json')
    store.set(
      PORTFOLIO_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        portfolios: [
          {
            id: 'p1',
            name: 'Book',
            holdings: [],
            deposits: [],
            actions: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            actuals: 'not-a-map',
          },
        ],
        selectedId: 'p1',
      }),
    )
    const result = loadPortfolioActualsWithRecovery()
    expect(result.recovery?.storageKey).toBe(PORTFOLIO_ACTUALS_KEY)
    expect(result.recovery?.reason).toBe('parse')
  })

  it('loadPortfolioActuals wrapper returns only data', () => {
    store.set(PORTFOLIO_ACTUALS_KEY, '{bad')
    expect(loadPortfolioActuals().byMonth).toEqual({})
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { withLinkedMirrorSuppressed } from '../../src/lib/linkedMirrorGate'
import { corruptBackupKey } from '../../src/lib/storageLoadRecovery'
import {
  loadPortfolios,
  loadPortfoliosWithRecovery,
  loadSelectedPortfolioId,
  PORTFOLIO_STORAGE_KEY,
  persistSelectedPortfolioId,
  savePortfolios,
} from '../../src/lib/portfolioStorage'
import { getOpeningCash, newPortfolio } from '../../src/lib/portfolio'

const LEGACY_SELECTED_PORTFOLIO_KEY = 'grok-lab-selected-portfolio'

function seedRawPortfolios(portfolios: unknown[], selectedId?: string | null): void {
  store.set(
    PORTFOLIO_STORAGE_KEY,
    JSON.stringify({ version: 1, portfolios, selectedId: selectedId ?? null }),
  )
}

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

function minimalPortfolio(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Main',
    holdings: [],
    deposits: [],
    actions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('portfolioStorage load normalization — holdings', () => {
  it('derives sharesHeld from legacy allocationDollars and manualCurrentPrice', () => {
    seedRawPortfolios([
      minimalPortfolio({
        holdings: [
          {
            id: 'h1',
            symbol: 'aapl',
            allocationDollars: 1500,
            manualCurrentPrice: 150,
          },
        ],
      }),
    ])
    const [p] = loadPortfolios()
    expect(p?.holdings[0]).toMatchObject({
      id: 'h1',
      symbol: 'AAPL',
      sharesHeld: 10,
      basis: 'easy',
    })
  })

  it('uses zero shares when legacy allocation has no usable price', () => {
    seedRawPortfolios([
      minimalPortfolio({
        holdings: [{ id: 'h1', symbol: 'MSFT', allocationDollars: 500 }],
      }),
    ])
    expect(loadPortfolios()[0]?.holdings[0]?.sharesHeld).toBe(0)
  })

  it('clamps negative sharesHeld for linked equity holdings', () => {
    seedRawPortfolios([
      minimalPortfolio({
        holdings: [{ id: 'h1', symbol: 'X', sharesHeld: -12, scenarioId: 's1' }],
      }),
    ])
    expect(loadPortfolios()[0]?.holdings[0]?.sharesHeld).toBe(0)
  })

  it('allows negative sharesHeld on manual-only positions', () => {
    seedRawPortfolios([
      minimalPortfolio({
        holdings: [{ id: 'h1', symbol: 'X', sharesHeld: -3, manualOnly: true }],
      }),
    ])
    expect(loadPortfolios()[0]?.holdings[0]?.sharesHeld).toBe(-3)
  })

  it('drops invalid year overrides and keeps valid ones', () => {
    seedRawPortfolios([
      minimalPortfolio({
        holdings: [
          {
            id: 'h1',
            symbol: 'Y',
            sharesHeld: 1,
            yearOverrides: [
              { year: 2028, valueDollars: 90 },
              { year: 0, valueDollars: 1 },
              { year: 2029, valueDollars: 'nope' },
              null,
            ],
          },
        ],
      }),
    ])
    expect(loadPortfolios()[0]?.holdings[0]?.yearOverrides).toEqual([
      { year: 2028, valueDollars: 90 },
    ])
  })

  it('skips non-object holdings', () => {
    seedRawPortfolios([minimalPortfolio({ holdings: ['bad', { id: 'h1', symbol: 'Z', sharesHeld: 2 }] })])
    expect(loadPortfolios()[0]?.holdings).toHaveLength(1)
  })
})

describe('portfolioStorage load normalization — legacy cash and deposits', () => {
  it('migrates cashByYear into sorted deposits when deposits array absent', () => {
    const { deposits: _omit, ...legacy } = minimalPortfolio({
      cashByYear: [
        { year: 2028, amount: 5000 },
        { year: 2026, amount: 2000 },
        { year: 2026, amount: -1 },
        { year: 0, amount: 99 },
      ],
    })
    void _omit
    seedRawPortfolios([legacy])
    const deps = loadPortfolios()[0]?.deposits.filter((d) => !d.isOpening) ?? []
    expect(deps.map((d) => ({ year: d.year, amount: d.amount }))).toEqual([
      { year: 2026, amount: 2000 },
      { year: 2028, amount: 5000 },
    ])
  })

  it('uses deposits array and ignores cashByYear when both are present', () => {
    seedRawPortfolios([
      minimalPortfolio({
        deposits: [{ id: 'd1', year: 2027, amount: 100 }],
        cashByYear: [{ year: 2030, amount: 9999 }],
      }),
    ])
    const deps = loadPortfolios()[0]?.deposits.filter((d) => !d.isOpening) ?? []
    expect(deps).toHaveLength(1)
    expect(deps[0]?.year).toBe(2027)
  })

  it('folds legacy cashDollars into an opening deposit and zeros currentCash', () => {
    seedRawPortfolios([minimalPortfolio({ cashDollars: 25_000 })])
    const p = loadPortfolios()[0]
    expect(p?.currentCash).toBe(0)
    expect(getOpeningCash(p!)).toBe(25_000)
  })

  it('reads currentCash when set and clamps negatives to zero', () => {
    seedRawPortfolios([minimalPortfolio({ currentCash: -100, cashDollars: 500 })])
    const p = loadPortfolios()[0]
    expect(getOpeningCash(p!)).toBe(0)
  })

  it('prefers currentCash over cashDollars for opening cash', () => {
    seedRawPortfolios([minimalPortfolio({ currentCash: 800, cashDollars: 12_000 })])
    expect(getOpeningCash(loadPortfolios()[0]!)).toBe(800)
  })
})

describe('portfolioStorage load normalization — portfolio envelope', () => {
  it('drops portfolios missing id or name', () => {
    seedRawPortfolios([
      minimalPortfolio(),
      { id: 'x', holdings: [] },
      { name: 'Orphan', holdings: [] },
      minimalPortfolio({ id: 'p2', name: '  ' }),
    ])
    const loaded = loadPortfolios()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.id).toBe('p1')
  })

  it('trims portfolio name', () => {
    seedRawPortfolios([minimalPortfolio({ name: '  Trim me  ' })])
    expect(loadPortfolios()[0]?.name).toBe('Trim me')
  })

  it('returns empty list for invalid or missing payload', () => {
    expect(loadPortfolios()).toEqual([])
    store.set(PORTFOLIO_STORAGE_KEY, '{not json')
    expect(loadPortfolios()).toEqual([])
    store.set(PORTFOLIO_STORAGE_KEY, JSON.stringify({ version: 1, foo: 1 }))
    expect(loadPortfolios()).toEqual([])
  })

  it('archives corrupt portfolio payloads for recovery', () => {
    const corrupt = '{not json'
    store.set(PORTFOLIO_STORAGE_KEY, corrupt)
    const result = loadPortfoliosWithRecovery()
    expect(result.data).toEqual([])
    expect(result.recovery).toMatchObject({
      storageKey: PORTFOLIO_STORAGE_KEY,
      label: 'Portfolio',
      reason: 'parse',
    })
    expect(store.get(corruptBackupKey(PORTFOLIO_STORAGE_KEY))).toBe(corrupt)
    expect(store.get(PORTFOLIO_STORAGE_KEY)).toBe(corrupt)
  })

  it('treats non-array holdings as empty', () => {
    seedRawPortfolios([minimalPortfolio({ holdings: { bad: true } })])
    expect(loadPortfolios()[0]?.holdings).toEqual([])
  })
})

describe('portfolioStorage save and load', () => {
  it('round-trips a normalized portfolio through localStorage', () => {
    const created = newPortfolio('Round trip')
    withLinkedMirrorSuppressed(() => {
      expect(savePortfolios([created], created.id).ok).toBe(true)
    })
    const [loaded] = loadPortfolios()
    expect(loaded).toMatchObject({
      id: created.id,
      name: created.name,
      holdings: [],
      actions: [],
    })
    expect(loaded?.deposits.length).toBeGreaterThanOrEqual(1)
    expect(loaded?.deposits.some((d) => d.isOpening)).toBe(true)
  })

  it('persists selected portfolio id in the payload', () => {
    const p = newPortfolio('Sel')
    withLinkedMirrorSuppressed(() => savePortfolios([p], p.id))
    expect(loadSelectedPortfolioId()).toBe(p.id)
    const raw = JSON.parse(store.get(PORTFOLIO_STORAGE_KEY)!)
    expect(raw.selectedId).toBe(p.id)
  })

  it('falls back to legacy selected-portfolio key when payload lacks selectedId', () => {
    store.set(LEGACY_SELECTED_PORTFOLIO_KEY, 'legacy-id')
    seedRawPortfolios([minimalPortfolio()], null)
    expect(loadSelectedPortfolioId()).toBe('legacy-id')
  })

  it('persistSelectedPortfolioId updates selection without dropping portfolios', () => {
    const a = newPortfolio('A')
    const b = newPortfolio('B')
    withLinkedMirrorSuppressed(() => {
      savePortfolios([a, b], a.id)
      expect(persistSelectedPortfolioId(b.id)).toBe(true)
    })
    expect(loadSelectedPortfolioId()).toBe(b.id)
    expect(loadPortfolios()).toHaveLength(2)
  })
})

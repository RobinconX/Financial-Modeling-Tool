import { describe, expect, it } from 'vitest'
import {
  cashAtYear,
  cashFromDeposits,
  clonePortfolio,
  getOpeningCash,
  newAction,
  newHolding,
  newOpeningDeposit,
  newPortfolio,
  normalizePortfolioCashModel,
  resolveDepositAmount,
  sharesAtYear,
  withResolvedDepositAmounts,
} from '../../src/lib/portfolio'
import type {
  CashflowLine,
  PortfolioAction,
  PortfolioHolding,
  SavedPortfolio,
} from '../../src/types'

function basePortfolio(overrides: Partial<SavedPortfolio> = {}): SavedPortfolio {
  const now = new Date().toISOString()
  return {
    id: 'p1',
    name: 'Test',
    currentCash: 0,
    deposits: [newOpeningDeposit(10_000, 2026)],
    actions: [],
    holdings: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('sharesAtYear', () => {
  const holding: PortfolioHolding = {
    ...newHolding('AAPL'),
    id: 'h1',
    sharesHeld: 100,
  }

  it('starts from shares held', () => {
    expect(sharesAtYear(holding, [], 2026)).toBe(100)
  })

  it('applies buys and sells through year', () => {
    const actions: PortfolioAction[] = [
      { id: '1', type: 'buy', holdingId: 'h1', year: 2027, shares: 20 },
      { id: '2', type: 'sell', holdingId: 'h1', year: 2028, shares: 30 },
      { id: '3', type: 'buy', holdingId: 'other', year: 2027, shares: 99 },
    ]
    expect(sharesAtYear(holding, actions, 2026)).toBe(100)
    expect(sharesAtYear(holding, actions, 2027)).toBe(120)
    expect(sharesAtYear(holding, actions, 2028)).toBe(90)
  })
})

describe('opening cash and deposits', () => {
  it('reads opening cash from isOpening deposit', () => {
    const p = basePortfolio()
    expect(getOpeningCash(p)).toBe(10_000)
  })

  it('falls back to legacy currentCash when no opening row', () => {
    const p = basePortfolio({
      currentCash: 5_000,
      deposits: [{ id: 'd1', year: 2027, amount: 1000 }],
    })
    expect(getOpeningCash(p)).toBe(5_000)
  })

  it('sums deposits through year including opening', () => {
    const p = basePortfolio({
      deposits: [
        newOpeningDeposit(10_000, 2026),
        { id: 'd2', year: 2027, amount: 2_000 },
        { id: 'd3', year: 2028, amount: 3_000 },
      ],
    })
    expect(cashFromDeposits(p, 2026)).toBe(10_000)
    expect(cashFromDeposits(p, 2027)).toBe(12_000)
    expect(cashFromDeposits(p, 2028)).toBe(15_000)
  })
})

describe('normalizePortfolioCashModel', () => {
  it('creates opening deposit from currentCash and zeros currentCash', () => {
    const p = basePortfolio({
      currentCash: 7_500,
      deposits: [],
    })
    const n = normalizePortfolioCashModel(p)
    expect(n.currentCash).toBe(0)
    expect(n.deposits.some((d) => d.isOpening)).toBe(true)
    expect(getOpeningCash(n)).toBe(7_500)
  })

  it('ensures exactly one opening flag', () => {
    const p = basePortfolio({
      deposits: [
        { id: 'a', year: 2026, amount: 1, isOpening: true },
        { id: 'b', year: 2026, amount: 2, isOpening: true },
      ],
    })
    const n = normalizePortfolioCashModel(p)
    expect(n.deposits.filter((d) => d.isOpening)).toHaveLength(1)
  })
})

describe('cashAtYear with actions', () => {
  it('reduces cash on buy using trade price', () => {
    const holding: PortfolioHolding = {
      ...newHolding('AAA'),
      id: 'h1',
      sharesHeld: 10,
      manualCurrentPrice: 50,
    }
    const p = basePortfolio({
      holdings: [holding],
      deposits: [newOpeningDeposit(1_000, 2026)],
      actions: [newAction('buy', 'h1', 2026)].map((a) => ({ ...a, shares: 2 })),
    })
    // buy 2 * $50 = $100
    expect(cashAtYear(p, 2026, [], 2026)).toBe(900)
  })
})

describe('clonePortfolio', () => {
  it('deep-clones with new ids and remapped actions', () => {
    const holding = { ...newHolding('MSFT'), id: 'hold-old', sharesHeld: 5 }
    const source = basePortfolio({
      name: 'Original',
      holdings: [holding],
      actions: [{ id: 'act-old', type: 'buy', holdingId: 'hold-old', year: 2028, shares: 1 }],
    })
    const copy = clonePortfolio(source, 'Copy name')
    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe('Copy name')
    expect(copy.holdings[0].id).not.toBe('hold-old')
    expect(copy.holdings[0].symbol).toBe('MSFT')
    expect(copy.actions[0].holdingId).toBe(copy.holdings[0].id)
    expect(copy.actions[0].id).not.toBe('act-old')
  })

  it('is independent from source after clone', () => {
    const source = newPortfolio('A')
    const copy = clonePortfolio(source, 'B')
    copy.deposits[0].amount = 99
    expect(source.deposits[0].amount).not.toBe(99)
  })

  it('copies surplus deposit fields', () => {
    const source = basePortfolio({
      deposits: [
        newOpeningDeposit(0, 2026),
        {
          id: 'd1',
          year: 2027,
          amount: 0,
          source: 'surplus',
          surplusScenarioId: 'sc-1',
          surplusPercent: 40,
        },
      ],
    })
    const copy = clonePortfolio(source, 'Copy')
    const surplus = copy.deposits.find((d) => d.source === 'surplus')
    expect(surplus).toBeTruthy()
    expect(surplus!.surplusScenarioId).toBe('sc-1')
    expect(surplus!.surplusPercent).toBe(40)
  })
})

describe('surplus-linked deposits', () => {
  const lines: CashflowLine[] = [
    {
      id: 'i1',
      scenarioId: 'sc-1',
      kind: 'income',
      name: 'Salary',
      cadence: 'recurring',
      yearlyAmount: 120_000,
    },
    {
      id: 'c1',
      scenarioId: 'sc-1',
      kind: 'cost',
      name: 'Rent',
      cadence: 'recurring',
      yearlyAmount: 40_000,
    },
  ]

  it('resolveDepositAmount uses % of positive surplus (CHF→USD)', () => {
    // surplus 80_000 CHF, 25% = 20_000 CHF; rate 0.8 CHF/USD → 25_000 USD
    const amount = resolveDepositAmount(
      {
        id: 'd',
        year: 2027,
        amount: 0,
        source: 'surplus',
        surplusScenarioId: 'sc-1',
        surplusPercent: 25,
      },
      { incomeCostLines: lines, usdToChf: 0.8 },
    )
    expect(amount).toBeCloseTo(20_000 / 0.8, 6)
  })

  it('surplus ignores negative net (no deposit)', () => {
    const deficitLines: CashflowLine[] = [
      {
        id: 'i1',
        scenarioId: 'sc-1',
        kind: 'income',
        name: 'Job',
        cadence: 'recurring',
        yearlyAmount: 10_000,
      },
      {
        id: 'c1',
        scenarioId: 'sc-1',
        kind: 'cost',
        name: 'Life',
        cadence: 'recurring',
        yearlyAmount: 50_000,
      },
    ]
    const amount = resolveDepositAmount(
      {
        id: 'd',
        year: 2027,
        amount: 999,
        source: 'surplus',
        surplusScenarioId: 'sc-1',
        surplusPercent: 100,
      },
      { incomeCostLines: deficitLines, usdToChf: 0.9 },
    )
    expect(amount).toBe(0)
  })

  it('withResolvedDepositAmounts feeds cashFromDeposits', () => {
    const p = basePortfolio({
      deposits: [
        newOpeningDeposit(0, 2026),
        {
          id: 'd2',
          year: 2027,
          amount: 0,
          source: 'surplus',
          surplusScenarioId: 'sc-1',
          surplusPercent: 50,
        },
      ],
    })
    // 80k * 50% = 40k CHF / 0.8 = 50k USD
    const resolved = withResolvedDepositAmounts(p, {
      incomeCostLines: lines,
      usdToChf: 0.8,
    })
    expect(cashFromDeposits(resolved, 2027)).toBeCloseTo(50_000, 6)
  })
})

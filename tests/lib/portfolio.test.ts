import { describe, expect, it } from 'vitest'
import {
  buildPortfolioGrid,
  cashAtYear,
  cashFromDeposits,
  clonePortfolio,
  applyPortfolioValuesToTarget,
  compoundWithGrowthAndDeposits,
  computeHoldingValues,
  getOpeningCash,
  getPerpetualGrowthRate,
  getScenarioSharePriceByYear,
  holdingValueAtYear,
  newAction,
  newHolding,
  newOpeningDeposit,
  newPortfolio,
  normalizePortfolioCashModel,
  portfolioTotalUsdAtYear,
  resolveDepositAmount,
  sharesAtYear,
  withResolvedDepositAmounts,
} from '../../src/lib/portfolio'
import { portfolioTotalUsdAtYear as overviewPortfolioTotalUsdAtYear } from '../../src/lib/overview'
import type {
  CashflowLine,
  PortfolioAction,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
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

  it('adds perpetual yearly amount after last explicit deposit', () => {
    const p = basePortfolio({
      deposits: [
        newOpeningDeposit(10_000, 2026),
        { id: 'd2', year: 2027, amount: 2_000 },
      ],
      perpetualYearlyDeposit: { amount: 1_000, source: 'fixed' },
    })
    // last explicit = 2027
    expect(cashFromDeposits(p, 2027)).toBe(12_000)
    expect(cashFromDeposits(p, 2028)).toBe(13_000) // +1k
    expect(cashFromDeposits(p, 2030)).toBe(15_000) // +1k × 3
  })
})

describe('perpetual growth after last projection', () => {
  it('extends grid totals with compound growth', () => {
    const p = basePortfolio({
      deposits: [newOpeningDeposit(10_000, 2026)],
      holdings: [],
      perpetualGrowthPercent: 10,
    })
    expect(getPerpetualGrowthRate(p)).toBe(10)
    // Default: inputs only
    const base = buildPortfolioGrid(p, [], 2026)
    expect(base.years).toEqual([2026])
    // Extend period to see growth
    const grid = buildPortfolioGrid(p, [], 2026, { throughYear: 2028 })
    expect(grid.years).toContain(2026)
    expect(grid.years).toContain(2028)
    const totalIdx = grid.rows.findIndex((r) => r.kind === 'total')
    const growthIdx = grid.rows.findIndex((r) => r.kind === 'growth')
    const i2026 = grid.years.indexOf(2026)
    const i2027 = grid.years.indexOf(2027)
    const i2028 = grid.years.indexOf(2028)
    expect(grid.rows[totalIdx]!.values[i2026]).toBe(10_000)
    expect(grid.rows[totalIdx]!.values[i2027]).toBeCloseTo(11_000, 6)
    expect(grid.rows[totalIdx]!.values[i2028]).toBeCloseTo(12_100, 6)
    expect(grid.rows[growthIdx]!.values[i2027]).toBeCloseTo(11_000, 6)
    // Equity/cash empty on growth years
    const cashIdx = grid.rows.findIndex((r) => r.kind === 'cash')
    expect(grid.rows[cashIdx]!.values[i2027]).toBe(0)
  })

  it('stacks perpetual yearly deposit with growth rate', () => {
    const p = basePortfolio({
      deposits: [newOpeningDeposit(10_000, 2026)],
      holdings: [],
      perpetualGrowthPercent: 10,
      perpetualYearlyDeposit: { amount: 1_000, source: 'fixed' },
    })
    // 2027: 10000 * 1.1 + 1000 = 12000
    // 2028: 12000 * 1.1 + 1000 = 14200
    expect(compoundWithGrowthAndDeposits(10_000, 2026, 2027, 10, p)).toBeCloseTo(12_000, 6)
    expect(compoundWithGrowthAndDeposits(10_000, 2026, 2028, 10, p)).toBeCloseTo(14_200, 6)

    const grid = buildPortfolioGrid(p, [], 2026, { throughYear: 2028 })
    const totalIdx = grid.rows.findIndex((r) => r.kind === 'total')
    const i2027 = grid.years.indexOf(2027)
    const i2028 = grid.years.indexOf(2028)
    expect(grid.rows[totalIdx]!.values[i2027]).toBeCloseTo(12_000, 6)
    expect(grid.rows[totalIdx]!.values[i2028]).toBeCloseTo(14_200, 6)
  })
})

describe('scenario projection share prices on portfolio', () => {
  function scenario(overrides: Partial<SavedScenario> = {}): SavedScenario {
    const now = new Date().toISOString()
    return {
      id: 'sc1',
      symbol: 'AAA',
      name: 'Base case',
      companyName: 'AAA Inc',
      currency: 'USD',
      currentPrice: 10,
      currentMarketCap: 1_000_000,
      sharesOutstanding: null, // often missing from quotes — must derive
      mcapOverride: null,
      easyRows: [
        {
          id: 'e1',
          year: 2027,
          projectedMarketCap: 2_000_000,
        },
        {
          id: 'e2',
          year: 2030,
          projectedMarketCap: 4_000_000,
        },
      ],
      advancedRows: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
  }

  it('derives shares from mcap/price so projection years get prices', () => {
    const sc = scenario()
    const prices = getScenarioSharePriceByYear(sc, 'easy', 2026)
    // shares = 1e6 / 10 = 100_000
    expect(prices.get(2027)).toBeCloseTo(20, 6) // 2e6 / 1e5
    expect(prices.get(2030)).toBeCloseTo(40, 6)
  })

  it('shows holding values for 2027 and 2030 on the grid', () => {
    const sc = scenario()
    const holding: PortfolioHolding = {
      ...newHolding('AAA'),
      id: 'h1',
      sharesHeld: 100,
      scenarioId: sc.id,
      basis: 'easy',
      manualCurrentPrice: null,
    }
    const p = basePortfolio({
      deposits: [newOpeningDeposit(0, 2026)],
      holdings: [holding],
    })
    const values = computeHoldingValues(holding, sc, [], 2026)
    expect(values.get(2027)).toBeCloseTo(2_000, 6) // 100 * $20
    expect(values.get(2030)).toBeCloseTo(4_000, 6)

    const grid = buildPortfolioGrid(p, [sc], 2026)
    expect(grid.years).toContain(2027)
    expect(grid.years).toContain(2030)
    const eq = grid.rows.find((r) => r.kind === 'equity')!
    const i2027 = grid.years.indexOf(2027)
    const i2030 = grid.years.indexOf(2030)
    expect(eq.values[i2027]).toBeCloseTo(2_000, 6)
    expect(eq.values[i2030]).toBeCloseTo(4_000, 6)
  })

  it('uses advanced projections when holding basis is easy but only advanced is filled', () => {
    const sc = scenario({
      easyRows: [{ id: 'e0', year: 2030, projectedMarketCap: null }],
      advancedRows: [
        {
          id: 'a1',
          year: 2027,
          dilutionFactor: 1,
          revenue: 100_000,
          psMultiple: 20, // mcap 2e6
          fcf: null,
          pfcfMultiple: null,
          profit: null,
          peMultiple: null,
        },
        {
          id: 'a2',
          year: 2030,
          dilutionFactor: 1,
          revenue: 200_000,
          psMultiple: 20, // mcap 4e6
          fcf: null,
          pfcfMultiple: null,
          profit: null,
          peMultiple: null,
        },
      ],
    })
    const holding: PortfolioHolding = {
      ...newHolding('AAA'),
      id: 'h1',
      sharesHeld: 100,
      scenarioId: sc.id,
      basis: 'easy', // default — must fall back to ps
      manualCurrentPrice: null,
    }
    const values = computeHoldingValues(holding, sc, [], 2026)
    expect(values.get(2027)).toBeCloseTo(2_000, 6)
    expect(values.get(2030)).toBeCloseTo(4_000, 6)

    const grid = buildPortfolioGrid(
      basePortfolio({
        deposits: [newOpeningDeposit(0, 2026)],
        holdings: [holding],
      }),
      [sc],
      2026,
    )
    const eq = grid.rows.find((r) => r.kind === 'equity')!
    expect(eq.values[grid.years.indexOf(2027)]).toBeCloseTo(2_000, 6)
    expect(eq.values[grid.years.indexOf(2030)]).toBeCloseTo(4_000, 6)
  })

  it('values easy projections with only price+mcap (no shares outstanding)', () => {
    const sc = scenario({
      sharesOutstanding: null,
      currentPrice: 50,
      currentMarketCap: 5_000_000,
      easyRows: [{ id: 'e1', year: 2028, projectedMarketCap: 10_000_000 }],
    })
    // px = 50 * (10e6 / 5e6) = 100; 10 shares → 1000
    const holding: PortfolioHolding = {
      ...newHolding('AAA'),
      id: 'h1',
      sharesHeld: 10,
      scenarioId: sc.id,
      basis: 'easy',
    }
    const values = computeHoldingValues(holding, sc, [], 2026)
    expect(values.get(2028)).toBeCloseTo(1_000, 6)
  })

  it('carries last known equity value across intermediate stated years', () => {
    const sc = scenario({
      easyRows: [{ id: 'e1', year: 2030, projectedMarketCap: 2_000_000 }],
    })
    const holding: PortfolioHolding = {
      ...newHolding('AAA'),
      id: 'h1',
      sharesHeld: 100,
      scenarioId: sc.id,
      basis: 'easy',
      manualCurrentPrice: 10,
    }
    const p = basePortfolio({
      deposits: [
        newOpeningDeposit(0, 2026),
        { id: 'd2', year: 2028, amount: 100 }, // creates intermediate year column
      ],
      holdings: [holding],
    })
    const grid = buildPortfolioGrid(p, [sc], 2026)
    const eq = grid.rows.find((r) => r.kind === 'equity')!
    // 2026 live: 100 * 10 = 1000, carried to 2028; 2030 jumps to 2000
    expect(eq.values[grid.years.indexOf(2026)]).toBeCloseTo(1_000, 6)
    expect(eq.values[grid.years.indexOf(2028)]).toBeCloseTo(1_000, 6)
    expect(eq.values[grid.years.indexOf(2030)]).toBeCloseTo(2_000, 6)
    // holdingValueAtYear matches for intermediate year not in sparse map
    expect(holdingValueAtYear(holding, sc, [], 2028, 2026)).toBeCloseTo(1_000, 6)
  })
})

describe('portfolio vs overview totals match', () => {
  it('grid totals equal portfolioTotalUsdAtYear and overview for every year', () => {
    const now = new Date().toISOString()
    const sc: SavedScenario = {
      id: 'sc1',
      symbol: 'AAA',
      name: 'Base',
      companyName: null,
      currency: 'USD',
      currentPrice: 10,
      currentMarketCap: 1_000_000,
      sharesOutstanding: 100_000,
      mcapOverride: null,
      easyRows: [
        { id: 'e1', year: 2027, projectedMarketCap: 2_000_000 },
        { id: 'e2', year: 2030, projectedMarketCap: 4_000_000 },
      ],
      advancedRows: [],
      createdAt: now,
      updatedAt: now,
    }
    const holding: PortfolioHolding = {
      ...newHolding('AAA'),
      id: 'h1',
      sharesHeld: 100,
      scenarioId: sc.id,
      basis: 'easy',
    }
    const p = basePortfolio({
      deposits: [
        newOpeningDeposit(5_000, 2026),
        { id: 'd2', year: 2028, amount: 500 },
      ],
      holdings: [holding],
      perpetualGrowthPercent: 8,
      perpetualYearlyDeposit: { amount: 200, source: 'fixed' },
    })
    const grid = buildPortfolioGrid(p, [sc], 2026, { throughYear: 2032 })
    for (let i = 0; i < grid.years.length; i++) {
      const y = grid.years[i]!
      const fromFn = portfolioTotalUsdAtYear(p, [sc], y, 2026)
      const fromOverview = overviewPortfolioTotalUsdAtYear(p, [sc], y, null, 2026)
      expect(grid.totals[i], `grid ${y}`).toBeCloseTo(fromFn, 6)
      expect(fromOverview, `overview ${y}`).toBeCloseTo(fromFn, 6)
    }
    // Intermediate year 2029 (between 2028 deposit and 2030 proj) must carry equity
    const t2029 = portfolioTotalUsdAtYear(p, [sc], 2029, 2026)
    const cash2029 = cashAtYear(p, 2029, [sc], 2026)
    // equity carried from 2027 (100 * $20 = 2000) until 2030
    expect(t2029).toBeCloseTo(cash2029 + 2_000, 6)
  })
})

describe('CHF fixed deposits do not bake FX into stored amount', () => {
  it('resolveDepositAmount converts CHF→USD only at resolve time', () => {
    const d = {
      id: 'd1',
      year: 2026,
      amount: 900,
      currency: 'CHF' as const,
      isOpening: true,
    }
    expect(resolveDepositAmount(d, { incomeCostLines: [], usdToChf: 0.9 })).toBeCloseTo(1000)
    expect(resolveDepositAmount(d, { incomeCostLines: [], usdToChf: 0.8 })).toBeCloseTo(1125)
    // Stored amount unchanged
    expect(d.amount).toBe(900)
  })

  it('withResolvedDepositAmounts uses FX for CHF cash math', () => {
    const p = basePortfolio({
      deposits: [newOpeningDeposit(900, 2026)].map((d) => ({
        ...d,
        currency: 'CHF' as const,
      })),
    })
    const resolved = withResolvedDepositAmounts(p, {
      incomeCostLines: [],
      usdToChf: 0.9,
    })
    expect(getOpeningCash(resolved)).toBeCloseTo(1000)
    // Source portfolio still CHF nominal
    expect(getOpeningCash(p)).toBe(900)
  })
})

describe('applyPortfolioValuesToTarget', () => {
  it('cash-only leaves holdings unchanged', () => {
    const srcHold = { ...newHolding('AAA'), id: 's1', sharesHeld: 42 }
    const tgtHold = { ...newHolding('AAA'), id: 't1', sharesHeld: 1 }
    const source = basePortfolio({
      deposits: [{ ...newOpeningDeposit(5_000, 2026), currency: 'CHF' }],
      holdings: [srcHold],
      perpetualYearlyDeposit: { amount: 100, currency: 'CHF', source: 'fixed' },
    })
    const target = basePortfolio({
      id: 'p2',
      name: 'Other',
      deposits: [newOpeningDeposit(10, 2026)],
      holdings: [tgtHold],
    })
    const next = applyPortfolioValuesToTarget(source, target, { cash: true })
    expect(getOpeningCash(next)).toBe(5_000)
    expect(next.deposits.find((d) => d.isOpening)?.currency).toBe('CHF')
    expect(next.holdings.find((h) => h.symbol === 'AAA')?.sharesHeld).toBe(1)
    expect(next.perpetualYearlyDeposit?.amount).toBe(100)
    expect(next.id).toBe('p2')
  })

  it('holdings-only copies shares; optional actions remapped by symbol', () => {
    const srcHold = { ...newHolding('AAA'), id: 's1', sharesHeld: 42 }
    const tgtHold = { ...newHolding('AAA'), id: 't1', sharesHeld: 1 }
    const otherHold = { ...newHolding('BBB'), id: 't2', sharesHeld: 9 }
    const source = basePortfolio({
      deposits: [newOpeningDeposit(1, 2026)],
      holdings: [srcHold],
      actions: [
        {
          id: 'a1',
          type: 'buy',
          holdingId: 's1',
          year: 2028,
          shares: 5,
          price: 12,
        },
      ],
    })
    const target = basePortfolio({
      id: 'p2',
      name: 'Other',
      deposits: [newOpeningDeposit(99, 2026)],
      holdings: [tgtHold, otherHold],
      actions: [
        {
          id: 'old',
          type: 'sell',
          holdingId: 't1',
          year: 2027,
          shares: 1,
        },
        {
          id: 'keep',
          type: 'buy',
          holdingId: 't2',
          year: 2029,
          shares: 2,
        },
      ],
    })
    const stocksOnly = applyPortfolioValuesToTarget(source, target, {
      holdings: true,
    })
    expect(getOpeningCash(stocksOnly)).toBe(99)
    expect(stocksOnly.holdings.find((h) => h.symbol === 'AAA')?.sharesHeld).toBe(42)
    expect(stocksOnly.holdings.find((h) => h.symbol === 'BBB')?.sharesHeld).toBe(9)
    // actions unchanged when not requested
    expect(stocksOnly.actions).toHaveLength(2)

    const withActions = applyPortfolioValuesToTarget(source, target, {
      holdings: true,
      actions: true,
    })
    expect(withActions.holdings.find((h) => h.symbol === 'AAA')?.sharesHeld).toBe(42)
    // BBB action kept; AAA old sell replaced by source buy remapped to t1
    expect(withActions.actions.some((a) => a.holdingId === 't2' && a.shares === 2)).toBe(true)
    const aaaActs = withActions.actions.filter((a) => a.holdingId === 't1')
    expect(aaaActs).toHaveLength(1)
    expect(aaaActs[0]!.type).toBe('buy')
    expect(aaaActs[0]!.shares).toBe(5)
    expect(aaaActs[0]!.price).toBe(12)
    expect(aaaActs[0]!.id).not.toBe('a1')
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

  it('uses explicit action price over live/scenario price', () => {
    const holding: PortfolioHolding = {
      ...newHolding('AAA'),
      id: 'h1',
      sharesHeld: 10,
      manualCurrentPrice: 50,
    }
    const p = basePortfolio({
      holdings: [holding],
      deposits: [newOpeningDeposit(1_000, 2026)],
      actions: [
        {
          ...newAction('buy', 'h1', 2027),
          shares: 2,
          price: 25, // override — not 50
        },
      ],
    })
    // buy 2 * $25 = $50; opening still 1000
    expect(cashAtYear(p, 2027, [], 2026)).toBe(950)
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

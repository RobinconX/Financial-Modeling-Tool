import { describe, expect, it } from 'vitest'
import {
  defaultRunwayConfig,
  defaultRunwayPeriod,
  normalizeRunwayConfig,
  periodForYear,
  runwayIncomeDrawForYear,
  addSurplusToLeftover,
  buildRunwayChartRows,
  buildRunwayModel,
  growLeftoverByRate,
  periodAddsICsurplus,
  resolveRunwayDrawOrder,
  runwayDrawnFromRow,
  seriesDrawLocked,
  stepRunwayLeftoverPile,
  takeFromAssets,
} from '../../src/lib/runway'
import { residualCashValueAtYear, seriesValueChf } from '../../src/lib/overview'
import type { CashflowLine, OverviewSeries, SavingsAccount } from '../../src/types'

function series(partial: Partial<OverviewSeries> & Pick<OverviewSeries, 'id' | 'type'>): OverviewSeries {
  return {
    name: partial.name ?? partial.id,
    enabled: true,
    sortOrder: partial.sortOrder ?? 0,
    ...partial,
  }
}

const lines: CashflowLine[] = [
  {
    id: 'i',
    scenarioId: 'sc',
    kind: 'income',
    name: 'Salary',
    cadence: 'recurring',
    yearlyAmount: 100_000,
  },
  {
    id: 'c',
    scenarioId: 'sc',
    kind: 'cost',
    name: 'Rent',
    cadence: 'recurring',
    yearlyAmount: 30_000,
  },
]

describe('runway periods', () => {
  it('migrates a legacy single-block config', () => {
    const cfg = normalizeRunwayConfig({
      incomeSource: 'scenario',
      incomeCostScenarioId: 'sc',
      drawMode: 'percent',
      drawPercent: 80,
    })
    expect(cfg.periods).toHaveLength(1)
    expect(cfg.periods[0]!.mode).toBe('ic-income')
    expect(cfg.periods[0]!.incomeCostScenarioId).toBe('sc')
    expect(runwayIncomeDrawForYear(cfg, 2026, lines)).toEqual({
      income: 100_000,
      draw: 80_000,
    })
  })

  it('uses keep-I/C income and costs', () => {
    const cfg = normalizeRunwayConfig({
      periods: [{ startYear: 2030, mode: 'ic-keep', incomeCostScenarioId: 'sc' }],
    })
    expect(runwayIncomeDrawForYear(cfg, 2030, lines)).toEqual({
      income: 100_000,
      draw: 30_000,
    })
  })

  it('picks the last period whose startYear is ≤ the chart year', () => {
    const cfg = {
      periods: [
        { ...defaultRunwayPeriod(2026), manualIncomeChf: 10, drawMode: 'fixed' as const, drawFixedChf: 8 },
        { ...defaultRunwayPeriod(2035), manualIncomeChf: 50, drawMode: 'fixed' as const, drawFixedChf: 40 },
      ],
    }
    expect(periodForYear(cfg, 2026).startYear).toBe(2026)
    expect(periodForYear(cfg, 2034).startYear).toBe(2026)
    expect(periodForYear(cfg, 2035).startYear).toBe(2035)
    expect(runwayIncomeDrawForYear(cfg, 2036, [])).toEqual({ income: 50, draw: 40 })
  })

  it('does not apply a future I/C period before its From year', () => {
    const cfg = normalizeRunwayConfig({
      periods: [{ startYear: 2035, mode: 'ic-keep', incomeCostScenarioId: 'sc' }],
    })
    expect(periodForYear(cfg, 2026).mode).toBe('manual')
    expect(runwayIncomeDrawForYear(cfg, 2026, lines)).toEqual({ income: 0, draw: 0 })
    expect(runwayIncomeDrawForYear(cfg, 2034, lines)).toEqual({ income: 0, draw: 0 })
    expect(runwayIncomeDrawForYear(cfg, 2035, lines)).toEqual({
      income: 100_000,
      draw: 30_000,
    })
  })
})

describe('takeFromAssets', () => {
  it('drains cash, then other savings, then portfolio', () => {
    const cash: SavingsAccount = {
      id: 'cash',
      name: 'Cash',
      role: 'cash',
      actuals: {},
      contribution: 0,
      cadence: 'monthly',
      annualRatePercent: 0,
      sortOrder: 0,
    }
    const pension: SavingsAccount = {
      id: 'pen',
      name: 'Pension',
      actuals: {},
      contribution: 0,
      cadence: 'yearly',
      annualRatePercent: 0,
      sortOrder: 1,
    }
    const list = [
      series({ id: 'p', type: 'portfolio', sortOrder: 0 }),
      series({ id: 's', type: 'savings', savingsAccountId: 'pen', sortOrder: 1 }),
      series({ id: 'c', type: 'savings', savingsAccountId: 'cash', sortOrder: 2 }),
      series({ id: 'l', type: 'incomeLeftover', sortOrder: 3 }),
    ]
    const balances = new Map([
      ['p', 50_000],
      ['s', 20_000],
      ['c', 10_000],
      ['l', 8_000],
    ])
    const taken = takeFromAssets(balances, list, [cash, pension], 25_000)
    expect(taken).toBe(25_000)
    expect(balances.get('l')).toBe(0)
    expect(balances.get('c')).toBe(0)
    expect(balances.get('s')).toBe(13_000)
    expect(balances.get('p')).toBe(50_000)
  })

  it('adds surplus onto leftover cash', () => {
    const leftover = series({ id: 'l', type: 'incomeLeftover' })
    const balances = new Map([['l', 5_000]])
    expect(addSurplusToLeftover(balances, [leftover], 12_000)).toBe(12_000)
    expect(balances.get('l')).toBe(17_000)
  })
})

describe('leftover surplus timing', () => {
  it('only I/C periods add surplus', () => {
    expect(periodAddsICsurplus('manual')).toBe(false)
    expect(periodAddsICsurplus('ic-income')).toBe(true)
    expect(periodAddsICsurplus('ic-keep')).toBe(true)
  })

  it('grows leftover by rate only, not by Overview leftover additions', () => {
    const leftover = series({
      id: 'l',
      type: 'incomeLeftover',
      annualRatePercent: 10,
      compoundUntilYear: null,
    })
    expect(growLeftoverByRate(10_000, leftover, 2026, 2027, 2026)).toBeCloseTo(11_000)
    expect(growLeftoverByRate(10_000, leftover, 'now', 2026, 2026)).toBeCloseTo(11_000)
  })

  it('steps the runway leftover pile by the Overview leftover delta', () => {
    const leftover = series({
      id: 'l',
      type: 'incomeLeftover',
      baseChf: 10_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 5_000,
      contributeUntilYear: 2028,
      yearBindings: [],
    })
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: lines,
      usdToChf: 0.9,
      asOf: new Date(2026, 6, 15),
      overviewSeries: [leftover],
    }
    expect(stepRunwayLeftoverPile(10_000, leftover, 'now', 2026, deps)).toBe(15_000)
    expect(stepRunwayLeftoverPile(80_000, leftover, 2029, 2030, deps)).toBe(80_000)
  })

  it('matches net worth leftover when runway has no surplus', () => {
    const leftover = series({
      id: 'l',
      type: 'incomeLeftover',
      baseChf: 10_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 5_000,
      contributeUntilYear: 2028,
      compoundUntilYear: 2028,
      yearBindings: [],
    })
    const asOf = new Date(2026, 6, 15)
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: lines,
      usdToChf: 0.9,
      asOf,
      overviewSeries: [leftover],
    }
    const rows = buildRunwayChartRows(
      { startYear: 2026, endYear: 2030, series: [leftover] },
      deps,
      { periods: [defaultRunwayPeriod(2026)] },
    )
    const byYear = new Map(rows.filter((r) => !r.isNow).map((r) => [r.year, r]))
    expect(byYear.get(2026)?.l).toBeCloseTo(residualCashValueAtYear(leftover, 2026, deps))
    expect(byYear.get(2028)?.l).toBeCloseTo(residualCashValueAtYear(leftover, 2028, deps))
    expect(byYear.get(2029)?.l).toBeCloseTo(residualCashValueAtYear(leftover, 2029, deps))
    expect(byYear.get(2029)?.l).toBe(25_000)
  })

  it('adds I/C surplus on top of leftover from the period From year', () => {
    const leftover = series({
      id: 'l',
      type: 'incomeLeftover',
      baseChf: 10_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 5_000,
      contributeUntilYear: 2028,
      compoundUntilYear: 2028,
      yearBindings: [],
    })
    const asOf = new Date(2026, 6, 15)
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: lines,
      usdToChf: 0.9,
      asOf,
    }
    const rows = buildRunwayChartRows(
      { startYear: 2026, endYear: 2031, series: [leftover] },
      deps,
      {
        periods: [
          { ...defaultRunwayPeriod(2030), mode: 'ic-keep', incomeCostScenarioId: 'sc' },
        ],
      },
    )
    const byYear = new Map(rows.filter((r) => !r.isNow).map((r) => [r.year, r]))
    expect(byYear.get(2028)?.l).toBe(25_000)
    expect(byYear.get(2029)?.__surplus ?? 0).toBe(0)
    expect(byYear.get(2029)?.l).toBe(25_000)
    expect(byYear.get(2030)?.__surplus).toBe(70_000)
    expect(byYear.get(2030)?.l).toBe(95_000)
    expect(byYear.get(2031)?.__surplus).toBe(70_000)
    expect(byYear.get(2031)?.l).toBe(165_000)
  })
})

describe('runway draw order and lock', () => {
  it('uses configured draw order then default leftover-first remainder', () => {
    const leftover = series({ id: 'l', type: 'incomeLeftover' })
    const port = series({ id: 'p', type: 'portfolio' })
    const cash: SavingsAccount = {
      id: 'cash',
      name: 'Cash',
      role: 'cash',
      actuals: {},
      contribution: 0,
      cadence: 'monthly',
      annualRatePercent: 0,
      sortOrder: 0,
    }
    const sav = series({ id: 'c', type: 'savings', savingsAccountId: 'cash' })
    const order = resolveRunwayDrawOrder(
      [leftover, port, sav],
      { periods: [], drawOrder: ['p', 'l'] },
      [cash],
    )
    expect(order.map((s) => s.id)).toEqual(['p', 'l', 'c'])
  })

  it('locks a series before the stated year', () => {
    const port = series({ id: 'p', type: 'portfolio', drawLockedUntilYear: 2030 })
    expect(seriesDrawLocked(port, 2029)).toBe(true)
    expect(seriesDrawLocked(port, 2030)).toBe(false)
  })

  it('does not draw leftover before drawLockedUntilYear', () => {
    const leftover = series({
      id: 'l',
      type: 'incomeLeftover',
      baseChf: 10_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 0,
      yearBindings: [],
      drawLockedUntilYear: 2028,
    })
    const cashAcc: SavingsAccount = {
      id: 'cash',
      name: 'Cash',
      role: 'cash',
      actuals: { '2026-07': 20_000 },
      contribution: 0,
      cadence: 'monthly',
      annualRatePercent: 0,
      sortOrder: 0,
    }
    const cash = series({ id: 'c', type: 'savings', savingsAccountId: 'cash' })
    const asOf = new Date(2026, 6, 15)
    const rows = buildRunwayChartRows(
      { startYear: 2026, endYear: 2028, series: [leftover, cash] },
      {
        portfolios: [],
        stockScenarios: [],
        savingsAccounts: [cashAcc],
        incomeCostLines: [],
        usdToChf: 0.9,
        asOf,
      },
      {
        periods: [
          {
            ...defaultRunwayPeriod(2026),
            manualIncomeChf: 0,
            drawMode: 'fixed',
            drawFixedChf: 8_000,
          },
        ],
        drawOrder: ['l', 'c'],
      },
    )
    const byYear = new Map(rows.filter((r) => !r.isNow).map((r) => [r.year, r]))
    expect(byYear.get(2026)?.l).toBe(10_000)
    expect(byYear.get(2027)?.l).toBe(10_000)
    expect(byYear.get(2028)?.l).toBe(2_000)
    expect(runwayDrawnFromRow(byYear.get(2026)!)).toEqual([{ id: 'c', amount: 8_000 }])
    expect(runwayDrawnFromRow(byYear.get(2027)!)).toEqual([{ id: 'c', amount: 8_000 }])
    expect(runwayDrawnFromRow(byYear.get(2028)!)).toEqual([{ id: 'l', amount: 8_000 }])
  })

  it('records how much was taken from each series in draw order', () => {
    const leftover = series({
      id: 'l',
      type: 'incomeLeftover',
      name: 'Leftover',
      baseChf: 10_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 0,
      yearBindings: [],
    })
    const cash: OverviewSeries = series({
      id: 'm',
      type: 'manual',
      name: 'Cash pile',
      baseChf: 20_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 0,
      yearBindings: [],
    })
    const rows = buildRunwayChartRows(
      { startYear: 2026, endYear: 2026, series: [leftover, cash] },
      {
        portfolios: [],
        stockScenarios: [],
        savingsAccounts: [],
        incomeCostLines: [],
        usdToChf: 0.9,
        asOf: new Date(2026, 6, 15),
      },
      {
        periods: [
          {
            ...defaultRunwayPeriod(2026),
            drawMode: 'fixed',
            drawFixedChf: 15_000,
          },
        ],
        drawOrder: ['l', 'm'],
      },
    )
    const y2026 = rows.find((r) => r.xKey === '2026')!
    expect(runwayDrawnFromRow(y2026)).toEqual([
      { id: 'l', amount: 10_000 },
      { id: 'm', amount: 5_000 },
    ])
    expect(y2026.l).toBe(0)
    expect(y2026.m).toBe(15_000)
  })
})

describe('runway grow after draw', () => {
  const asOf = new Date(2026, 6, 15)
  const cash: OverviewSeries = series({
    id: 'm',
    type: 'manual',
    baseChf: 100_000,
    baseYear: 2026,
    annualRatePercent: 10,
    perpetualYearlyChf: 10_000,
    yearBindings: [],
  })
  const deps = {
    portfolios: [],
    stockScenarios: [],
    savingsAccounts: [],
    incomeCostLines: [],
    usdToChf: 0.9,
    asOf,
    overviewSeries: [cash],
  }

  it('matches net worth when nothing is drawn', () => {
    const rows = buildRunwayChartRows(
      { startYear: 2026, endYear: 2027, series: [cash] },
      deps,
      { periods: [defaultRunwayPeriod(2026)] },
    )
    const byYear = new Map(rows.filter((r) => !r.isNow).map((r) => [r.year, r]))
    expect(byYear.get(2026)?.m).toBeCloseTo(seriesValueChf(cash, 2026, deps))
    expect(byYear.get(2027)?.m).toBeCloseTo(seriesValueChf(cash, 2027, deps))
    expect(byYear.get(2027)?.m).toBeCloseTo(131_000)
  })

  it('grows what is left and still adds the full next-year deposit', () => {
    // 2026: 100k + 10k = 110k, then draw 50k → 60k
    // 2027: 60k × 1.1 + 10k = 76k (not 60k × 131/110)
    const rows = buildRunwayChartRows(
      { startYear: 2026, endYear: 2027, series: [cash] },
      deps,
      {
        periods: [
          {
            ...defaultRunwayPeriod(2026),
            drawMode: 'fixed',
            drawFixedChf: 50_000,
          },
          {
            ...defaultRunwayPeriod(2027),
            drawMode: 'fixed',
            drawFixedChf: 0,
          },
        ],
      },
    )
    const byYear = new Map(rows.filter((r) => !r.isNow).map((r) => [r.year, r]))
    expect(byYear.get(2026)?.m).toBeCloseTo(60_000)
    expect(byYear.get(2027)?.m).toBeCloseTo(76_000)
  })

  it('year flow start + growth + inflow − drawn = end', () => {
    const { flows } = buildRunwayModel(
      { startYear: 2026, endYear: 2027, series: [cash] },
      deps,
      {
        periods: [
          {
            ...defaultRunwayPeriod(2026),
            drawMode: 'fixed',
            drawFixedChf: 50_000,
          },
          {
            ...defaultRunwayPeriod(2027),
            drawMode: 'fixed',
            drawFixedChf: 0,
          },
        ],
      },
    )
    const y2026 = flows.get(2026)!
    const y2027 = flows.get(2027)!
    const m26 = y2026.series.find((s) => s.id === 'm')!
    expect(m26.start).toBeCloseTo(100_000)
    expect(m26.inflow).toBeCloseTo(10_000)
    expect(m26.drawn).toBeCloseTo(50_000)
    expect(m26.start + m26.growth + m26.inflow - m26.drawn).toBeCloseTo(m26.end)
    expect(m26.end).toBeCloseTo(60_000)

    const m27 = y2027.series.find((s) => s.id === 'm')!
    expect(m27.start).toBeCloseTo(60_000)
    expect(m27.growth).toBeCloseTo(6_000)
    expect(m27.inflow).toBeCloseTo(10_000)
    expect(m27.drawn).toBe(0)
    expect(m27.start + m27.growth + m27.inflow - m27.drawn).toBeCloseTo(m27.end)
    expect(m27.end).toBeCloseTo(76_000)
  })
})

describe('runway draw before growth', () => {
  const asOf = new Date(2026, 6, 15)
  const cash = (timing: 'growFirst' | 'drawFirst' = 'drawFirst'): OverviewSeries =>
    series({
      id: 'm',
      type: 'manual',
      name: 'Brokerage',
      baseChf: 100_000,
      baseYear: 2026,
      annualRatePercent: 10,
      perpetualYearlyChf: 10_000,
      yearBindings: [],
      drawTiming: timing,
    })
  const deps = {
    portfolios: [],
    stockScenarios: [],
    savingsAccounts: [],
    incomeCostLines: [],
    usdToChf: 0.9,
    asOf,
  }

  it('draws from last year’s leftover then compounds the rest', () => {
    // 2026: 100k − 50k + 10k = 60k (no compound on base year)
    // 2027: (60k − 15k) × 1.1 + 10k = 59.5k  (not 60k × 1.1 + 10k − 15k = 61k)
    const { rows, flows } = buildRunwayModel(
      { startYear: 2026, endYear: 2027, series: [cash()] },
      { ...deps, overviewSeries: [cash()] },
      {
        periods: [
          { ...defaultRunwayPeriod(2026), drawMode: 'fixed', drawFixedChf: 50_000 },
          { ...defaultRunwayPeriod(2027), drawMode: 'fixed', drawFixedChf: 15_000 },
        ],
      },
    )
    const byYear = new Map(rows.filter((r) => !r.isNow).map((r) => [r.year, r]))
    expect(byYear.get(2026)?.m).toBeCloseTo(60_000)
    expect(byYear.get(2027)?.m).toBeCloseTo(59_500)

    const y27 = flows.get(2027)!
    const m = y27.series.find((s) => s.id === 'm')!
    expect(m.drawTiming).toBe('drawFirst')
    expect(m.start).toBeCloseTo(60_000)
    expect(m.drawn).toBeCloseTo(15_000)
    expect(m.growth).toBeCloseTo(4_500)
    expect(m.inflow).toBeCloseTo(10_000)
    expect(m.start - m.drawn + m.growth + m.inflow).toBeCloseTo(m.end)
    expect(m.end).toBeCloseTo(59_500)
  })

  it('does not use this year’s deposit to cover a before-growth draw', () => {
    const thin = series({
      id: 'm',
      type: 'manual',
      baseChf: 10_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 20_000,
      yearBindings: [],
      drawTiming: 'drawFirst',
    })
    const rows = buildRunwayChartRows(
      { startYear: 2026, endYear: 2026, series: [thin] },
      { ...deps, overviewSeries: [thin] },
      {
        periods: [{ ...defaultRunwayPeriod(2026), drawMode: 'fixed', drawFixedChf: 25_000 }],
      },
    )
    const y2026 = rows.find((r) => r.xKey === '2026')!
    // Can only take the 10k start; 20k deposit lands after. 15k of the draw is unmet.
    expect(runwayDrawnFromRow(y2026)).toEqual([{ id: 'm', amount: 10_000 }])
    expect(y2026.m).toBeCloseTo(20_000)
    expect(y2026.__fromAssets).toBe(10_000)
  })

  it('mixed: draw order still holds; before/after only changes when that pile is tapped', () => {
    const leftover = series({
      id: 'l',
      type: 'incomeLeftover',
      name: 'Leftover',
      baseChf: 10_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 0,
      yearBindings: [],
      drawTiming: 'growFirst',
    })
    const port = series({
      id: 'p',
      type: 'manual',
      name: 'Portfolio',
      baseChf: 20_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 0,
      yearBindings: [],
      drawTiming: 'drawFirst',
    })
    const { rows, flows } = buildRunwayModel(
      { startYear: 2026, endYear: 2026, series: [leftover, port] },
      { ...deps, overviewSeries: [leftover, port] },
      {
        periods: [{ ...defaultRunwayPeriod(2026), drawMode: 'fixed', drawFixedChf: 15_000 }],
        drawOrder: ['l', 'p'],
      },
    )
    const y2026 = rows.find((r) => r.xKey === '2026')!
    // Leftover is first: pays 10k (after its own growth). Portfolio then pays 5k from start.
    expect(runwayDrawnFromRow(y2026)).toEqual([
      { id: 'l', amount: 10_000 },
      { id: 'p', amount: 5_000 },
    ])
    expect(y2026.l).toBe(0)
    expect(y2026.p).toBe(15_000)
    const flow = flows.get(2026)!
    expect(flow.series.map((s) => s.id)).toEqual(['l', 'p'])
    expect(flow.series.find((s) => s.id === 'p')!.drawTiming).toBe('drawFirst')
    expect(flow.series.find((s) => s.id === 'l')!.drawTiming).toBe('growFirst')
  })
})

describe('defaultRunwayConfig', () => {
  it('starts with one manual period', () => {
    const cfg = defaultRunwayConfig(new Date(2026, 0, 1))
    expect(cfg.periods).toHaveLength(1)
    expect(cfg.periods[0]!.mode).toBe('manual')
    expect(cfg.periods[0]!.startYear).toBe(2026)
  })
})

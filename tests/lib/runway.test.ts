import { describe, expect, it } from 'vitest'
import {
  defaultRunwayConfig,
  defaultRunwayPeriod,
  normalizeRunwayConfig,
  periodForYear,
  runwayIncomeDrawForYear,
  addSurplusToLeftover,
  buildRunwayChartRows,
  growLeftoverByRate,
  periodAddsICsurplus,
  stepRunwayLeftoverPile,
  takeFromAssets,
} from '../../src/lib/runway'
import { residualCashValueAtYear } from '../../src/lib/overview'
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

describe('defaultRunwayConfig', () => {
  it('starts with one manual period', () => {
    const cfg = defaultRunwayConfig(new Date(2026, 0, 1))
    expect(cfg.periods).toHaveLength(1)
    expect(cfg.periods[0]!.mode).toBe('manual')
    expect(cfg.periods[0]!.startYear).toBe(2026)
  })
})

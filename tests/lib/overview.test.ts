import { describe, expect, it } from 'vitest'
import {
  assignOverviewSeriesColors,
  buildOverviewChartRows,
  buildOverviewCompareRows,
  clampOverviewRange,
  manualValueAtYear,
  recordedOverviewByYear,
  residualCashValueAtYear,
  savingsValueAtYear,
  seriesValueChf,
  seriesValueChfNow,
  yearKind,
  yearsInRange,
} from '../../src/lib/overview'
import { makeActualKey, newOpeningDeposit } from '../../src/lib/portfolio'
import type {
  CashflowLine,
  OverviewScenario,
  OverviewSeries,
  SavedPortfolio,
  SavingsAccount,
} from '../../src/types'

const asOf = new Date(2026, 6, 15) // Jul 2026

function manualSeries(partial: Partial<OverviewSeries> = {}): OverviewSeries {
  return {
    id: partial.id ?? 'm1',
    name: partial.name ?? 'Cash',
    enabled: partial.enabled ?? true,
    sortOrder: partial.sortOrder ?? 0,
    type: partial.type ?? 'manual',
    color: partial.color ?? null,
    baseChf: partial.baseChf ?? 10_000,
    annualRatePercent: partial.annualRatePercent ?? 0,
    baseYear: partial.baseYear ?? 2026,
    portfolioId: partial.portfolioId,
    savingsAccountId: partial.savingsAccountId,
  }
}

describe('range helpers', () => {
  it('yearsInRange inclusive', () => {
    expect(yearsInRange(2026, 2028)).toEqual([2026, 2027, 2028])
  })

  it('swaps inverted range instead of collapsing', () => {
    const r = clampOverviewRange(2030, 2026, asOf)
    expect(r.startYear).toBe(2026)
    expect(r.endYear).toBe(2030)
  })

  it('yearKind: past actual, current and future projected (Now is separate)', () => {
    expect(yearKind(2025, asOf)).toBe('actual')
    expect(yearKind(2026, asOf)).toBe('projected')
    expect(yearKind(2027, asOf)).toBe('projected')
  })
})

describe('manual series', () => {
  it('compounds yearly from baseYear and is zero before base year', () => {
    expect(manualValueAtYear(10_000, 10, 2026, 2025)).toBe(0)
    expect(manualValueAtYear(10_000, 10, 2026, 2026)).toBe(10_000)
    expect(manualValueAtYear(10_000, 10, 2026, 2027)).toBeCloseTo(11_000, 6)
    expect(manualValueAtYear(10_000, 10, 2026, 2028)).toBeCloseTo(12_100, 6)
  })

  it('manual % of IC year leaves remainder on permanent leftover', () => {
    const leftover: OverviewSeries = {
      id: 'left',
      name: 'Leftover cash',
      enabled: true,
      sortOrder: 0,
      type: 'incomeLeftover',
      yearBindings: [],
      baseChf: 0,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 0,
    }
    const manual: OverviewSeries = {
      id: 'm',
      name: 'House',
      enabled: true,
      sortOrder: 1,
      type: 'manual',
      baseChf: 0,
      baseYear: 2026,
      annualRatePercent: 0,
      yearBindings: [
        { year: 2027, incomeCostScenarioId: 'ic', percent: 75 },
      ],
    }
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [
        {
          id: 'i',
          scenarioId: 'ic',
          kind: 'income' as const,
          name: 'Pay',
          cadence: 'recurring' as const,
          yearlyAmount: 50_000,
        },
        {
          id: 'c',
          scenarioId: 'ic',
          kind: 'cost' as const,
          name: 'Cost',
          cadence: 'recurring' as const,
          yearlyAmount: 10_000,
        },
      ],
      usdToChf: 0.9,
      asOf,
      overviewPortfolioIds: [] as string[],
      overviewSeries: [leftover, manual],
    }
    // IC net 40k; manual 75% → 30k; leftover 25% → 10k
    expect(seriesValueChf(manual, 2027, deps)).toBeCloseTo(30_000, 4)
    expect(seriesValueChf(leftover, 2027, deps)).toBeCloseTo(10_000, 4)
  })

  it('manual flat perpetual after last stated binding year', () => {
    const manual: OverviewSeries = {
      id: 'm',
      name: 'House fund',
      enabled: true,
      sortOrder: 0,
      type: 'manual',
      baseChf: 1_000,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 5_000,
      yearBindings: [{ year: 2027, incomeCostScenarioId: 'ic', percent: 50 }],
    }
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [
        {
          id: 'i',
          scenarioId: 'ic',
          kind: 'income' as const,
          name: 'Pay',
          cadence: 'recurring' as const,
          yearlyAmount: 40_000,
        },
        {
          id: 'c',
          scenarioId: 'ic',
          kind: 'cost' as const,
          name: 'Cost',
          cadence: 'recurring' as const,
          yearlyAmount: 0,
        },
      ],
      usdToChf: 0.9,
      asOf,
      overviewPortfolioIds: [] as string[],
      overviewSeries: [manual],
    }
    // 2026: base only (no binding, but last binding is 2027 so no perpetual yet)
    expect(seriesValueChf(manual, 2026, deps)).toBeCloseTo(1_000, 4)
    // 2027: base + 50% of 40k IC
    expect(seriesValueChf(manual, 2027, deps)).toBeCloseTo(21_000, 4)
    // 2028+: +5k perpetual each year
    expect(seriesValueChf(manual, 2028, deps)).toBeCloseTo(26_000, 4)
    expect(seriesValueChf(manual, 2029, deps)).toBeCloseTo(31_000, 4)
  })

  it('manual perpetual every year when no year bindings', () => {
    const manual: OverviewSeries = {
      id: 'm',
      name: 'Flat contrib',
      enabled: true,
      sortOrder: 0,
      type: 'manual',
      baseChf: 0,
      baseYear: 2026,
      annualRatePercent: 0,
      perpetualYearlyChf: 12_000,
      yearBindings: [],
    }
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [],
      usdToChf: 0.9,
      asOf,
      overviewPortfolioIds: [] as string[],
      overviewSeries: [manual],
    }
    expect(seriesValueChf(manual, 2026, deps)).toBeCloseTo(12_000, 4)
    expect(seriesValueChf(manual, 2027, deps)).toBeCloseTo(24_000, 4)
  })
})

describe('buildOverviewChartRows', () => {
  it('inserts Now between past and current year on the timeline', () => {
    const rows = buildOverviewChartRows(
      {
        startYear: 2025,
        endYear: 2027,
        series: [
          manualSeries({ id: 'a', baseChf: 1000, annualRatePercent: 0, enabled: true }),
        ],
      },
      {
        portfolios: [],
        stockScenarios: [],
        savingsAccounts: [],
        incomeCostLines: [],
        usdToChf: 0.9,
        asOf,
      },
    )
    // 2025 (past) → Now → 2026 → 2027
    expect(rows.map((r) => r.xKey)).toEqual(['2025', 'now', '2026', '2027'])
    expect(rows[0]!.kind).toBe('actual')
    expect(rows[1]!.isNow).toBe(true)
    expect(rows[1]!.label).toBe('Now')
    expect(rows[1]!.kind).toBe('now')
    expect(rows[2]!.kind).toBe('projected')
    expect(rows[3]!.kind).toBe('projected')
  })

  it('omits disabled series from totals', () => {
    const rows = buildOverviewChartRows(
      {
        startYear: 2026,
        endYear: 2027,
        series: [
          manualSeries({ id: 'a', baseChf: 1000, annualRatePercent: 0, enabled: true }),
          manualSeries({ id: 'b', baseChf: 5000, annualRatePercent: 0, enabled: false }),
        ],
      },
      {
        portfolios: [],
        stockScenarios: [],
        savingsAccounts: [],
        incomeCostLines: [],
        usdToChf: 0.9,
        asOf,
      },
    )
    // Now + 2026 + 2027
    expect(rows).toHaveLength(3)
    expect(rows[0]!.xKey).toBe('now')
    expect(rows[0]!.total).toBe(1000)
    expect(rows[0]!['a']).toBe(1000)
    expect(rows[0]!['b']).toBeUndefined()
    expect(rows[1]!.kind).toBe('projected')
    expect(rows[1]!.total).toBe(1000)
    expect(rows[2]!.kind).toBe('projected')
    expect(rows[2]!.total).toBe(1000)
  })

  it('portfolio without FX rate contributes 0', () => {
    const rows = buildOverviewChartRows(
      {
        startYear: 2026,
        endYear: 2026,
        series: [
          {
            id: 'p',
            name: 'Port',
            enabled: true,
            sortOrder: 0,
            type: 'portfolio',
            portfolioId: 'missing',
          },
        ],
      },
      {
        portfolios: [],
        stockScenarios: [],
        savingsAccounts: [],
        incomeCostLines: [],
        usdToChf: null,
        asOf,
      },
    )
    const yearRow = rows.find((r) => r.xKey === '2026')
    expect(yearRow?.total).toBe(0)
    expect(rows.some((r) => r.isNow)).toBe(true)
  })

  it('stacks portfolio year-end actuals on past year bars when present', () => {
    const portfolio: SavedPortfolio = {
      id: 'port-1',
      name: 'Main',
      currentCash: 0,
      deposits: [],
      holdings: [],
      actions: [],
      actuals: {
        [makeActualKey(2024, 12)]: 100_000, // USD book
        [makeActualKey(2025, 6)]: 120_000,
      },
      actualsCurrency: 'USD',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const deps = {
      portfolios: [portfolio],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [],
      usdToChf: 0.9,
      asOf,
    }
    const rows = buildOverviewChartRows(
      {
        startYear: 2024,
        endYear: 2026,
        series: [
          {
            id: 'p',
            name: 'Port',
            enabled: true,
            sortOrder: 0,
            type: 'portfolio',
            portfolioId: 'port-1',
          },
          manualSeries({
            id: 'm',
            baseChf: 10_000,
            annualRatePercent: 0,
            enabled: true,
            baseYear: 2024,
          }),
        ],
      },
      deps,
    )
    const y2024 = rows.find((r) => r.xKey === '2024')
    const y2025 = rows.find((r) => r.xKey === '2025')
    // 100k USD × 0.9 = 90k CHF + 10k manual
    expect(y2024?.['p']).toBeCloseTo(90_000, 4)
    expect(y2024?.['m']).toBe(10_000)
    expect(y2024?.total).toBeCloseTo(100_000, 4)
    // last actual in 2025 is June 120k USD → 108k CHF
    expect(y2025?.['p']).toBeCloseTo(108_000, 4)
    expect(y2025?.total).toBeCloseTo(118_000, 4)
  })
})

describe('buildOverviewCompareRows', () => {
  it('plots one total line per scenario with Now between past and current', () => {
    const a: OverviewScenario = {
      id: 'sc-a',
      name: 'Base',
      sortOrder: 0,
      startYear: 2025,
      endYear: 2027,
      series: [manualSeries({ id: 'm1', baseChf: 1000, annualRatePercent: 0, enabled: true })],
    }
    const b: OverviewScenario = {
      id: 'sc-b',
      name: 'High',
      sortOrder: 1,
      startYear: 2025,
      endYear: 2028,
      series: [manualSeries({ id: 'm2', baseChf: 2000, annualRatePercent: 0, enabled: true })],
    }
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [],
      usdToChf: 0.9,
      asOf,
    }
    // Union range 2025–2028: 2025 → Now → 2026 → 2027 → 2028
    const rows = buildOverviewCompareRows([a, b], deps)
    expect(rows.map((r) => r.xKey)).toEqual(['2025', 'now', '2026', '2027', '2028'])
    const now = rows.find((r) => r.isNow)
    expect(now?.kind).toBe('now')
    expect(now?.['sc-a']).toBe(1000)
    expect(now?.['sc-b']).toBe(2000)
    expect(rows.find((r) => r.xKey === '2026')!['sc-a']).toBe(1000)
    expect(rows.find((r) => r.xKey === '2028')!['sc-b']).toBe(2000)
  })
})

describe('residual surplus / income leftover', () => {
  const ic2027 = 'ic-2027'
  const ic2028 = 'ic-2028'
  const line = (
    scenarioId: string,
    kind: 'income' | 'cost',
    amount: number,
  ): CashflowLine => ({
    id: `${scenarioId}-${kind}`,
    scenarioId,
    kind,
    name: kind,
    cadence: 'recurring',
    yearlyAmount: amount,
  })

  const portfolioWithSurplus = (pct: number, year: number, scenarioId: string): SavedPortfolio => ({
    id: 'p1',
    name: 'Main',
    currentCash: 0,
    deposits: [
      newOpeningDeposit(0, 2026),
      {
        id: 'd1',
        year,
        amount: 0,
        source: 'surplus',
        surplusScenarioId: scenarioId,
        surplusPercent: pct,
      },
    ],
    holdings: [],
    actions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  it('leftover gets residual after portfolio surplus when bound; perpetual after last binding', () => {
    const p = portfolioWithSurplus(40, 2027, ic2027)
    const series: OverviewSeries = {
      id: 'left',
      name: 'Leftover cash',
      enabled: true,
      sortOrder: 0,
      type: 'incomeLeftover',
      yearBindings: [
        { year: 2026, incomeCostScenarioId: ic2027 },
        { year: 2027, incomeCostScenarioId: ic2027 },
        { year: 2028, incomeCostScenarioId: ic2028 },
      ],
      baseChf: 5_000,
      annualRatePercent: 0,
      baseYear: 2026,
      perpetualYearlyChf: 10_000,
    }
    const deps = {
      portfolios: [p],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [
        line(ic2027, 'income', 150_000),
        line(ic2027, 'cost', 50_000),
        line(ic2028, 'income', 150_000),
        line(ic2028, 'cost', 50_000),
      ],
      usdToChf: 0.9,
      asOf,
      overviewPortfolioIds: ['p1'],
      overviewSeries: [series],
    }
    expect(seriesValueChfNow(series, deps)).toBe(5_000)
    // 2026 residual full 100k (no deposit that year)
    expect(residualCashValueAtYear(series, 2026, deps)).toBeCloseTo(105_000, 4)
    // 2027: residual 60k after 40% portfolio claim
    expect(residualCashValueAtYear(series, 2027, deps)).toBeCloseTo(165_000, 4)
    expect(residualCashValueAtYear(series, 2028, deps)).toBeCloseTo(265_000, 4)
    expect(residualCashValueAtYear(series, 2029, deps)).toBeCloseTo(275_000, 4)
  })

  it('no-portfolio: leftover gets full IC net for bound years then perpetual', () => {
    const series: OverviewSeries = {
      id: 'left',
      name: 'Leftover cash',
      enabled: true,
      sortOrder: 0,
      type: 'incomeLeftover',
      yearBindings: [
        { year: 2027, incomeCostScenarioId: ic2027 },
        { year: 2028, incomeCostScenarioId: ic2028 },
      ],
      baseChf: 1_000,
      annualRatePercent: 0,
      baseYear: 2026,
      perpetualYearlyChf: 10_000,
    }
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [
        line(ic2027, 'income', 50_000),
        line(ic2027, 'cost', 10_000),
        line(ic2028, 'income', 80_000),
        line(ic2028, 'cost', 20_000),
      ],
      usdToChf: 0.9,
      asOf,
      overviewPortfolioIds: [],
      overviewSeries: [series],
    }
    expect(residualCashValueAtYear(series, 2026, deps)).toBe(1_000)
    expect(residualCashValueAtYear(series, 2027, deps)).toBeCloseTo(41_000, 4)
    expect(residualCashValueAtYear(series, 2028, deps)).toBeCloseTo(101_000, 4)
    expect(residualCashValueAtYear(series, 2029, deps)).toBeCloseTo(111_000, 4)
  })

  it('perpetual applies every year when leftover has no year bindings', () => {
    const series: OverviewSeries = {
      id: 'left',
      name: 'Leftover cash',
      enabled: true,
      sortOrder: 0,
      type: 'incomeLeftover',
      yearBindings: [],
      baseChf: 5_000,
      annualRatePercent: 0,
      baseYear: 2026,
      perpetualYearlyChf: 12_000,
    }
    const deps = {
      portfolios: [],
      stockScenarios: [],
      savingsAccounts: [],
      incomeCostLines: [],
      usdToChf: 0.9,
      asOf,
      overviewPortfolioIds: [] as string[],
      overviewSeries: [series],
    }
    // base + perpetual in baseYear, then +perpetual each following year
    expect(residualCashValueAtYear(series, 2026, deps)).toBeCloseTo(17_000, 4)
    expect(residualCashValueAtYear(series, 2027, deps)).toBeCloseTo(29_000, 4)
    expect(residualCashValueAtYear(series, 2028, deps)).toBeCloseTo(41_000, 4)
  })
})

describe('assignOverviewSeriesColors', () => {
  it('uses blues for savings and greens for portfolio', () => {
    const map = assignOverviewSeriesColors([
      manualSeries({ id: 'p1', type: 'portfolio', name: 'P' }),
      manualSeries({ id: 's1', type: 'savings', name: 'S' }),
      manualSeries({ id: 'm1', type: 'manual', name: 'M' }),
    ])
    // portfolio greens (#34d399 etc), savings blues (#38bdf8 etc)
    expect(map.get('p1')?.toLowerCase()).toMatch(/^#(34d399|10b981|059669|6ee7b7|a7f3d0|047857|22c55e|86efac)$/)
    expect(map.get('s1')?.toLowerCase()).toMatch(/^#(38bdf8|0ea5e9|0284c7|7dd3fc|bae6fd|0369a1|60a5fa|93c5fd)$/)
    expect(map.get('m1')).toBeTruthy()
  })

  it('respects custom series.color', () => {
    const map = assignOverviewSeriesColors([
      manualSeries({ id: 'p1', type: 'portfolio', name: 'P', color: '#ff00aa' }),
    ])
    expect(map.get('p1')).toBe('#ff00aa')
  })
})

describe('savingsValueAtYear', () => {
  it('uses balance now for current year', () => {
    const acc: SavingsAccount = {
      id: 's1',
      name: 'Pension',
      actuals: { '2026-07': 50_000 },
      contribution: 0,
      cadence: 'monthly',
      annualRatePercent: 0,
      sortOrder: 0,
    }
    expect(savingsValueAtYear(acc, 2026, asOf)).toBe(50_000)
  })

  it('grows with contribution in future years', () => {
    const acc: SavingsAccount = {
      id: 's1',
      name: 'Fund',
      actuals: { '2026-07': 12_000 },
      contribution: 1000,
      cadence: 'monthly',
      annualRatePercent: 0,
      sortOrder: 0,
    }
    const y0 = savingsValueAtYear(acc, 2026, asOf)
    const y1 = savingsValueAtYear(acc, 2027, asOf)
    expect(y1).toBeGreaterThan(y0)
  })

  it('seriesValueChf for savings', () => {
    const acc: SavingsAccount = {
      id: 's1',
      name: 'Fund',
      actuals: { '2026-07': 1000 },
      contribution: 0,
      cadence: 'monthly',
      annualRatePercent: 0,
      sortOrder: 0,
    }
    const v = seriesValueChf(
      {
        id: 'x',
        name: 'Fund',
        enabled: true,
        sortOrder: 0,
        type: 'savings',
        savingsAccountId: 's1',
      },
      2026,
      {
        portfolios: [],
        stockScenarios: [],
        savingsAccounts: [acc],
        incomeCostLines: [],
        usdToChf: 0.9,
        asOf,
      },
    )
    expect(v).toBe(1000)
  })
})

describe('recordedOverviewByYear', () => {
  const portfolio: SavedPortfolio = {
    id: 'port-1',
    name: 'Main',
    currentCash: 0,
    deposits: [],
    holdings: [],
    actions: [],
    actuals: {
      [makeActualKey(2024, 12)]: 100_000,
      [makeActualKey(2025, 6)]: 120_000,
    },
    actualsCurrency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const extra: SavedPortfolio = {
    ...portfolio,
    id: 'port-extra',
    name: 'Other',
    actuals: { [makeActualKey(2024, 12)]: 50_000 },
  }
  const cash: SavingsAccount = {
    id: 'cash',
    name: 'Cash',
    actuals: { '2024-12': 10_000 },
    contribution: 0,
    cadence: 'monthly',
    annualRatePercent: 0,
    sortOrder: 0,
  }
  const deps = {
    portfolios: [portfolio, extra],
    stockScenarios: [],
    savingsAccounts: [cash],
    incomeCostLines: [],
    usdToChf: 0.9,
    asOf,
  }

  it('sums enabled portfolio + savings actuals the same way past bars do', () => {
    const map = recordedOverviewByYear(
      [
        {
          id: 'p',
          name: 'Port',
          enabled: true,
          sortOrder: 0,
          type: 'portfolio',
          portfolioId: 'port-1',
        },
        {
          id: 's',
          name: 'Cash',
          enabled: true,
          sortOrder: 1,
          type: 'savings',
          savingsAccountId: 'cash',
        },
        manualSeries({
          id: 'm',
          baseChf: 10_000,
          annualRatePercent: 0,
          enabled: true,
          baseYear: 2024,
        }),
      ],
      deps,
    )
    // 100k USD × 0.9 + 10k cash — not the extra portfolio, not manual
    expect(map.get(2024)).toBeCloseTo(100_000)
    // last 2025 month 120k USD × 0.9 + cash carried forward
    expect(map.get(2025)).toBeCloseTo(118_000)
    expect(map.has(2026)).toBe(false)
  })

  it('ignores disabled series and unlinked portfolios', () => {
    const map = recordedOverviewByYear(
      [
        {
          id: 'p',
          name: 'Port',
          enabled: false,
          sortOrder: 0,
          type: 'portfolio',
          portfolioId: 'port-1',
        },
        {
          id: 's',
          name: 'Cash',
          enabled: true,
          sortOrder: 1,
          type: 'savings',
          savingsAccountId: 'cash',
        },
      ],
      deps,
    )
    expect(map.get(2024)).toBe(10_000)
    expect(map.get(2025)).toBe(10_000)
  })
})

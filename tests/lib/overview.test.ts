import { describe, expect, it } from 'vitest'
import {
  assignOverviewSeriesColors,
  buildOverviewChartRows,
  buildOverviewCompareRows,
  clampOverviewRange,
  manualValueAtYear,
  savingsValueAtYear,
  seriesValueChf,
  yearKind,
  yearsInRange,
} from '../../src/lib/overview'
import type { OverviewScenario, OverviewSeries, SavingsAccount } from '../../src/types'

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

  it('yearKind actual vs projected', () => {
    expect(yearKind(2026, asOf)).toBe('actual')
    expect(yearKind(2025, asOf)).toBe('actual')
    expect(yearKind(2027, asOf)).toBe('projected')
  })
})

describe('manual series', () => {
  it('compounds yearly from baseYear', () => {
    expect(manualValueAtYear(10_000, 10, 2026, 2026)).toBe(10_000)
    expect(manualValueAtYear(10_000, 10, 2026, 2027)).toBeCloseTo(11_000, 6)
    expect(manualValueAtYear(10_000, 10, 2026, 2028)).toBeCloseTo(12_100, 6)
  })
})

describe('buildOverviewChartRows', () => {
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
    expect(rows).toHaveLength(2)
    expect(rows[0].total).toBe(1000)
    expect(rows[0]['a']).toBe(1000)
    expect(rows[0]['b']).toBeUndefined()
    expect(rows[0].kind).toBe('actual')
    expect(rows[1].kind).toBe('projected')
    expect(rows[1].total).toBe(1000)
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
    expect(rows[0].total).toBe(0)
  })
})

describe('buildOverviewCompareRows', () => {
  it('plots one total line per scenario on a shared year axis', () => {
    const a: OverviewScenario = {
      id: 'sc-a',
      name: 'Base',
      sortOrder: 0,
      startYear: 2026,
      endYear: 2027,
      series: [manualSeries({ id: 'm1', baseChf: 1000, annualRatePercent: 0, enabled: true })],
    }
    const b: OverviewScenario = {
      id: 'sc-b',
      name: 'High',
      sortOrder: 1,
      startYear: 2026,
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
    const rows = buildOverviewCompareRows([a, b], deps)
    expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028])
    expect(rows[0]!['sc-a']).toBe(1000)
    expect(rows[0]!['sc-b']).toBe(2000)
    expect(rows[2]!['sc-a']).toBe(1000)
    expect(rows[2]!['sc-b']).toBe(2000)
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

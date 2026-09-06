import { describe, expect, it } from 'vitest'
import {
  buildHistoryChart,
  buildHistoryTable,
  collectHistorySeries,
  historySnapshot,
  historySeriesId,
  rollupYearly,
  seriesCompleteness,
  SHARED_PORTFOLIO_SOURCE_ID,
} from '../../src/lib/history'
import { newPortfolio } from '../../src/lib/portfolio'
import type { PortfolioActualsState, SavingsAccount } from '../../src/types'

function sharedActuals(
  byMonth: Record<string, number>,
  currency: PortfolioActualsState['currency'] = 'USD',
): PortfolioActualsState {
  return { version: 1, currency, byMonth }
}

function savings(partial: Partial<SavingsAccount> & Pick<SavingsAccount, 'id' | 'name'>): SavingsAccount {
  return {
    contribution: 0,
    cadence: 'monthly',
    annualRatePercent: 0,
    sortOrder: 0,
    actuals: {},
    ...partial,
  }
}

describe('rollupYearly', () => {
  it('keeps the last month of each year', () => {
    const out = rollupYearly([
      { key: '2024-06', year: 2024, month: 6, value: 10 },
      { key: '2024-12', year: 2024, month: 12, value: 12 },
      { key: '2025-03', year: 2025, month: 3, value: 15 },
    ])
    expect(out.map((p) => ({ key: p.key, value: p.value }))).toEqual([
      { key: '2024', value: 12 },
      { key: '2025', value: 15 },
    ])
  })
})

describe('collectHistorySeries', () => {
  it('skips empty actuals and converts USD investing actuals when FX is present', () => {
    const usd = newPortfolio('Broker')
    const empty = newPortfolio('Empty')
    const cash = savings({
      id: 'c',
      name: 'Cash',
      actuals: { '2025-12': 10_000 },
    })
    const series = collectHistorySeries(
      [usd, empty],
      [cash],
      0.8,
      sharedActuals({ '2025-12': 100_000 }),
    )
    expect(series).toHaveLength(2)
    expect(series[0]!.id).toBe(historySeriesId('portfolio', SHARED_PORTFOLIO_SOURCE_ID))
    expect(series[0]!.inChf).toBe(true)
    expect(series[0]!.points[0]!.value).toBeCloseTo(80_000)
    expect(series[1]!.kind).toBe('savings')
    expect(series[1]!.points[0]!.value).toBe(10_000)
  })

  it('leaves USD series unconverted without FX', () => {
    const usd = newPortfolio('Broker')
    const series = collectHistorySeries(
      [usd],
      [],
      null,
      sharedActuals({ '2025-12': 100_000 }),
    )
    expect(series).toHaveLength(1)
    expect(series[0]!.inChf).toBe(false)
    expect(series[0]!.points[0]!.value).toBe(100_000)
  })

  it('emits one investing series even with two portfolios', () => {
    const a = newPortfolio('A')
    const b = newPortfolio('B')
    const series = collectHistorySeries(
      [a, b],
      [],
      0.8,
      sharedActuals({ '2025-12': 50_000 }),
    )
    expect(series.filter((s) => s.kind === 'portfolio')).toHaveLength(1)
    expect(series[0]!.points[0]!.value).toBeCloseTo(40_000)
  })
})

describe('buildHistoryChart / table / snapshot', () => {
  const p = newPortfolio('Broker')
  const cash = savings({
    id: 'c',
    name: 'Cash',
    actuals: { '2024-12': 20_000, '2025-12': 25_000 },
  })
  const series = collectHistorySeries(
    [p],
    [cash],
    null,
    sharedActuals({ '2024-12': 80_000, '2025-06': 90_000, '2025-12': 100_000 }, 'CHF'),
  )

  it('unions monthly keys and totals CHF series', () => {
    const chart = buildHistoryChart(series, 'monthly', 2024, 2025)
    expect(chart.keys).toEqual(['2024-12', '2025-06', '2025-12'])
    expect(chart.rows[0]!.total).toBe(100_000)
    expect(chart.rows[1]!.total).toBe(90_000)
    expect(chart.rows[2]!.total).toBe(125_000)
  })

  it('yearly uses last month of each year', () => {
    const chart = buildHistoryChart(series, 'yearly', 2024, 2025)
    expect(chart.keys).toEqual(['2024', '2025'])
    expect(chart.rows[1]!.total).toBe(125_000)
  })

  it('table YoY uses consecutive year-ends', () => {
    const table = buildHistoryTable(series, 2024, 2025)
    const broker = table.rows.find((r) => r.name === 'Portfolio')!
    expect(broker.byYear[2024]).toBe(80_000)
    expect(broker.byYear[2025]).toBe(100_000)
    expect(broker.yoy).toBeCloseTo(0.25)
  })

  it('snapshot compares latest total to prior year-end', () => {
    const snap = historySnapshot(series, 2024, 2025)
    expect(snap.total).toBe(125_000)
    expect(snap.prevYearEnd).toBe(100_000)
    expect(snap.yoy).toBeCloseTo(0.25)
    expect(snap.prevYear).toBe(2024)
  })
})

describe('seriesCompleteness', () => {
  const asOf = new Date(2026, 7, 13) // Aug 2026

  it('marks monthly series stale when last actual in the window is two+ months old', () => {
    const s = collectHistorySeries(
      [],
      [
        savings({
          id: 'c',
          name: 'Cash',
          actuals: { '2026-03': 1, '2026-04': 2, '2026-05': 10_000 },
        }),
      ],
      null,
    )[0]!
    const c = seriesCompleteness(s, asOf, 2026, 2026)
    expect(c.stale).toBe(true)
    expect(c.lastKey).toBe('2026-05')
    expect(c.monthsBehind).toBe(3)
  })

  it('does not warn when the selected period is fully filled', () => {
    const s = collectHistorySeries(
      [],
      [
        savings({
          id: 'c',
          name: 'Cash',
          actuals: { '2024-12': 8_000, '2025-12': 9_000 },
        }),
      ],
      null,
    )[0]!
    const c = seriesCompleteness(s, asOf, 2024, 2025)
    expect(c.yearlyOnly).toBe(true)
    expect(c.gapCount).toBe(0)
    expect(c.stale).toBe(false)
  })

  it('does not nag Jan–Nov on year-end-only series in an open current year', () => {
    const s = collectHistorySeries(
      [],
      [
        savings({
          id: 'c',
          name: 'Cash',
          actuals: { '2024-12': 8_000, '2025-12': 9_000 },
        }),
      ],
      null,
    )[0]!
    const c = seriesCompleteness(s, asOf, 2024, 2026)
    expect(c.yearlyOnly).toBe(true)
    expect(c.gapCount).toBe(0)
    expect(c.stale).toBe(false)
  })

  it('counts holes between monthly points inside the window', () => {
    const s = collectHistorySeries(
      [],
      [
        savings({
          id: 'c',
          name: 'Cash',
          actuals: { '2026-01': 1, '2026-02': 2, '2026-04': 4, '2026-05': 5 },
        }),
      ],
      null,
    )[0]!
    const c = seriesCompleteness(s, asOf, 2026, 2026)
    expect(c.yearlyOnly).toBe(false)
    expect(c.gapCount).toBe(4) // Mar + Jun–Aug through current period
  })
})

import { describe, expect, it } from 'vitest'
import { buildSignedReturnChartRows } from '../../src/components/portfolio/PortfolioReturnChart'
import type { ReturnProgressionPoint } from '../../src/lib/portfolioPerformanceStats'

describe('buildSignedReturnChartRows', () => {
  it('keeps one value per calendar day and null masks (no zero fill on positive days)', () => {
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-01', totalPnl: -10, returnPct: -0.1 },
      { date: '2024-01-02', totalPnl: 20, returnPct: 0.2 },
    ]
    const rows = buildSignedReturnChartRows(points, 'usd')
    const jan1 = rows.find((r) => r.date === '2024-01-01')
    const jan2 = rows.find((r) => r.date === '2024-01-02')
    expect(jan1).toMatchObject({ value: -10, valuePos: null, valueNeg: -10 })
    expect(jan2).toMatchObject({ value: 20, valuePos: 20, valueNeg: null })
  })

  it('inserts asymmetric zero-cross rows (not both masks on one row)', () => {
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-01', totalPnl: 10, returnPct: 0.1 },
      { date: '2024-01-02', totalPnl: -10, returnPct: -0.1 },
    ]
    const rows = buildSignedReturnChartRows(points, 'usd')
    const zeroRows = rows.filter((r) => r.value === 0)
    expect(zeroRows).toHaveLength(2)
    expect(zeroRows.some((r) => r.valuePos === 0 && r.valueNeg == null)).toBe(true)
    expect(zeroRows.some((r) => r.valueNeg === 0 && r.valuePos == null)).toBe(true)
    expect(
      zeroRows.every(
        (r) =>
          (r.valuePos === 0 && r.valueNeg == null) ||
          (r.valueNeg === 0 && r.valuePos == null),
      ),
    ).toBe(true)
  })

  it('does not assign both valuePos and valueNeg on positive-only days', () => {
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-01', totalPnl: 5, returnPct: 0.05 },
      { date: '2024-01-02', totalPnl: 15, returnPct: 0.15 },
    ]
    const rows = buildSignedReturnChartRows(points, 'usd')
    for (const r of rows) {
      if (r.value != null && r.value > 0) {
        expect(r.valuePos).toBe(r.value)
        expect(r.valueNeg).toBeNull()
      }
    }
  })
})
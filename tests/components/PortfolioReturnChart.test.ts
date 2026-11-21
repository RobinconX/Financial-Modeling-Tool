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

  it('inserts a zero crossing between sign changes', () => {
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-01', totalPnl: 10, returnPct: 0.1 },
      { date: '2024-01-02', totalPnl: -10, returnPct: -0.1 },
    ]
    const rows = buildSignedReturnChartRows(points, 'usd')
    expect(rows.filter((r) => r.value === 0)).toHaveLength(1)
  })
})
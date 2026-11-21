import { describe, expect, it } from 'vitest'
import {
  buildReturnChartTradeMarkers,
  buildSignedReturnChartRows,
  chartTimeForTradeDate,
  ReturnProgressionTooltip,
} from '../../src/components/portfolio/PortfolioReturnChart'
import type { PortfolioTrade } from '../../src/types'
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

  it('scales USD P&L into CHF for money mode', () => {
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-01', totalPnl: 100, returnPct: 0.1 },
    ]
    const rows = buildSignedReturnChartRows(points, 'usd', 'CHF', 0.9)
    expect(rows[0]!.value).toBeCloseTo(90, 4)
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

describe('ReturnProgressionTooltip', () => {
  it('renders a single formatted value from the value series payload', () => {
    const el = ReturnProgressionTooltip({
      active: true,
      label: '2024-01-02',
      mode: 'usd',
      displayCurrency: 'USD',
      payload: [
        {
          payload: {
            date: '2024-01-02',
            time: chartTimeForTradeDate('2024-01-02'),
            value: 1250.5,
            valuePos: 1250.5,
            valueNeg: null,
          },
        },
      ],
    })
    expect(el).not.toBeNull()
    const text = JSON.stringify(el)
    expect(text).toContain('2024-01-02')
    expect(text).toContain('Total P&L')
    expect(text).toContain('$1.25K')
  })

  it('shows one placeholder when value is missing', () => {
    const el = ReturnProgressionTooltip({
      active: true,
      label: '2024-01-01',
      mode: 'pct',
      displayCurrency: 'USD',
      payload: [
        {
          payload: {
            date: '2024-01-01',
            time: chartTimeForTradeDate('2024-01-01'),
            value: null,
            valuePos: null,
            valueNeg: null,
          },
        },
      ],
    })
    expect(el).not.toBeNull()
    const text = JSON.stringify(el)
    expect(text).toContain('2024-01-01')
    expect(text).toContain('—')
  })
})

describe('chartTimeForTradeDate', () => {
  it('anchors trade x at noon UTC on the trade date', () => {
    expect(chartTimeForTradeDate('2024-06-15')).toBe(
      Date.parse('2024-06-15T12:00:00Z'),
    )
  })
})

describe('buildReturnChartTradeMarkers', () => {
  const PORT_ID = '11111111-1111-4111-8111-111111111111'

  function trade(
    partial: Partial<PortfolioTrade> & Pick<PortfolioTrade, 'side' | 'tradeDate'>,
  ): PortfolioTrade {
    return {
      id: partial.id ?? crypto.randomUUID(),
      portfolioId: PORT_ID,
      symbol: partial.symbol ?? 'TST',
      side: partial.side,
      tradeDate: partial.tradeDate,
      shares: partial.shares ?? 1,
      price: partial.price ?? 100,
      fees: partial.fees ?? 0,
    }
  }

  it('falls back to last known return when trade day has a progression gap', () => {
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-02', totalPnl: 0, returnPct: 0 },
      { date: '2024-01-03', totalPnl: null, returnPct: null },
      { date: '2024-01-04', totalPnl: 40, returnPct: 0.04 },
    ]
    const markers = buildReturnChartTradeMarkers(
      [trade({ id: 't-gap', side: 'buy', tradeDate: '2024-01-03' })],
      points,
      'usd',
    )
    expect(markers).toHaveLength(1)
    expect(markers[0]!.y).toBe(0)
  })

  it('places markers at progression Y on trade dates', () => {
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-02', totalPnl: 0, returnPct: 0 },
      { date: '2024-01-10', totalPnl: 50, returnPct: 0.05 },
    ]
    const markers = buildReturnChartTradeMarkers(
      [trade({ id: 't1', side: 'buy', tradeDate: '2024-01-02' })],
      points,
      'usd',
    )
    expect(markers).toHaveLength(1)
    expect(markers[0]!.y).toBe(0)
    const pct = buildReturnChartTradeMarkers(
      [trade({ id: 't2', side: 'sell', tradeDate: '2024-01-10', shares: 2 })],
      points,
      'pct',
    )
    expect(pct[0]!.y).toBeCloseTo(5, 4)
    expect(pct[0]!.side).toBe('sell')
  })
})
import { describe, expect, it } from 'vitest'
import {
  buildReturnChartTradeMarkers,
  buildReturnChartXAxisTicks,
  buildSignedReturnChartRows,
  chartRowNearestToTime,
  chartTimeForTradeDate,
  formatReturnChartTimeTick,
  resolveReturnChartTooltipRow,
  resolveReturnChartTooltipState,
  returnChartXAxisTickLabels,
  ReturnProgressionTooltip,
  tradesForReturnTooltip,
} from '../../src/components/portfolio/PortfolioReturnChart'
import type { PortfolioTrade } from '../../src/types'
import type { ReturnProgressionPoint } from '../../src/lib/portfolioPerformanceStats'

describe('return chart x-axis ticks', () => {
  function dailyTimes(from: string, to: string): number[] {
    const out: number[] = []
    let cur = Date.parse(`${from}T12:00:00Z`)
    const end = Date.parse(`${to}T12:00:00Z`)
    while (cur <= end) {
      const d = new Date(cur)
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      out.push(chartTimeForTradeDate(iso))
      cur += 86_400_000
    }
    return out
  }

  it('formats month ticks for multi-month visible windows', () => {
    expect(formatReturnChartTimeTick('2024-03-01', '2024-01-01', '2024-06-30')).toBe(
      '2024-03',
    )
  })

  it('dedupes x-axis labels for dense daily data (full-year span)', () => {
    const times = dailyTimes('2023-01-01', '2023-12-31')
    const labels = returnChartXAxisTickLabels(times, '2023-01-01', '2023-12-31')
    expect(labels.length).toBeGreaterThan(0)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels.every((l) => /^\d{4}-\d{2}$/.test(l))).toBe(true)
  })

  it('dedupes x-axis labels when zoomed to a few months', () => {
    const times = dailyTimes('2024-04-01', '2024-06-30')
    const labels = returnChartXAxisTickLabels(times, '2024-04-01', '2024-06-30')
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels.length).toBeLessThanOrEqual(4)
    expect(buildReturnChartXAxisTicks(times, '2024-04-01', '2024-06-30')).toHaveLength(
      labels.length,
    )
  })
})

describe('buildSignedReturnChartRows', () => {
  it('keeps one value per calendar day and null masks (no zero fill on positive days)', () => {
    const points: ReturnProgressionPoint[] = [
      {
        date: '2024-01-01',
        totalPnl: -10,
        returnPct: -0.1,
        twrPct: null,
        mwrCumPct: null,
      },
      {
        date: '2024-01-02',
        totalPnl: 20,
        returnPct: 0.2,
        twrPct: null,
        mwrCumPct: null,
      },
    ]
    const rows = buildSignedReturnChartRows(points, 'usd')
    const jan1 = rows.find((r) => r.date === '2024-01-01')
    const jan2 = rows.find((r) => r.date === '2024-01-02')
    expect(jan1).toMatchObject({ value: -10, valuePos: null, valueNeg: -10 })
    expect(jan2).toMatchObject({ value: 20, valuePos: 20, valueNeg: null })
  })

  it('inserts asymmetric zero-cross rows (not both masks on one row)', () => {
    const points: ReturnProgressionPoint[] = [
      {
        date: '2024-01-01',
        totalPnl: 10,
        returnPct: 0.1,
        twrPct: null,
        mwrCumPct: null,
      },
      {
        date: '2024-01-02',
        totalPnl: -10,
        returnPct: -0.1,
        twrPct: null,
        mwrCumPct: null,
      },
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

  it('uses progression P&L as-is in money mode (already in display currency)', () => {
    const points: ReturnProgressionPoint[] = [
      {
        date: '2024-01-01',
        totalPnl: 90,
        returnPct: 0.1,
        twrPct: null,
        mwrCumPct: null,
      },
    ]
    const rows = buildSignedReturnChartRows(points, 'usd', 'CHF', 0.9)
    expect(rows[0]!.value).toBeCloseTo(90, 4)
  })

  it('does not assign both valuePos and valueNeg on positive-only days', () => {
    const points: ReturnProgressionPoint[] = [
      {
        date: '2024-01-01',
        totalPnl: 5,
        returnPct: 0.05,
        twrPct: null,
        mwrCumPct: null,
      },
      {
        date: '2024-01-02',
        totalPnl: 15,
        returnPct: 0.15,
        twrPct: null,
        mwrCumPct: null,
      },
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
          dataKey: 'value',
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
    expect(text).not.toContain('Trades')
  })

  it('appends trade rows when trades prop is set', () => {
    const el = ReturnProgressionTooltip({
      active: true,
      label: '2024-03-01',
      mode: 'usd',
      displayCurrency: 'USD',
      usdToChf: null,
      rowOverride: {
        date: '2024-03-01',
        time: chartTimeForTradeDate('2024-03-01'),
        value: 100,
        valuePos: 100,
        valueNeg: null,
      },
      trades: [
        {
          id: 't1',
          tradeDate: '2024-03-01',
          time: chartTimeForTradeDate('2024-03-01'),
          side: 'buy',
          symbol: 'AAPL',
          shares: 1,
          price: 50,
          fees: 0,
          currency: 'USD' as const,
          y: 100,
        },
      ],
    })
    const text = JSON.stringify(el)
    expect(text).toContain('Total P&L')
    expect(text).toContain('AAPL')
    expect(text).toContain('"side":"buy"')
  })

  it('shows one placeholder when value is missing', () => {
    const el = ReturnProgressionTooltip({
      active: true,
      label: '2024-01-01',
      mode: 'grossBuys',
      displayCurrency: 'USD',
      payload: [
        {
          dataKey: 'value',
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

describe('chartRowNearestToTime', () => {
  it('picks the line point closest to hovered time', () => {
    const rows = buildSignedReturnChartRows(
      [
        {
          date: '2024-01-01',
          totalPnl: -10,
          returnPct: -0.1,
          twrPct: null,
          mwrCumPct: null,
        },
        {
          date: '2024-06-01',
          totalPnl: 50,
          returnPct: 0.5,
          twrPct: null,
          mwrCumPct: null,
        },
        {
          date: '2026-08-01',
          totalPnl: 100,
          returnPct: 1,
          twrPct: null,
          mwrCumPct: null,
        },
      ],
      'grossBuys',
    )
    const aug26 = chartTimeForTradeDate('2026-08-01')
    const row = chartRowNearestToTime(rows, aug26 + 60_000)
    expect(row?.date).toBe('2026-08-01')
    expect(row?.value).toBeCloseTo(100, 4)
  })
})

describe('resolveReturnChartTooltipRow', () => {
  it('prefers time label over stale scatter-style payload', () => {
    const rows = buildSignedReturnChartRows(
      [
        {
          date: '2025-04-21',
          totalPnl: -10,
          returnPct: -0.3662,
          twrPct: null,
          mwrCumPct: null,
        },
        {
          date: '2026-08-01',
          totalPnl: 100,
          returnPct: 1,
          twrPct: null,
          mwrCumPct: null,
        },
      ],
      'grossBuys',
    )
    const stalePayload = [
      {
        dataKey: 'y',
        payload: {
          id: 'trade-1',
          tradeDate: '2025-04-21',
          time: chartTimeForTradeDate('2025-04-21'),
          side: 'buy' as const,
          symbol: 'X',
          shares: 1,
          price: 1,
          fees: 0,
          currency: 'USD' as const,
          y: -36.62,
        },
      },
    ]
    const hoverTime = chartTimeForTradeDate('2026-08-01')
    const row = resolveReturnChartTooltipRow(rows, hoverTime, stalePayload)
    expect(row?.date).toBe('2026-08-01')
    expect(row?.value).toBeCloseTo(100, 4)
  })
})

describe('resolveReturnChartTooltipState', () => {
  it('resolves chart row from value series payload', () => {
    const row = {
      date: '2024-01-02',
      time: chartTimeForTradeDate('2024-01-02'),
      value: 10,
      valuePos: 10,
      valueNeg: null,
    }
    const state = resolveReturnChartTooltipState([{ dataKey: 'value', payload: row }])
    expect(state.row?.value).toBe(10)
  })
})

describe('tradesForReturnTooltip', () => {
  const markers = [
    {
      id: '1',
      tradeDate: '2024-03-01',
      time: chartTimeForTradeDate('2024-03-01'),
      side: 'buy' as const,
      symbol: 'AAPL',
      shares: 1,
      price: 1,
      fees: 0,
      currency: 'USD' as const,
      y: 0,
    },
    {
      id: '2',
      tradeDate: '2024-04-01',
      time: chartTimeForTradeDate('2024-04-01'),
      side: 'sell' as const,
      symbol: 'MSFT',
      shares: 1,
      price: 1,
      fees: 0,
      currency: 'USD' as const,
      y: 0,
    },
  ]

  it('returns no trades on a day without ledger activity', () => {
    const row = {
      date: '2024-01-02',
      time: chartTimeForTradeDate('2024-01-02'),
      value: 10,
      valuePos: 10,
      valueNeg: null,
    }
    expect(tradesForReturnTooltip(row, undefined, markers)).toHaveLength(0)
  })

  it('returns only trades on the hovered calendar day', () => {
    const row = {
      date: '2024-03-01',
      time: chartTimeForTradeDate('2024-03-01'),
      value: 5,
      valuePos: 5,
      valueNeg: null,
    }
    const onDay = tradesForReturnTooltip(row, undefined, markers)
    expect(onDay).toHaveLength(1)
    expect(onDay[0]!.symbol).toBe('AAPL')
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
    const nullFields = { twrPct: null, mwrCumPct: null }
    const points: ReturnProgressionPoint[] = [
      { date: '2024-01-02', totalPnl: 0, returnPct: 0, ...nullFields },
      { date: '2024-01-03', totalPnl: null, returnPct: null, ...nullFields },
      { date: '2024-01-04', totalPnl: 40, returnPct: 0.04, ...nullFields },
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
      { date: '2024-01-02', totalPnl: 0, returnPct: 0, twrPct: null, mwrCumPct: null },
      { date: '2024-01-10', totalPnl: 50, returnPct: 0.05, twrPct: null, mwrCumPct: null },
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
      'grossBuys',
    )
    expect(pct[0]!.y).toBeCloseTo(5, 4)
    expect(pct[0]!.side).toBe('sell')
  })
})
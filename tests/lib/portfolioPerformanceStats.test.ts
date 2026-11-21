import { describe, expect, it } from 'vitest'
import type { PortfolioTrade } from '../../src/types'
import {
  buildReturnProgression,
  computeTimeWeightedReturn,
  computeTradeActivity,
  computeHoldingCostStats,
  computePortfolioActivityRollup,
  ledgerSnapshotAt,
} from '../../src/lib/portfolioPerformanceStats'

const PORT_ID = '11111111-1111-4111-8111-111111111111'

function trade(
  partial: Partial<PortfolioTrade> & Pick<PortfolioTrade, 'side' | 'tradeDate' | 'shares' | 'price'>,
): PortfolioTrade {
  return {
    id: partial.id ?? crypto.randomUUID(),
    portfolioId: PORT_ID,
    symbol: partial.symbol ?? 'TST',
    side: partial.side,
    tradeDate: partial.tradeDate,
    shares: partial.shares,
    price: partial.price,
    fees: partial.fees ?? 0,
  }
}

describe('portfolioPerformanceStats', () => {
  it('computes activity and holding stats', () => {
    const trades = [
      trade({ side: 'buy', tradeDate: '2024-01-10', shares: 10, price: 100, fees: 5 }),
      trade({ side: 'sell', tradeDate: '2024-06-01', shares: 3, price: 120 }),
    ]
    const act = computeTradeActivity(trades, 7, '2024-12-01')
    expect(act.tradeCount).toBe(2)
    expect(act.buyCount).toBe(1)
    expect(act.sellCount).toBe(1)
    expect(act.status).toBe('open')
    expect(act.holdingPeriodDays).toBeGreaterThan(0)

    const holding = computeHoldingCostStats(trades, 7, 705, 1005, 700, 700)
    expect(holding.grossBuys).toBe(1005)
    expect(holding.sellProceeds).toBe(360)
    expect(holding.pctSold).toBeCloseTo(0.3)
    expect(holding.concentration).toBe(1)
  })

  it('rolls up portfolio symbol open/closed counts', () => {
    const rollup = computePortfolioActivityRollup([
      { trades: [trade({ symbol: 'A', side: 'buy', tradeDate: '2024-01-01', shares: 1, price: 1 })], ledgerShares: 1 },
      {
        trades: [
          trade({ symbol: 'B', side: 'buy', tradeDate: '2024-01-01', shares: 1, price: 1 }),
          trade({ symbol: 'B', side: 'sell', tradeDate: '2024-02-01', shares: 1, price: 2 }),
        ],
        ledgerShares: 0,
      },
    ])
    expect(rollup.tradeCount).toBe(3)
    expect(rollup.openSymbolCount).toBe(1)
    expect(rollup.closedSymbolCount).toBe(1)
  })

  it('computes TWR from price history between flows', () => {
    const trades = [
      trade({ side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 98 }),
    ]
    const points = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-02-01', close: 110 },
    ]
    const r = computeTimeWeightedReturn(trades, points, '2024-02-01')
    expect(r.status).toBe('ok')
    expect(r.twr).toBeCloseTo(0.1, 4)
  })

  it('builds return progression with pct from gross buys', () => {
    const trades = [
      trade({ side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 100 }),
    ]
    const map = new Map([['TST', trades]])
    const hist = {
      TST: [
        { date: '2024-01-02', close: 100 },
        { date: '2024-01-03', close: 110 },
      ],
    }
    const r = buildReturnProgression(map, hist, '2024-01-03')
    expect(r.points.length).toBeGreaterThanOrEqual(2)
    const last = r.points[r.points.length - 1]!
    expect(last.totalPnl).toBeCloseTo(10, 4)
    expect(last.returnPct).toBeCloseTo(0.1, 4)
    expect(ledgerSnapshotAt(trades, '2024-01-02').grossBuys).toBe(100)
  })

  it('uses latest history on as-of date when daily close is stale', () => {
    const trades = [
      trade({ side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 100 }),
    ]
    const r = buildReturnProgression(
      new Map([['TST', trades]]),
      { TST: [{ date: '2024-01-02', close: 120 }] },
      '2024-01-02',
    )
    const last = r.points.at(-1)!
    expect(last.totalPnl).toBeCloseTo(20, 4)
    expect(last.returnPct).toBeCloseTo(0.2, 4)
  })

  it('marks gaps when history missing for open position', () => {
    const trades = [
      trade({ side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 100 }),
    ]
    const r = buildReturnProgression(
      new Map([['TST', trades]]),
      { TST: [{ date: '2024-01-02', close: 100 }] },
      '2024-06-01',
    )
    expect(r.missingHistorySymbols).toContain('TST')
    expect(r.points.some((p) => p.totalPnl == null)).toBe(true)
  })

  it('marks TWR unavailable when history is missing', () => {
    const trades = [
      trade({ side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 100 }),
    ]
    const r = computeTimeWeightedReturn(trades, [{ date: '2024-01-02', close: 100 }], '2024-06-01')
    expect(r.status).toBe('unavailable')
  })
})
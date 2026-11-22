import { describe, expect, it } from 'vitest'
import type { PortfolioTrade } from '../../src/types'
import { todayIsoDate } from '../../src/lib/portfolioTrades'
import {
  computeCapitalContributionStats,
  computeMoneyWeightedReturn,
} from '../../src/lib/portfolioReturnMetrics'

const BOOK = '11111111-1111-4111-8111-111111111111'

function eqTrade(
  partial: Partial<PortfolioTrade> & Pick<PortfolioTrade, 'side' | 'tradeDate' | 'shares' | 'price'>,
): PortfolioTrade {
  return {
    id: partial.id ?? crypto.randomUUID(),
    portfolioId: BOOK,
    symbol: partial.symbol ?? 'AAPL',
    side: partial.side,
    tradeDate: partial.tradeDate,
    shares: partial.shares,
    price: partial.price,
    currency: 'USD',
    fees: partial.fees ?? 0,
    instrument: 'equity',
    event: 'trade',
  }
}

describe('portfolioReturnMetrics', () => {
  it('tracks current and peak net capital through rebuys', () => {
    const trades = [
      eqTrade({ side: 'buy', tradeDate: '2024-01-02', shares: 10, price: 100 }),
      eqTrade({ side: 'sell', tradeDate: '2024-06-01', shares: 10, price: 150 }),
      eqTrade({ side: 'buy', tradeDate: '2024-07-01', shares: 10, price: 150 }),
    ]
    const stats = computeCapitalContributionStats(trades, '2024-12-31')
    expect(stats.grossBuys).toBe(2500)
    expect(stats.currentNet).toBe(1000)
    expect(stats.peakNet).toBe(1000)
  })

  it('returns n/a for same-day MWR annualization', () => {
    const asOf = todayIsoDate()
    const trades = [eqTrade({ side: 'buy', tradeDate: asOf, shares: 10, price: 150 })]
    const r = computeMoneyWeightedReturn(trades, 1930, asOf)
    expect(r.status).toBe('unavailable')
    expect(r.reason).toContain('short')
  })

  it('computes MWR on a closed round-trip', () => {
    const trades = [
      eqTrade({ side: 'buy', tradeDate: '2024-01-02', shares: 10, price: 100 }),
      eqTrade({ side: 'sell', tradeDate: '2024-06-01', shares: 10, price: 110 }),
    ]
    const r = computeMoneyWeightedReturn(trades, 0, '2024-06-01')
    expect(r.status).toBe('ok')
    expect(r.mwr).toBeGreaterThan(0)
  })
})
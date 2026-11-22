import { describe, expect, it } from 'vitest'
import type { PortfolioTrade } from '../../src/types'
import { todayIsoDate } from '../../src/lib/portfolioTrades'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import {
  buildPeakNetInvestedTimeline,
  computeCapitalContributionStats,
  computeMoneyWeightedReturn,
  tradeBuyContribution,
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
  it('uses trade-date FX for buy contributions in CHF display', () => {
    const trades = [
      eqTrade({ side: 'buy', tradeDate: '2020-01-02', shares: 10, price: 100 }),
    ]
    const spotCtx: PerfDisplayContext = {
      displayCurrency: 'CHF',
      usdToChf: 0.5,
      quoteCurrencyBySymbol: {},
    }
    const histCtx: PerfDisplayContext = {
      ...spotCtx,
      usdToChfByTradeDate: { '2020-01-02': 0.9 },
    }
    expect(tradeBuyContribution(trades[0]!, spotCtx)).toBe(500)
    expect(tradeBuyContribution(trades[0]!, histCtx)).toBe(900)
  })

  it('aggregates same-day flows so peak is not inflated by trade order', () => {
    const trades = [
      eqTrade({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        side: 'buy',
        tradeDate: '2024-06-01',
        shares: 10,
        price: 100,
      }),
      eqTrade({
        id: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
        side: 'sell',
        tradeDate: '2024-06-01',
        shares: 10,
        price: 60,
      }),
    ]
    const stats = computeCapitalContributionStats(trades, '2024-12-31')
    expect(stats.currentNet).toBe(400)
    expect(stats.peakNet).toBe(400)
  })

  it('buildPeakNetInvestedTimeline marks the peak day row', () => {
    const trades = [
      eqTrade({ side: 'buy', tradeDate: '2024-01-02', shares: 10, price: 100 }),
      eqTrade({ side: 'sell', tradeDate: '2024-06-01', shares: 5, price: 100 }),
    ]
    const rows = buildPeakNetInvestedTimeline(trades, '2024-12-31')
    const peak = rows.find((r) => r.isPeak)
    expect(peak?.runningTotal).toBe(1000)
    expect(rows[rows.length - 1]!.runningTotal).toBe(500)
  })

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
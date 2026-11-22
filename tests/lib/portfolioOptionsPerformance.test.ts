import { describe, expect, it } from 'vitest'
import type { PortfolioTrade, SavedPortfolio } from '../../src/types'
import {
  computeOptionsPerformanceAggregate,
  optionTradesForReturnMarkers,
  tradedEquitySymbolsFromTrades,
  tradesMatchingPerformanceScope,
} from '../../src/lib/portfolioOptionsPerformance'
import { normalizePortfolioTrade } from '../../src/lib/portfolioTrades'
import { buildReturnChartOptionMarkers } from '../../src/lib/returnChartOptionMarkers'
import { buildReturnProgression } from '../../src/lib/portfolioPerformanceStats'

const PORT_ID = '11111111-1111-4111-8111-111111111111'
const emptyBook: SavedPortfolio = {
  id: PORT_ID,
  name: 'Test',
  currentCash: 0,
  deposits: [],
  holdings: [],
  actions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const emptyScenarios: [] = []

function opt(partial: Record<string, unknown>) {
  return normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    currency: 'USD',
    ...partial,
  })
}

function eq(partial: Record<string, unknown>) {
  return normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'equity',
    currency: 'USD',
    ...partial,
  })
}

describe('portfolioOptionsPerformance', () => {
  it('lists only equity tickers for scope selector', () => {
    const trades = [
      eq({ symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-01', shares: 1, price: 1 }),
      eq({ symbol: 'MSFT', side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 1 }),
      opt({
        symbol: 'AAPL240119C00150000',
        side: 'sell',
        tradeDate: '2024-01-03',
        shares: 1,
        price: 2,
      }),
    ].filter(Boolean) as NonNullable<ReturnType<typeof normalizePortfolioTrade>>[]
    expect(tradedEquitySymbolsFromTrades(trades).sort()).toEqual(['AAPL', 'MSFT'])
  })

  it('scopes performance trades to equity only', () => {
    const trades = [
      eq({ symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-01', shares: 1, price: 1 }),
      opt({
        symbol: 'AAPL240119C00150000',
        side: 'sell',
        tradeDate: '2024-01-03',
        shares: 1,
        price: 2,
      }),
    ].filter(Boolean) as NonNullable<ReturnType<typeof normalizePortfolioTrade>>[]
    const scoped = tradesMatchingPerformanceScope(trades, 'AAPL')
    expect(scoped).toHaveLength(1)
    expect(scoped[0]?.symbol).toBe('AAPL')
  })

  it('filters option markers by underlying when scoped', () => {
    const trades = [
      opt({
        symbol: 'AAPL240119C00150000',
        side: 'sell',
        tradeDate: '2024-01-03',
        shares: 1,
        price: 2,
      }),
      opt({
        symbol: 'MSFT240119C00400000',
        side: 'sell',
        tradeDate: '2024-01-04',
        shares: 1,
        price: 3,
      }),
    ].filter(Boolean) as NonNullable<ReturnType<typeof normalizePortfolioTrade>>[]
    expect(optionTradesForReturnMarkers(trades, null)).toHaveLength(2)
    expect(optionTradesForReturnMarkers(trades, 'AAPL')).toHaveLength(1)
  })

  it('computes book-wide win rate on closed OCC series', () => {
    const winOpen = opt({
      symbol: 'HIMS261016P00025000',
      side: 'sell',
      tradeDate: '2026-01-30',
      shares: 1,
      price: 5,
    })
    const winClose = opt({
      symbol: 'HIMS261016P00025000',
      side: 'buy',
      tradeDate: '2026-02-01',
      shares: 1,
      price: 1,
    })
    const lossOpen = opt({
      symbol: 'PLTR250919C00047000',
      side: 'sell',
      tradeDate: '2024-12-11',
      shares: 1,
      price: 2,
    })
    const lossClose = opt({
      symbol: 'PLTR250919C00047000',
      side: 'buy',
      tradeDate: '2024-12-20',
      shares: 1,
      price: 10,
    })
    const trades = [winOpen, winClose, lossOpen, lossClose].filter(
      Boolean,
    ) as NonNullable<ReturnType<typeof normalizePortfolioTrade>>[]
    const agg = computeOptionsPerformanceAggregate(
      trades,
      emptyBook,
      emptyScenarios,
      {},
      '2026-03-01',
    )
    expect(agg).not.toBeNull()
    expect(agg!.closedSeries).toBe(2)
    expect(agg!.winRate).toBe(0.5)
    expect(agg!.premiumReceived).toBeGreaterThan(0)
    expect(agg!.premiumPaid).toBeGreaterThan(0)
  })

  it('includes expire and assign rows in return chart option markers', () => {
    const expire = opt({
      symbol: 'AAPL240119C00150000',
      side: 'sell',
      event: 'expire',
      tradeDate: '2024-01-19',
      shares: 1,
      price: 0,
    })
    const assign = opt({
      symbol: 'MSFT240119C00400000',
      side: 'sell',
      event: 'assign',
      tradeDate: '2024-01-20',
      shares: 1,
      price: 0,
    })
    const trades = [expire, assign].filter(
      Boolean,
    ) as NonNullable<ReturnType<typeof normalizePortfolioTrade>>[]
    const map = new Map<string, PortfolioTrade[]>()
    map.set('AAPL', [
      eq({ symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-01', shares: 10, price: 100 })!,
    ])
    const { points } = buildReturnProgression(map, { AAPL: [{ date: '2024-01-19', close: 110 }] })
    const markers = buildReturnChartOptionMarkers(trades, points, 'usd', 'USD', null)
    expect(markers).toHaveLength(2)
    expect(markers.map((m) => m.event).sort()).toEqual(['assign', 'expire'])
  })
})
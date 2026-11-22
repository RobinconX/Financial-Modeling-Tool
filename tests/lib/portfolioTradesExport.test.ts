import { describe, expect, it } from 'vitest'
import {
  buildPortfolioTradesExport,
  clearTradesForPortfolio,
} from '../../src/lib/portfolioTradesExport'
import { normalizePortfolioTrade } from '../../src/lib/portfolioTrades'

const BOOK = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('portfolioTradesExport', () => {
  it('exports current book trades with currency for round-trip', () => {
    const trade = normalizePortfolioTrade({
      portfolioId: BOOK,
      symbol: 'AAPL',
      side: 'buy',
      tradeDate: '2024-01-02',
      shares: 1,
      price: 10,
      currency: 'CHF',
    })!
    const state = { version: 1 as const, trades: [trade] }
    const file = buildPortfolioTradesExport(state, BOOK)
    expect(file.trades).toHaveLength(1)
    expect(file.trades[0]!.currency).toBe('CHF')
    expect(file.portfolioId).toBe(BOOK)
  })

  it('clearTradesForPortfolio keeps other books', () => {
    const state = {
      version: 1 as const,
      trades: [
        { id: 'a', portfolioId: BOOK, symbol: 'X', side: 'buy' as const, tradeDate: '2024-01-01', shares: 1, price: 1 },
        { id: 'b', portfolioId: OTHER, symbol: 'Y', side: 'buy' as const, tradeDate: '2024-01-01', shares: 1, price: 1 },
      ],
    }
    const next = clearTradesForPortfolio(state, BOOK)
    expect(next.trades).toHaveLength(1)
    expect(next.trades[0]!.portfolioId).toBe(OTHER)
  })
})
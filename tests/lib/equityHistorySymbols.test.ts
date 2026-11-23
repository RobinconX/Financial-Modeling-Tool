import { describe, expect, it } from 'vitest'
import { equityHistorySymbolsFromTrades } from '../../src/lib/equityHistorySymbols'
import type { PortfolioTrade } from '../../src/types'

describe('equityHistorySymbolsFromTrades', () => {
  it('excludes OCC symbols and includes underlying', () => {
    const trades: PortfolioTrade[] = [
      {
        id: '1',
        portfolioId: 'p',
        symbol: 'AAPL260321C00150000',
        instrument: 'option',
        side: 'sell',
        tradeDate: '2024-01-02',
        shares: 1,
        price: 2,
        currency: 'USD',
      },
      {
        id: '2',
        portfolioId: 'p',
        symbol: 'MSFT',
        side: 'buy',
        tradeDate: '2024-01-01',
        shares: 1,
        price: 100,
        currency: 'USD',
      },
    ]
    expect(equityHistorySymbolsFromTrades(trades)).toEqual(['AAPL', 'MSFT'])
  })
})
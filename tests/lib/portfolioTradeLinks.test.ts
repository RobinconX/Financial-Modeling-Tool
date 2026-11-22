import { describe, expect, it } from 'vitest'
import type { PortfolioTrade } from '../../src/types'
import { newHolding } from '../../src/lib/portfolio'
import {
  applyEquityTradeHoldingLink,
  backfillPortfolioTradeHoldingLinks,
} from '../../src/lib/portfolioTrades'

const BOOK = '11111111-1111-4111-8111-111111111111'

function basePortfolio(
  holdings: ReturnType<typeof newHolding>[],
) {
  const now = new Date().toISOString()
  return {
    id: BOOK,
    name: 'Test',
    currentCash: 0,
    deposits: [],
    actions: [],
    holdings,
    createdAt: now,
    updatedAt: now,
  }
}

describe('portfolio trade position links', () => {
  it('links when exactly one equity position matches', () => {
    const h = { ...newHolding('AAPL'), id: 'h1', sharesHeld: 10 }
    const portfolio = basePortfolio([h])
    const trade: PortfolioTrade = {
      id: 't1',
      portfolioId: BOOK,
      symbol: 'AAPL',
      side: 'buy',
      tradeDate: '2024-01-02',
      shares: 1,
      price: 100,
      currency: 'USD',
      fees: 0,
      instrument: 'equity',
      event: 'trade',
    }
    expect(applyEquityTradeHoldingLink(trade, portfolio).holdingId).toBe('h1')
  })

  it('does not link when multiple positions share the ticker', () => {
    const portfolio = basePortfolio([
      { ...newHolding('AAPL'), id: 'h1', sharesHeld: 10 },
      { ...newHolding('AAPL'), id: 'h2', sharesHeld: 5 },
    ])
    const trade: PortfolioTrade = {
      id: 't1',
      portfolioId: BOOK,
      symbol: 'AAPL',
      side: 'buy',
      tradeDate: '2024-01-02',
      shares: 1,
      price: 100,
      currency: 'USD',
      fees: 0,
      instrument: 'equity',
      event: 'trade',
    }
    expect(applyEquityTradeHoldingLink(trade, portfolio).holdingId).toBeUndefined()
  })

  it('backfills existing trades on load', () => {
    const portfolio = basePortfolio([
      { ...newHolding('MSFT'), id: 'h1', sharesHeld: 10 },
    ])
    const state = {
      version: 1 as const,
      trades: [
        {
          id: 't1',
          portfolioId: BOOK,
          symbol: 'MSFT',
          side: 'buy' as const,
          tradeDate: '2024-01-02',
          shares: 1,
          price: 10,
          currency: 'USD' as const,
          fees: 0,
          instrument: 'equity' as const,
          event: 'trade' as const,
        },
      ],
    }
    const next = backfillPortfolioTradeHoldingLinks(state, [portfolio], [])
    expect(next.trades[0]!.holdingId).toBe('h1')
  })
})
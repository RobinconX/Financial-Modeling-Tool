import { describe, expect, it } from 'vitest'
import {
  convertAmountToDisplay,
  tradeInDisplayCurrency,
  tradesInDisplayCurrency,
} from '../../src/lib/portfolioTradeFx'
import type { PortfolioTrade } from '../../src/types'

const baseTrade = (over: Partial<PortfolioTrade> = {}): PortfolioTrade => ({
  id: 't1',
  portfolioId: 'book',
  symbol: 'AAPL',
  side: 'buy',
  tradeDate: '2024-01-02',
  shares: 10,
  price: 100,
  currency: 'USD',
  fees: 0,
  ...over,
})

describe('portfolioTradeFx', () => {
  it('converts CHF trade notionals to USD display', () => {
    const t = baseTrade({ price: 90, currency: 'CHF', fees: 1 })
    const d = tradeInDisplayCurrency(t, 'USD', 0.9)
    expect(d.price).toBeCloseTo(100)
    expect(d.fees).toBeCloseTo(1.1111, 3)
  })

  it('leaves USD amounts unchanged when display is USD', () => {
    const trades = tradesInDisplayCurrency([baseTrade()], 'USD', 0.9)
    expect(trades[0]!.price).toBe(100)
  })

  it('convertAmountToDisplay matches amountToDisplay semantics', () => {
    expect(convertAmountToDisplay(100, 'USD', 'CHF', 0.8)).toBeCloseTo(80)
  })
})
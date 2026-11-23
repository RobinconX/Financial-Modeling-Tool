import { describe, expect, it, vi } from 'vitest'
import { equityHistorySymbolsFromTrades } from '../../src/lib/equityHistorySymbols'
import { normalizePortfolioTrade } from '../../src/lib/portfolioTrades'
import { fetchPriceHistory } from '../../server/history'

const PORT_ID = '11111111-1111-4111-8111-111111111111'

function eq(partial: Record<string, unknown>) {
  return normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'equity',
    currency: 'USD',
    ...partial,
  })
}

function opt(partial: Record<string, unknown>) {
  return normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    currency: 'USD',
    ...partial,
  })
}

describe('equityHistorySymbolsFromTrades', () => {
  it('excludes OCC symbols and includes equity tickers and option underlyings', () => {
    const occ = 'HIMS261016P00025000'
    const trades = [
      eq({ symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-01', shares: 1, price: 1 }),
      opt({ symbol: occ, side: 'sell', tradeDate: '2024-02-01', shares: 1, price: 2 }),
      opt({
        symbol: 'MSFT240119C00300000',
        side: 'buy',
        tradeDate: '2024-03-01',
        shares: 2,
        price: 1,
      }),
    ].filter(Boolean) as NonNullable<ReturnType<typeof normalizePortfolioTrade>>[]

    const symbols = equityHistorySymbolsFromTrades(trades, null)
    expect(symbols).not.toContain(occ)
    expect(symbols).not.toContain('MSFT240119C00300000')
    expect(symbols.sort()).toEqual(['AAPL', 'HIMS', 'MSFT'])
  })

  it('adds scoped equity symbol but not OCC scope', () => {
    const trades = [
      opt({ symbol: 'AAPL240119C00150000', side: 'sell', tradeDate: '2024-01-01', shares: 1, price: 1 }),
    ].filter(Boolean) as NonNullable<ReturnType<typeof normalizePortfolioTrade>>[]

    expect(equityHistorySymbolsFromTrades(trades, 'GOOG')).toEqual(['AAPL', 'GOOG'])
    expect(equityHistorySymbolsFromTrades(trades, 'AAPL240119C00150000')).toEqual(['AAPL'])
  })
})

describe('fetchPriceHistory OCC guard', () => {
  it('rejects option contract symbols', async () => {
    await expect(fetchPriceHistory('AAPL260824C00150000')).rejects.toThrow(
      /Option contracts use quotes/i,
    )
  })

  it('does not call Yahoo for OCC symbols', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(fetchPriceHistory('HIMS261016P00025000')).rejects.toThrow(/Option contracts/)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
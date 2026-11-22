import { describe, expect, it } from 'vitest'
import {
  appendPortfolioTrades,
  buildTradeImportPreview,
  parseCsvTradeRows,
  parseTradeImportText,
  tradeDuplicateKey,
} from '../../src/lib/portfolioTradesImport'
const BOOK = '11111111-1111-4111-8111-111111111111'

describe('portfolioTradesImport', () => {
  it('parses CSV rows with optional portfolioId', () => {
    const rows = parseCsvTradeRows(
      'symbol,side,tradeDate,shares,price\nAAPL,buy,2024-01-02,10,100',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ symbol: 'AAPL', side: 'buy' })
  })

  it('reassigns portfolioId and strips unknown holdingId', () => {
    const preview = buildTradeImportPreview(
      [
        {
          portfolioId: 'other-book',
          symbol: 'MSFT',
          side: 'buy',
          tradeDate: '2024-06-01',
          shares: 5,
          price: 400,
          holdingId: 'missing-h',
        },
      ],
      BOOK,
      [],
      new Set(['h-real']),
    )
    expect(preview.valid).toHaveLength(1)
    expect(preview.valid[0]!.trade.portfolioId).toBe(BOOK)
    expect(preview.valid[0]!.reassignedBook).toBe(true)
    expect(preview.valid[0]!.strippedHoldingLink).toBe(true)
    expect(preview.valid[0]!.trade.holdingId).toBeUndefined()
  })

  it('flags duplicates and skips on append by default', () => {
    const existing = {
      id: 'e1',
      portfolioId: BOOK,
      symbol: 'AAPL',
      side: 'buy' as const,
      tradeDate: '2024-01-02',
      shares: 1,
      price: 10,
      currency: 'USD' as const,
      fees: 0,
    }
    const state = { version: 1 as const, trades: [existing] }
    const preview = buildTradeImportPreview(
      [
        { symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 10 },
        { symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 10 },
      ],
      BOOK,
      [existing],
      new Set(),
    )
    expect(preview.duplicateExistingCount).toBeGreaterThan(0)
    expect(tradeDuplicateKey(existing)).toBe('equity|trade|AAPL|buy|2024-01-02|1|10|USD|')
    const skipped = appendPortfolioTrades(state, preview, BOOK, 'skip')
    expect(skipped.imported).toBe(0)
    const added = appendPortfolioTrades(state, preview, BOOK, 'import')
    expect(added.imported).toBe(2)
    expect(added.state.trades.length).toBe(3)
  })

  it('parses JSON trades array from paste', () => {
    const rows = parseTradeImportText(
      '[{"symbol":"TST","side":"sell","tradeDate":"2024-03-01","shares":2,"price":50}]',
      'json',
    )
    expect(rows).toHaveLength(1)
  })
})
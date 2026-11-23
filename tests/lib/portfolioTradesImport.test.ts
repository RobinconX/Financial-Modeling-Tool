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
    expect(tradeDuplicateKey(existing)).toBe(
      'equity|trade|AAPL|buy|2024-01-02|1|10|USD|0|USD||',
    )
    const skipped = appendPortfolioTrades(state, preview, BOOK, 'skip')
    expect(skipped.imported).toBe(0)
    const added = appendPortfolioTrades(state, preview, BOOK, 'import')
    expect(added.imported).toBe(2)
    expect(added.state.trades.length).toBe(3)
  })

  it('does not flag duplicate when fees differ', () => {
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
      feesCurrency: 'USD' as const,
    }
    const preview = buildTradeImportPreview(
      [{ symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 10, fees: 1.2 }],
      BOOK,
      [existing],
      new Set(),
    )
    expect(preview.valid[0]!.duplicateOfExisting).toBe(false)
    expect(preview.duplicateExistingCount).toBe(0)
  })

  it('does not flag duplicate when feesCurrency differs', () => {
    const base = {
      id: 'e1',
      portfolioId: BOOK,
      symbol: 'AAPL',
      side: 'buy' as const,
      tradeDate: '2024-01-02',
      shares: 1,
      price: 10,
      currency: 'USD' as const,
      fees: 1,
    }
    const chfFees = { ...base, feesCurrency: 'CHF' as const, id: 'e2' }
    const preview = buildTradeImportPreview(
      [{ symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-02', shares: 1, price: 10, fees: 1 }],
      BOOK,
      [chfFees],
      new Set(),
    )
    expect(preview.valid[0]!.duplicateOfExisting).toBe(false)
  })

  it('still flags duplicate when only note differs', () => {
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
      note: 'first',
    }
    const preview = buildTradeImportPreview(
      [
        {
          symbol: 'AAPL',
          side: 'buy',
          tradeDate: '2024-01-02',
          shares: 1,
          price: 10,
          note: 're-import annotation',
        },
      ],
      BOOK,
      [existing],
      new Set(),
    )
    expect(preview.valid[0]!.duplicateOfExisting).toBe(true)
  })

  it('distinguishes option rows by multiplier', () => {
    const existing = {
      id: 'e1',
      portfolioId: BOOK,
      instrument: 'option' as const,
      symbol: 'AAPL250117C00150000',
      side: 'buy' as const,
      tradeDate: '2024-01-02',
      shares: 1,
      price: 2,
      currency: 'USD' as const,
      fees: 0,
      multiplier: 100,
    }
    const preview = buildTradeImportPreview(
      [
        {
          instrument: 'option',
          symbol: 'AAPL250117C00150000',
          side: 'buy',
          tradeDate: '2024-01-02',
          shares: 1,
          price: 2,
          multiplier: 50,
        },
      ],
      BOOK,
      [existing],
      new Set(),
    )
    expect(preview.valid[0]!.duplicateOfExisting).toBe(false)
  })

  it('parses JSON trades array from paste', () => {
    const rows = parseTradeImportText(
      '[{"symbol":"TST","side":"sell","tradeDate":"2024-03-01","shares":2,"price":50}]',
      'json',
    )
    expect(rows).toHaveLength(1)
  })
})
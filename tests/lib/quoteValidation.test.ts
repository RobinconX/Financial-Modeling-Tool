import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  isUsableQuote,
  isQuoteNoDataError,
  lookupSymbolQuote,
  quoteMissingDataWarning,
  symbolsMissingQuotes,
} from '../../src/lib/quoteValidation'
import type { Quote } from '../../src/types'

vi.mock('../../src/lib/quote', () => ({
  fetchQuoteClient: vi.fn(),
}))

import { fetchQuoteClient } from '../../src/lib/quote'

afterEach(() => {
  vi.mocked(fetchQuoteClient).mockReset()
})

const goodQuote: Quote = {
  symbol: 'NESN.SW',
  name: 'Nestlé',
  price: 82.5,
  currency: 'CHF',
  marketCap: 1e11,
  sharesOutstanding: null,
  instrumentType: null,
}

describe('quoteValidation', () => {
  it('isUsableQuote requires finite positive price', () => {
    expect(isUsableQuote(goodQuote)).toBe(true)
    expect(isUsableQuote({ ...goodQuote, price: 0 })).toBe(false)
    expect(isUsableQuote(null)).toBe(false)
  })

  it('quoteMissingDataWarning names the symbol and cites Yahoo-style examples', () => {
    expect(quoteMissingDataWarning('brk.b')).toContain('BRK.B')
    expect(quoteMissingDataWarning('brk.b')).toMatch(/BRK-B/)
    expect(quoteMissingDataWarning('brk.b')).toMatch(/NESN\.SW/)
  })

  it('isQuoteNoDataError detects server message', () => {
    expect(isQuoteNoDataError('No data for symbol BRK.B')).toBe(true)
    expect(isQuoteNoDataError('Network error')).toBe(false)
  })

  it('lookupSymbolQuote returns no_data when fetch throws no data', async () => {
    vi.mocked(fetchQuoteClient).mockRejectedValue(new Error('No data for symbol BRK.B'))
    const result = await lookupSymbolQuote('BRK.B')
    expect(result).toEqual({ status: 'no_data' })
  })

  it('symbolsMissingQuotes flags symbols not returned in batch', () => {
    const missing = symbolsMissingQuotes(['BRK.B', 'NESN.SW'], [goodQuote])
    expect(missing.has('BRK.B')).toBe(true)
    expect(missing.has('NESN.SW')).toBe(false)
  })

  it('lookupSymbolQuote returns ok for usable quotes', async () => {
    vi.mocked(fetchQuoteClient).mockResolvedValue(goodQuote)
    const result = await lookupSymbolQuote('NESN.SW')
    expect(result).toEqual({ status: 'ok', quote: goodQuote })
  })
})

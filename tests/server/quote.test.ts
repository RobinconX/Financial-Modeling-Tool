import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchQuote, fetchQuotes } from '../../server/quote'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  }
}

describe('fetchQuote', () => {
  it('rejects invalid symbols', async () => {
    await expect(fetchQuote('')).rejects.toThrow(/Invalid ticker/)
    await expect(fetchQuote('!!!')).rejects.toThrow(/Invalid ticker/)
  })

  it('uses Yahoo batch quote when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/v7/finance/quote')) {
          return jsonResponse({
            quoteResponse: {
              result: [
                {
                  symbol: 'AAPL',
                  regularMarketPrice: 200,
                  longName: 'Apple Inc.',
                  currency: 'USD',
                  marketCap: 3_000_000_000_000,
                  sharesOutstanding: 15_000_000_000,
                },
              ],
            },
          })
        }
        return jsonResponse({}, false)
      }),
    )

    const q = await fetchQuote('aapl')
    expect(q.symbol).toBe('AAPL')
    expect(q.price).toBe(200)
    expect(q.name).toBe('Apple Inc.')
    expect(q.marketCap).toBe(3_000_000_000_000)
    expect(q.sharesOutstanding).toBe(15_000_000_000)
  })

  it('falls back to chart + Nasdaq when batch misses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/v7/finance/quote')) {
          return jsonResponse({ quoteResponse: { result: [] } })
        }
        if (u.includes('finance.yahoo.com') && u.includes('/chart/')) {
          return jsonResponse({
            chart: {
              result: [
                {
                  meta: {
                    symbol: 'AAPL',
                    regularMarketPrice: 200,
                    longName: 'Apple Inc.',
                    currency: 'USD',
                  },
                },
              ],
            },
          })
        }
        if (u.includes('/summary')) {
          return jsonResponse({
            data: { summaryData: { MarketCap: { value: '$3,000,000,000,000' } } },
          })
        }
        if (u.includes('/info')) {
          return jsonResponse({
            data: {
              companyName: 'Apple Inc.',
              primaryData: { lastSalePrice: '$200.00' },
            },
          })
        }
        return jsonResponse({}, false)
      }),
    )

    const q = await fetchQuote('aapl')
    expect(q.symbol).toBe('AAPL')
    expect(q.price).toBe(200)
    expect(q.marketCap).toBe(3_000_000_000_000)
  })

  it('throws when no price available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/v7/finance/quote')) {
          return jsonResponse({ quoteResponse: { result: [] } })
        }
        return jsonResponse({ chart: { result: [] } })
      }),
    )
    await expect(fetchQuote('ZZZZ')).rejects.toThrow(/No data/)
  })
})

describe('fetchQuotes', () => {
  it('batches many symbols in one Yahoo request', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/v7/finance/quote')) {
        expect(u).toContain('AAPL')
        expect(u).toContain('MSFT')
        return jsonResponse({
          quoteResponse: {
            result: [
              {
                symbol: 'AAPL',
                regularMarketPrice: 200,
                longName: 'Apple Inc.',
                currency: 'USD',
                marketCap: 3e12,
              },
              {
                symbol: 'MSFT',
                regularMarketPrice: 400,
                longName: 'Microsoft',
                currency: 'USD',
                marketCap: 3e12,
              },
            ],
          },
        })
      }
      return jsonResponse({}, false)
    })
    vi.stubGlobal('fetch', fetchMock)

    const quotes = await fetchQuotes(['aapl', 'MSFT', 'aapl'])
    expect(quotes).toHaveLength(2)
    expect(quotes.map((q) => q.symbol)).toEqual(['AAPL', 'MSFT'])
    // One batch call; no per-symbol chart/nasdaq
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns empty for only invalid symbols', async () => {
    const quotes = await fetchQuotes(['!!!', ''])
    expect(quotes).toEqual([])
  })
})

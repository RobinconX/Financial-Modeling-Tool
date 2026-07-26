import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchQuote } from '../../server/quote'

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

  it('merges Yahoo price with Nasdaq mcap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('finance.yahoo.com')) {
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
    expect(q.name).toBe('Apple Inc.')
    expect(q.marketCap).toBe(3_000_000_000_000)
    expect(q.sharesOutstanding).toBeCloseTo(3_000_000_000_000 / 200)
  })

  it('throws when no price available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ chart: { result: [] } })),
    )
    await expect(fetchQuote('ZZZZ')).rejects.toThrow(/No data/)
  })
})

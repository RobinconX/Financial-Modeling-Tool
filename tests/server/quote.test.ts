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

  it('accepts OCC option symbols', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/chart/AAPL260821C00150000')) {
          return jsonResponse({
            chart: {
              result: [
                {
                  meta: {
                    symbol: 'AAPL260821C00150000',
                    regularMarketPrice: 4.2,
                    shortName: 'AAPL Aug 2026 150 call',
                    currency: 'USD',
                  },
                },
              ],
            },
          })
        }
        return jsonResponse({}, false)
      }),
    )
    const q = await fetchQuote('AAPL260821C00150000')
    expect(q.price).toBe(4.2)
    expect(q.marketCap).toBeNull()
  })

  it('uses chart + Nasdaq for single quote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/chart/')) {
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
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/spark')) {
          return jsonResponse({ spark: { result: [] } })
        }
        return jsonResponse({ chart: { result: [] } })
      }),
    )
    await expect(fetchQuote('ZZZZ')).rejects.toThrow(/No data/)
  })
})

describe('fetchQuotes', () => {
  it('batches many symbols via Yahoo spark + Nasdaq mcap', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/v7/finance/spark')) {
        expect(u).toContain('AAPL')
        expect(u).toContain('MSFT')
        return jsonResponse({
          spark: {
            result: [
              {
                symbol: 'AAPL',
                response: [
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
              {
                symbol: 'MSFT',
                response: [
                  {
                    meta: {
                      symbol: 'MSFT',
                      regularMarketPrice: 400,
                      longName: 'Microsoft',
                      currency: 'USD',
                    },
                  },
                ],
              },
            ],
          },
        })
      }
      if (u.includes('nasdaq.com') && u.includes('/summary') && u.includes('AAPL')) {
        return jsonResponse({
          data: { summaryData: { MarketCap: { value: '$3,000,000,000,000' } } },
        })
      }
      if (u.includes('nasdaq.com') && u.includes('/summary') && u.includes('MSFT')) {
        return jsonResponse({
          data: { summaryData: { MarketCap: { value: '$2,000,000,000,000' } } },
        })
      }
      return jsonResponse({}, false)
    })
    vi.stubGlobal('fetch', fetchMock)

    const quotes = await fetchQuotes(['aapl', 'MSFT', 'aapl'])
    expect(quotes).toHaveLength(2)
    expect(quotes.map((q) => q.symbol)).toEqual(['AAPL', 'MSFT'])
    expect(quotes[0]!.price).toBe(200)
    expect(quotes[0]!.marketCap).toBe(3_000_000_000_000)
    expect(quotes[0]!.sharesOutstanding).toBeCloseTo(3_000_000_000_000 / 200)
    expect(quotes[1]!.price).toBe(400)
    expect(quotes[1]!.marketCap).toBe(2_000_000_000_000)
    // 1 spark + parallel nasdaq summary calls (stocks, maybe etf) — not chart fallbacks
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/spark'))).toBe(true)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nasdaq.com'))).toBe(true)
  })

  it('falls back when spark misses a symbol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/spark')) {
          return jsonResponse({
            spark: {
              result: [
                {
                  symbol: 'AAPL',
                  response: [
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
              ],
            },
          })
        }
        if (u.includes('/chart/MSFT')) {
          return jsonResponse({
            chart: {
              result: [
                {
                  meta: {
                    symbol: 'MSFT',
                    regularMarketPrice: 400,
                    longName: 'Microsoft',
                    currency: 'USD',
                  },
                },
              ],
            },
          })
        }
        if (u.includes('nasdaq.com')) {
          return jsonResponse({ data: {} })
        }
        return jsonResponse({}, false)
      }),
    )

    const quotes = await fetchQuotes(['AAPL', 'MSFT'])
    expect(quotes.map((q) => q.symbol).sort()).toEqual(['AAPL', 'MSFT'])
  })

  it('returns empty for only invalid symbols', async () => {
    const quotes = await fetchQuotes(['!!!', ''])
    expect(quotes).toEqual([])
  })

  it('pricesOnly skips Nasdaq and only uses spark', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/v7/finance/spark')) {
        return jsonResponse({
          spark: {
            result: [
              {
                symbol: 'AAPL',
                response: [
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
            ],
          },
        })
      }
      return jsonResponse({}, false)
    })
    vi.stubGlobal('fetch', fetchMock)

    const quotes = await fetchQuotes(['AAPL'], { pricesOnly: true })
    expect(quotes).toHaveLength(1)
    expect(quotes[0]!.price).toBe(200)
    expect(quotes[0]!.marketCap).toBeNull()
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes('nasdaq.com'))).toBe(
      true,
    )
  })
})

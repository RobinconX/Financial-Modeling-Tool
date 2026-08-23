import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFxRate } from '../../server/fx'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function yahooBody(price: number, time = 1_777_000_000) {
  return {
    chart: {
      result: [{ meta: { regularMarketPrice: price, regularMarketTime: time } }],
    },
  }
}

describe('fetchFxRate', () => {
  it('returns rate 1 for same currency', async () => {
    const q = await fetchFxRate('usd', 'USD')
    expect(q.rate).toBe(1)
    expect(q.from).toBe('USD')
    expect(q.to).toBe('USD')
  })

  it('throws on missing codes', async () => {
    await expect(fetchFxRate('', 'CHF')).rejects.toThrow(/Missing currency/)
  })

  it('uses Yahoo live pair when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => yahooBody(0.8123),
      }),
    )
    const q = await fetchFxRate('USD', 'CHF')
    expect(q.rate).toBe(0.8123)
    expect(q.asOf).toBe(new Date().toISOString().slice(0, 10))
    expect(q.from).toBe('USD')
    expect(q.to).toBe('CHF')
  })

  it('inverts Yahoo pair when USDCHF is missing but CHFUSD exists', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => yahooBody(1.25),
      })
    vi.stubGlobal('fetch', fetchMock)
    const q = await fetchFxRate('USD', 'CHF')
    expect(q.rate).toBeCloseTo(0.8)
    expect(q.from).toBe('USD')
    expect(q.to).toBe('CHF')
  })

  it('falls back to Frankfurter when Yahoo fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          base: 'USD',
          date: '2026-07-20',
          rates: { CHF: 0.88 },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const q = await fetchFxRate('USD', 'CHF')
    expect(q.rate).toBe(0.88)
    expect(q.asOf).toBe('2026-07-20')
  })

  it('throws when HTTP fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )
    await expect(fetchFxRate('USD', 'CHF')).rejects.toThrow(/FX request failed/)
  })

  it('throws when Frankfurter rate missing after Yahoo miss', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rates: {} }),
      }),
    )
    await expect(fetchFxRate('USD', 'CHF')).rejects.toThrow(/No rate/)
  })
})

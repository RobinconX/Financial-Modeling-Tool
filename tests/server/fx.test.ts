import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFxRate } from '../../server/fx'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

  it('parses Frankfurter response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          base: 'USD',
          date: '2026-07-20',
          rates: { CHF: 0.88 },
        }),
      }),
    )
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

  it('throws when rate missing', async () => {
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

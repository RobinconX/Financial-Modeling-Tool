import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFrankfurterUsdChfOnDate } from '../../server/historicalFx'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchFrankfurterUsdChfOnDate', () => {
  it('returns null when HTTP fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchFrankfurterUsdChfOnDate('2024-01-02')).resolves.toBeNull()
  })

  it('parses CHF rate from Frankfurter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ date: '2024-03-01', rates: { CHF: 0.8812 } }),
      }),
    )
    const q = await fetchFrankfurterUsdChfOnDate('2024-03-01')
    expect(q?.rate).toBe(0.8812)
    expect(q?.rateDate).toBe('2024-03-01')
  })
})
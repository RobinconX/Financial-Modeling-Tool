import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFrankfurterUsdChfOnDate,
  fetchFrankfurterUsdChfRange,
} from '../../server/historicalFx'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchFrankfurterUsdChfOnDate', () => {
  it('returns null when HTTP fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchFrankfurterUsdChfOnDate('2024-01-02')).resolves.toBeNull()
  })

  it('parses CHF rate from Frankfurter v1', async () => {
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
    expect(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain(
      'api.frankfurter.dev/v1',
    )
  })
})

describe('fetchFrankfurterUsdChfRange', () => {
  it('parses a range payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rates: {
            '2024-01-02': { CHF: 0.88 },
            '2024-01-03': { CHF: 0.881 },
          },
        }),
      }),
    )
    const rates = await fetchFrankfurterUsdChfRange('2024-01-02', '2024-01-10')
    expect(rates?.['2024-01-02']).toBe(0.88)
    expect(rates?.['2024-01-03']).toBe(0.881)
  })
})
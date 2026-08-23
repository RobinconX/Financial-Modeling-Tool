import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOptionChain } from '../../server/options'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchOptionChain', () => {
  it('rejects bad underlyings', async () => {
    await expect(fetchOptionChain('')).rejects.toThrow(/Invalid/)
    await expect(fetchOptionChain('AAPLTOOLONG')).rejects.toThrow(/Invalid/)
  })

  it('parses Nasdaq expiry groups and strikes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            table: {
              rows: [
                { expirygroup: 'August 24, 2026' },
                {
                  expirygroup: '',
                  strike: '150.00',
                  c_Last: '4.20',
                  c_Bid: '4.10',
                  c_Ask: '4.30',
                  c_Volume: '10',
                  c_Openinterest: '100',
                  p_Last: '0.50',
                  p_Bid: '0.45',
                  p_Ask: '0.55',
                  p_Volume: '2',
                  p_Openinterest: '20',
                },
                { expirygroup: 'September 18, 2026' },
                {
                  strike: '200.00',
                  c_Last: '1.10',
                  p_Last: '8.00',
                },
              ],
            },
          },
        }),
      }),
    )
    const chain = await fetchOptionChain('AAPL')
    expect(chain.expirations).toEqual(['2026-08-24', '2026-09-18'])
    expect(chain.expiration).toBe('2026-08-24')
    expect(chain.calls[0]?.occSymbol).toBe('AAPL260824C00150000')
    expect(chain.calls[0]?.last).toBeCloseTo(4.2)
    expect(chain.puts[0]?.occSymbol).toBe('AAPL260824P00150000')
  })
})

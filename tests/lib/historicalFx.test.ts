import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addUtcDays,
  FX_MAX_RANGE_REQUESTS_PER_PREFETCH,
  portfolioNeedsTradeDateFx,
  prefetchUsdChfRatesForTradeDates,
  resetHistoricalFxSessionState,
  resolveUsdToChfForTradeDateSync,
} from '../../src/lib/historicalFx'
import * as historicalFxStorage from '../../src/lib/historicalFxStorage'
import { clearFrankfurterFetchFailure } from '../../src/lib/historicalFxStorage'
import type { PortfolioTrade } from '../../src/types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetHistoricalFxSessionState()
  clearFrankfurterFetchFailure()
})

beforeEach(() => {
  resetHistoricalFxSessionState()
  clearFrankfurterFetchFailure()
})

function eqTrade(
  partial: Partial<PortfolioTrade> & Pick<PortfolioTrade, 'side' | 'tradeDate'>,
): PortfolioTrade {
  return {
    id: partial.id ?? crypto.randomUUID(),
    portfolioId: '11111111-1111-4111-8111-111111111111',
    symbol: partial.symbol ?? 'AAPL',
    side: partial.side,
    tradeDate: partial.tradeDate,
    shares: partial.shares ?? 10,
    price: partial.price ?? 100,
    currency: partial.currency ?? 'USD',
    fees: partial.fees ?? 0,
    instrument: 'equity',
    event: 'trade',
  }
}

describe('historicalFx', () => {
  it('addUtcDays shifts calendar dates', () => {
    expect(addUtcDays('2024-01-15', -1)).toBe('2024-01-14')
  })

  it('detects when trade-date FX is needed', () => {
    expect(portfolioNeedsTradeDateFx([eqTrade({ side: 'buy', tradeDate: '2024-01-01' })], 'CHF')).toBe(
      true,
    )
    expect(
      portfolioNeedsTradeDateFx(
        [eqTrade({ side: 'buy', tradeDate: '2024-01-01', currency: 'CHF' })],
        'CHF',
      ),
    ).toBe(false)
  })

  it('walks back in sync resolver before live spot', () => {
    const cache = { '2024-01-12': 0.88 }
    const exact = resolveUsdToChfForTradeDateSync('2024-01-14', cache, 0.9)
    expect(exact.rate).toBe(0.88)
    expect(exact.usedLiveSpot).toBe(false)
    const spot = resolveUsdToChfForTradeDateSync('2024-01-14', {}, 0.91)
    expect(spot.rate).toBe(0.91)
    expect(spot.usedLiveSpot).toBe(true)
  })

  it('uses one range request and fills multiple trade dates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rates: {
          '2024-06-03': { CHF: 0.91 },
          '2024-06-04': { CHF: 0.912 },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await prefetchUsdChfRatesForTradeDates(
      ['2024-06-03', '2024-06-04'],
      0.87,
    )
    expect(res.ratesByDate['2024-06-03']).toBe(0.91)
    expect(res.ratesByDate['2024-06-04']).toBe(0.912)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.frankfurter.dev/v1')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('..')
  })

  it('dedupes in-flight range fetches', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ rates: { '2024-06-01': { CHF: 0.9 } } }),
              }),
            20,
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    resetHistoricalFxSessionState()
    const [a, b] = await Promise.all([
      prefetchUsdChfRatesForTradeDates(['2024-06-01'], null),
      prefetchUsdChfRatesForTradeDates(['2024-06-01'], null),
    ])
    expect(a.ratesByDate['2024-06-01']).toBe(0.9)
    expect(b.ratesByDate['2024-06-01']).toBe(0.9)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('respects cooldown after failure and warns on spot fallback', async () => {
    vi.spyOn(historicalFxStorage, 'isFrankfurterFetchInCooldown').mockReturnValue(true)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await prefetchUsdChfRatesForTradeDates(['2024-06-05'], 0.87)
    expect(res.ratesByDate['2024-06-05']).toBe(0.87)
    expect(res.warnings.some((w) => w.includes('paused'))).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps range HTTP at FX_MAX_RANGE_REQUESTS_PER_PREFETCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: {} }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const dates = ['2022-01-02', '2024-06-01']
    await prefetchUsdChfRatesForTradeDates(dates, 0.87)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(FX_MAX_RANGE_REQUESTS_PER_PREFETCH)
  })
})
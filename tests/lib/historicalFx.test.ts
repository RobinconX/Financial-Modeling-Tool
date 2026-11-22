import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addUtcDays,
  portfolioNeedsTradeDateFx,
  prefetchUsdChfRatesForTradeDates,
  resolveUsdToChfForTradeDateSync,
} from '../../src/lib/historicalFx'
import type { PortfolioTrade } from '../../src/types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

  it('prefetches Frankfurter rates and warns on spot fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const res = await prefetchUsdChfRatesForTradeDates(['2024-06-05'], 0.87)
    expect(res.ratesByDate['2024-06-05']).toBe(0.87)
    expect(res.warnings.some((w) => w.includes('live'))).toBe(true)
  })
})
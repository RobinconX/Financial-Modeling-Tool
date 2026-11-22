import type { DisplayCurrency, PortfolioTrade } from '../types'
import { fetchFrankfurterUsdChfOnDate } from '../../server/historicalFx'
import {
  cacheFxRateForDate,
  cacheFxRatesBulk,
  readFxDailyCache,
} from './historicalFxStorage'

export const FX_WALK_BACK_DAYS = 14

export function addUtcDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`)
  if (!Number.isFinite(t)) return isoDate
  const d = new Date(t + days * 86_400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function tradeLegCurrencies(t: PortfolioTrade): DisplayCurrency[] {
  const out: DisplayCurrency[] = []
  out.push(t.currency === 'CHF' ? 'CHF' : 'USD')
  if ((t.fees ?? 0) > 0) {
    const feeCur = t.feesCurrency ?? t.currency ?? 'USD'
    out.push(feeCur === 'CHF' ? 'CHF' : 'USD')
  }
  return out
}

/** True when any trade leg must cross USD↔CHF for the active display currency. */
export function portfolioNeedsTradeDateFx(
  trades: PortfolioTrade[],
  displayCurrency: DisplayCurrency,
): boolean {
  for (const t of trades) {
    for (const c of tradeLegCurrencies(t)) {
      if (c !== displayCurrency) return true
    }
  }
  return false
}

export function collectTradeDates(trades: PortfolioTrade[]): string[] {
  const set = new Set<string>()
  for (const t of trades) {
    if (t.tradeDate) set.add(t.tradeDate)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/**
 * Resolve USD→CHF for a trade date: exact cache → walk back → live spot.
 * `resolvedFromDate` is the cache key that supplied the rate (may differ after walk-back).
 */
export function resolveUsdToChfForTradeDateSync(
  isoDate: string,
  cacheByDate: Record<string, number>,
  liveSpot: number | null,
): { rate: number | null; resolvedFromDate: string | null; usedLiveSpot: boolean } {
  if (cacheByDate[isoDate] != null && cacheByDate[isoDate]! > 0) {
    return {
      rate: cacheByDate[isoDate]!,
      resolvedFromDate: isoDate,
      usedLiveSpot: false,
    }
  }
  for (let i = 1; i <= FX_WALK_BACK_DAYS; i++) {
    const prior = addUtcDays(isoDate, -i)
    if (cacheByDate[prior] != null && cacheByDate[prior]! > 0) {
      return {
        rate: cacheByDate[prior]!,
        resolvedFromDate: prior,
        usedLiveSpot: false,
      }
    }
  }
  if (liveSpot != null && liveSpot > 0) {
    return { rate: liveSpot, resolvedFromDate: null, usedLiveSpot: true }
  }
  return { rate: null, resolvedFromDate: null, usedLiveSpot: false }
}

async function fetchAndCacheDate(
  isoDate: string,
  cache: Record<string, number>,
): Promise<void> {
  if (cache[isoDate] != null) return
  const q = await fetchFrankfurterUsdChfOnDate(isoDate)
  if (!q) return
  cache[isoDate] = q.rate
  cacheFxRateForDate(q.rateDate, q.rate)
  if (q.rateDate !== isoDate && cache[isoDate] == null) {
    cache[isoDate] = q.rate
    cacheFxRateForDate(isoDate, q.rate)
  }
}

/**
 * Prefetch Frankfurter daily USD/CHF for trade dates; merge with localStorage cache.
 */
export async function prefetchUsdChfRatesForTradeDates(
  dates: string[],
  liveSpot: number | null,
): Promise<{
  ratesByDate: Record<string, number>
  warnings: string[]
}> {
  const cache = { ...readFxDailyCache() }
  const warnings: string[] = []
  const sorted = [...new Set(dates)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  sorted.sort((a, b) => a.localeCompare(b))

  await Promise.all(sorted.map((d) => fetchAndCacheDate(d, cache)))

  for (const d of sorted) {
    if (cache[d] == null) {
      for (let i = 1; i <= FX_WALK_BACK_DAYS; i++) {
        const prior = addUtcDays(d, -i)
        if (cache[prior] == null) {
          await fetchAndCacheDate(prior, cache)
        }
        if (cache[prior] != null) break
      }
    }
  }

  cacheFxRatesBulk(cache)

  const ratesByDate: Record<string, number> = {}
  for (const d of sorted) {
    const { rate, usedLiveSpot } = resolveUsdToChfForTradeDateSync(d, cache, liveSpot)
    if (rate != null) {
      ratesByDate[d] = rate
      if (usedLiveSpot) {
        warnings.push(`No ECB FX for ${d}; used live USD/CHF spot for trade cash flows.`)
      }
    } else {
      warnings.push(`No USD/CHF rate for ${d}; trade cash flows may be incomplete.`)
    }
  }

  return { ratesByDate, warnings: [...new Set(warnings)] }
}
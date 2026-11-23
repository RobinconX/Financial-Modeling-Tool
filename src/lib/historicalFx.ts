import type { DisplayCurrency, PortfolioTrade } from '../types'
import { fetchFrankfurterUsdChfRange } from '../../server/historicalFx'
import {
  cacheFxRatesBulk,
  clearFrankfurterFetchFailure,
  isFrankfurterFetchInCooldown,
  markFrankfurterFetchFailed,
  readFxDailyCache,
} from './historicalFxStorage'

export const FX_WALK_BACK_DAYS = 14

/** Max HTTP range requests per prefetch (e.g. yearly chunks). */
export const FX_MAX_RANGE_REQUESTS_PER_PREFETCH = 3

let sessionRangeRequestCount = 0

/** Reset in tests. */
export function resetHistoricalFxSessionState(): void {
  sessionRangeRequestCount = 0
  rangeInflight.clear()
}

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

/** Stable key for prefetch effect — trade dates + currency only. */
export function tradeFxPrefetchKey(
  dates: string[],
  displayCurrency: DisplayCurrency,
): string {
  const sorted = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
  return `${displayCurrency}:${sorted.join(',')}`
}

export function parseTradeFxPrefetchKey(
  key: string,
): { displayCurrency: DisplayCurrency; dates: string[] } | null {
  if (!key) return null
  const idx = key.indexOf(':')
  if (idx < 0) return null
  const displayCurrency = key.slice(0, idx) === 'CHF' ? 'CHF' : 'USD'
  const rest = key.slice(idx + 1)
  const dates = rest ? rest.split(',').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []
  return { displayCurrency, dates }
}

function tradeDatesNeedNetwork(
  dates: string[],
  cache: Record<string, number>,
): boolean {
  for (const d of dates) {
    if (cache[d] != null) continue
    let found = false
    for (let i = 1; i <= FX_WALK_BACK_DAYS; i++) {
      if (cache[addUtcDays(d, -i)] != null) {
        found = true
        break
      }
    }
    if (!found) return true
  }
  return false
}

function rangeBounds(
  sortedDates: string[],
): { fetchStart: string; fetchEnd: string } | null {
  if (sortedDates.length === 0) return null
  const min = sortedDates[0]!
  const max = sortedDates[sortedDates.length - 1]!
  const fetchStart = addUtcDays(min, -FX_WALK_BACK_DAYS)
  return { fetchStart, fetchEnd: max }
}

function yearChunks(start: string, end: string): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = []
  const startYear = Number(start.slice(0, 4))
  const endYear = Number(end.slice(0, 4))
  for (let y = startYear; y <= endYear; y++) {
    const yStart = y === startYear ? start : `${y}-01-01`
    const yEnd = y === endYear ? end : `${y}-12-31`
    if (yStart <= yEnd) chunks.push({ start: yStart, end: yEnd })
  }
  return chunks
}

const rangeInflight = new Map<string, Promise<Record<string, number> | null>>()

async function fetchRangeDeduped(
  start: string,
  end: string,
): Promise<Record<string, number> | null> {
  const key = `${start}..${end}`
  const pending = rangeInflight.get(key)
  if (pending) return pending

  const req = (async () => {
    if (sessionRangeRequestCount >= FX_MAX_RANGE_REQUESTS_PER_PREFETCH) {
      return null
    }
    sessionRangeRequestCount += 1
    const rates = await fetchFrankfurterUsdChfRange(start, end)
    if (rates) clearFrankfurterFetchFailure()
    else markFrankfurterFetchFailed()
    return rates
  })().finally(() => {
    rangeInflight.delete(key)
  })

  rangeInflight.set(key, req)
  return req
}

function tradeDatesInRangeNeedNetwork(
  sortedDates: string[],
  rangeStart: string,
  rangeEnd: string,
  cache: Record<string, number>,
): boolean {
  const inRange = sortedDates.filter((d) => d >= rangeStart && d <= rangeEnd)
  return tradeDatesNeedNetwork(inRange, cache)
}

async function fillCacheFromFrankfurter(
  sortedDates: string[],
  cache: Record<string, number>,
): Promise<void> {
  if (sortedDates.length === 0) return
  if (!tradeDatesNeedNetwork(sortedDates, cache)) return
  if (isFrankfurterFetchInCooldown()) return

  const bounds = rangeBounds(sortedDates)
  if (!bounds) return

  const { fetchStart, fetchEnd } = bounds

  if (sessionRangeRequestCount < FX_MAX_RANGE_REQUESTS_PER_PREFETCH) {
    const fullRange = await fetchRangeDeduped(fetchStart, fetchEnd)
    if (fullRange) Object.assign(cache, fullRange)
    if (isFrankfurterFetchInCooldown()) return
    if (!tradeDatesNeedNetwork(sortedDates, cache)) return
  }

  const chunks = yearChunks(fetchStart, fetchEnd)
  for (const { start, end } of chunks) {
    if (sessionRangeRequestCount >= FX_MAX_RANGE_REQUESTS_PER_PREFETCH) break
    if (!tradeDatesInRangeNeedNetwork(sortedDates, start, end, cache)) continue
    const rates = await fetchRangeDeduped(start, end)
    if (rates) Object.assign(cache, rates)
    else if (isFrankfurterFetchInCooldown()) break
  }
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

/**
 * Load Frankfurter daily USD/CHF for trade dates (prefer one min..max range; yearly
 * chunks only if gaps remain; max {@link FX_MAX_RANGE_REQUESTS_PER_PREFETCH} HTTP calls per prefetch).
 */
export async function prefetchUsdChfRatesForTradeDates(
  dates: string[],
  liveSpot: number | null,
): Promise<{
  ratesByDate: Record<string, number>
  warnings: string[]
}> {
  sessionRangeRequestCount = 0
  const cache = { ...readFxDailyCache() }
  const warnings: string[] = []
  const sorted = [...new Set(dates)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  sorted.sort((a, b) => a.localeCompare(b))

  await fillCacheFromFrankfurter(sorted, cache)
  cacheFxRatesBulk(cache)

  const ratesByDate: Record<string, number> = {}
  let spotFallbackCount = 0
  for (const d of sorted) {
    const { rate, usedLiveSpot } = resolveUsdToChfForTradeDateSync(d, cache, liveSpot)
    if (rate != null) {
      ratesByDate[d] = rate
      if (usedLiveSpot) spotFallbackCount += 1
    } else {
      warnings.push(`No USD/CHF rate for ${d}; trade cash flows may be incomplete.`)
    }
  }
  if (spotFallbackCount > 0) {
    warnings.push(
      `ECB daily FX unavailable for ${spotFallbackCount} trade date(s); used live USD/CHF spot for those cash flows.`,
    )
  }
  if (isFrankfurterFetchInCooldown() && tradeDatesNeedNetwork(sorted, cache)) {
    warnings.push(
      'Historical FX fetch paused after a recent failure; using spot where needed (retry in ~30 minutes).',
    )
  }

  return { ratesByDate, warnings: [...new Set(warnings)] }
}
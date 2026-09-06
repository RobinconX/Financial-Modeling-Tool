import { apiUrl, hasExternalApiBase } from './apiBase'

export type PriceHistoryPoint = {
  date: string
  close: number
}

export type PriceHistoryResult = {
  symbol: string
  currency: string
  points: PriceHistoryPoint[]
}

export type CachedPriceHistory = PriceHistoryResult & {
  fetchedAt: string
}

const STALE_MS = 24 * 60 * 60 * 1000

export function isHistoryFresh(fetchedAt: string, now = Date.now()): boolean {
  const t = Date.parse(fetchedAt)
  if (!Number.isFinite(t)) return false
  return now - t < STALE_MS
}

export async function fetchPriceHistoryClient(symbol: string): Promise<PriceHistoryResult> {
  const ticker = symbol.trim().toUpperCase()
  const path = `/api/history?symbol=${encodeURIComponent(ticker)}`
  let res: Response
  try {
    res = await fetch(apiUrl(path), { cache: 'no-store' })
  } catch {
    throw new Error(
      hasExternalApiBase()
        ? `Network error fetching history for ${ticker}`
        : `Price history needs a local dev server or a quote API (set VITE_API_BASE).`,
    )
  }
  if (res.status === 304) {
    throw new Error(`History not modified for ${ticker}`)
  }
  let body: PriceHistoryResult & { error?: string }
  try {
    body = (await res.json()) as PriceHistoryResult & { error?: string }
  } catch {
    throw new Error(
      res.ok
        ? `Invalid history response for ${ticker}`
        : `History API failed (${res.status}).`,
    )
  }
  if (!res.ok) {
    throw new Error(body.error ?? `Failed to fetch history for ${ticker}`)
  }
  return {
    symbol: body.symbol || ticker,
    currency: body.currency || 'USD',
    points: Array.isArray(body.points)
      ? body.points.filter(
          (p) =>
            p &&
            typeof p.date === 'string' &&
            Number.isFinite(p.close) &&
            p.close > 0,
        )
      : [],
  }
}

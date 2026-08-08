import type { Quote } from '../types'
import { apiUrl, hasExternalApiBase } from './apiBase'

async function requestQuoteApi(path: string, label: string): Promise<Response> {
  try {
    return await fetch(apiUrl(path))
  } catch {
    throw new Error(
      hasExternalApiBase()
        ? `Network error fetching quote for ${label}`
        : `Quotes need a local dev server or a quote API (set VITE_API_BASE). See docs/GITHUB_PAGES.md.`,
    )
  }
}

export async function fetchQuoteClient(symbol: string): Promise<Quote> {
  const path = `/api/quote?symbol=${encodeURIComponent(symbol.trim())}`
  const res = await requestQuoteApi(path, symbol)
  let body: Quote & { error?: string }
  try {
    body = (await res.json()) as Quote & { error?: string }
  } catch {
    throw new Error(
      res.ok
        ? `Invalid quote response for ${symbol}`
        : `Quote API failed (${res.status}). On GitHub Pages, deploy the market API worker and set VITE_API_BASE.`,
    )
  }
  if (!res.ok) {
    throw new Error(body.error ?? `Failed to fetch ${symbol}`)
  }
  return body
}

/** Parallel single-symbol fetches (works with older APIs that only accept `symbol=`). */
async function fetchQuotesIndividually(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return await fetchQuoteClient(symbol)
      } catch {
        return null
      }
    }),
  )
  return results.filter((q): q is Quote => q != null)
}

/**
 * One round-trip for many tickers (`/api/quote?symbols=AAPL,MSFT`).
 * Falls back to parallel singles if the batch route is missing (HTTP 400) or fails.
 */
export async function fetchQuotesClient(symbols: string[]): Promise<Quote[]> {
  const cleaned = [
    ...new Set(
      symbols
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0),
    ),
  ]
  if (cleaned.length === 0) return []
  if (cleaned.length === 1) {
    return fetchQuotesIndividually(cleaned)
  }

  // Prefer URLSearchParams so commas are encoded correctly for proxies.
  const qs = new URLSearchParams({ symbols: cleaned.join(',') })
  const path = `/api/quote?${qs.toString()}`

  try {
    const res = await requestQuoteApi(path, cleaned.join(','))
    if (res.ok) {
      const body = (await res.json()) as { quotes?: Quote[]; error?: string }
      if (Array.isArray(body.quotes)) return body.quotes
    }
    // 400 from an old worker that only knows `symbol=` — fall through
  } catch {
    /* fall through to singles */
  }

  return fetchQuotesIndividually(cleaned)
}

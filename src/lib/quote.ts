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

/** One round-trip for many tickers (`/api/quote?symbols=AAPL,MSFT`). */
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
    try {
      return [await fetchQuoteClient(cleaned[0]!)]
    } catch {
      return []
    }
  }

  const path = `/api/quote?symbols=${cleaned.map(encodeURIComponent).join(',')}`
  const res = await requestQuoteApi(path, cleaned.join(','))
  let body: { quotes?: Quote[]; error?: string }
  try {
    body = (await res.json()) as { quotes?: Quote[]; error?: string }
  } catch {
    throw new Error(
      res.ok
        ? 'Invalid batch quote response'
        : `Quote API failed (${res.status}). On GitHub Pages, deploy the market API worker and set VITE_API_BASE.`,
    )
  }
  if (!res.ok) {
    throw new Error(body.error ?? 'Failed to fetch quotes')
  }
  return Array.isArray(body.quotes) ? body.quotes : []
}

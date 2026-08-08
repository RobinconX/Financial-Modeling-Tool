import type { Quote } from '../types'
import { apiUrl, hasExternalApiBase } from './apiBase'

export async function fetchQuoteClient(symbol: string): Promise<Quote> {
  const path = `/api/quote?symbol=${encodeURIComponent(symbol.trim())}`
  let res: Response
  try {
    res = await fetch(apiUrl(path))
  } catch {
    throw new Error(
      hasExternalApiBase()
        ? `Network error fetching quote for ${symbol}`
        : `Quotes need a local dev server or a quote API (set VITE_API_BASE). See docs/GITHUB_PAGES.md.`,
    )
  }
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

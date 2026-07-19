import type { Quote } from '../types'

export async function fetchQuoteClient(symbol: string): Promise<Quote> {
  const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol.trim())}`)
  const body = (await res.json()) as Quote & { error?: string }
  if (!res.ok) {
    throw new Error(body.error ?? `Failed to fetch ${symbol}`)
  }
  return body
}

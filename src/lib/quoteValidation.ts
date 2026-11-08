import type { Quote } from '../types'
import { fetchQuoteClient } from './quote'

export function isUsableQuote(quote: Quote | null | undefined): boolean {
  return (
    quote != null &&
    typeof quote.price === 'number' &&
    Number.isFinite(quote.price) &&
    quote.price > 0
  )
}

/** User-facing warning when Yahoo/market data returns nothing for the typed symbol. */
export function quoteMissingDataWarning(symbol: string): string {
  const s = symbol.trim().toUpperCase() || 'ticker'
  return `No price data found for ${s}. Check the ticker, e.g. Yahoo format such as BRK-B or NESN.SW.`
}

export function isQuoteNoDataError(message: string): boolean {
  return /no data for symbol/i.test(message)
}

export type SymbolQuoteLookup =
  | { status: 'ok'; quote: Quote }
  | { status: 'no_data' }
  | { status: 'error'; message: string }

/** Live quote lookup for symbol validation (no ticker rewriting). */
/** Symbols requested but absent or without a usable price in a batch response. */
export function symbolsMissingQuotes(requested: string[], quotes: Quote[]): Set<string> {
  const quoteBySym = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]))
  const missing = new Set<string>()
  for (const sym of requested) {
    const upper = sym.toUpperCase()
    if (!isUsableQuote(quoteBySym.get(upper))) missing.add(upper)
  }
  return missing
}

export async function lookupSymbolQuote(symbol: string): Promise<SymbolQuoteLookup> {
  const trimmed = symbol.trim()
  if (!trimmed) return { status: 'no_data' }
  try {
    const quote = await fetchQuoteClient(trimmed)
    if (!isUsableQuote(quote)) return { status: 'no_data' }
    return { status: 'ok', quote }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quote'
    if (isQuoteNoDataError(message)) return { status: 'no_data' }
    return { status: 'error', message }
  }
}

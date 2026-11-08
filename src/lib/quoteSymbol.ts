import type { SavedPortfolio, SavedScenario } from '../types'
import { optionIsExpired } from './optionContract'

/** Same charset/length as server `quote.ts` (`normalizeSymbol`). */
export const QUOTE_SYMBOL_RE = /^[A-Z0-9.^=_-]{1,21}$/

export function normalizeQuoteSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase()
  if (!symbol || !QUOTE_SYMBOL_RE.test(symbol)) return null
  return symbol
}

/**
 * Symbols to include in background refresh — aligned with manual/batch quote fetch.
 */
export function gatherAutoRefreshSymbols(
  scenarios: SavedScenario[],
  portfolios: SavedPortfolio[],
): string[] {
  const symbols = new Set<string>()
  for (const s of scenarios) {
    const sym = normalizeQuoteSymbol(s.symbol || '')
    if (sym) symbols.add(sym)
  }
  for (const p of portfolios) {
    for (const h of p.holdings ?? []) {
      const occ = h.option?.occSymbol
      if (occ && h.option && !optionIsExpired(h.option.expiration)) {
        const occNorm = normalizeQuoteSymbol(occ)
        if (occNorm) symbols.add(occNorm)
        continue
      }
      if (h.manualOnly) continue
      const sym = normalizeQuoteSymbol(h.symbol || '')
      if (sym) symbols.add(sym)
    }
  }
  return [...symbols]
}

import { parseOccSymbol } from './optionContract'
import { tradeInstrument, tradeUnderlying } from './portfolioTradeLedger'
import type { PortfolioTrade } from '../types'

/** Equity tickers and option underlyings — never OCC contract symbols (no option price history). */
export function equityHistorySymbolsFromTrades(
  trades: readonly PortfolioTrade[],
  scopeSymbol?: string | null,
): string[] {
  const set = new Set<string>()
  for (const t of trades) {
    if (tradeInstrument(t) === 'option') {
      const u = (tradeUnderlying(t) ?? parseOccSymbol(t.symbol)?.underlying ?? '')
        .trim()
        .toUpperCase()
      if (u) set.add(u)
    } else {
      set.add(t.symbol.toUpperCase())
    }
  }
  if (scopeSymbol) set.add(scopeSymbol.toUpperCase())
  return [...set].sort((a, b) => a.localeCompare(b))
}
import { isOccSymbol, parseOccSymbol } from './optionContract'
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
      if (u && !isOccSymbol(u)) set.add(u)
    } else {
      set.add(t.symbol.toUpperCase())
    }
  }
  const scope = scopeSymbol?.trim().toUpperCase()
  if (scope && !isOccSymbol(scope)) set.add(scope)
  return [...set].sort((a, b) => a.localeCompare(b))
}
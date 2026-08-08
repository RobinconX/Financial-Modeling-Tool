import { useCallback, useEffect, useRef } from 'react'
import type { SavedPortfolio, SavedScenario } from '../types'
import { fetchQuotesClient } from '../lib/quote'
import { resolveSharesOutstanding } from '../lib/sharePrice'

export const QUOTE_REFRESH_MS = 5 * 60 * 1000

type UpdateScenario = (id: string, patch: Partial<SavedScenario>) => boolean

/**
 * Refresh live quotes for all scenario (+ portfolio) tickers on mount and every 5 minutes.
 * One batch API call for all tickers. Does not touch projection assumption rows.
 */
export function useAutoQuoteRefresh(
  scenarios: SavedScenario[],
  portfolios: SavedPortfolio[],
  updateScenario: UpdateScenario,
) {
  const scenariosRef = useRef(scenarios)
  const portfoliosRef = useRef(portfolios)
  const updateRef = useRef(updateScenario)
  scenariosRef.current = scenarios
  portfoliosRef.current = portfolios
  updateRef.current = updateScenario

  const refreshingRef = useRef(false)

  const refreshAll = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    try {
      // Only fetch real equity tickers (1–5 letters). Skip manual/option symbols
      // like LMND45PDEC18 which are not valid quote symbols.
      const isEquityTicker = (sym: string) => /^[A-Z]{1,5}$/.test(sym)

      const symbols = new Set<string>()
      for (const s of scenariosRef.current) {
        const sym = (s.symbol || '').toUpperCase()
        if (sym && isEquityTicker(sym)) symbols.add(sym)
      }
      for (const p of portfoliosRef.current) {
        for (const h of p.holdings ?? []) {
          if (h.manualOnly) continue
          const sym = (h.symbol || '').toUpperCase()
          if (sym && isEquityTicker(sym)) symbols.add(sym)
        }
      }
      if (symbols.size === 0) return

      let quotes
      try {
        quotes = await fetchQuotesClient([...symbols])
      } catch {
        return
      }

      for (const q of quotes) {
        const matches = scenariosRef.current.filter(
          (s) => s.symbol.toUpperCase() === q.symbol.toUpperCase(),
        )
        for (const s of matches) {
          const derivedShares = resolveSharesOutstanding({
            sharesOutstanding: q.sharesOutstanding,
            marketCap: q.marketCap,
            price: q.price,
          })
          updateRef.current(s.id, {
            companyName: q.name,
            currency: q.currency,
            currentPrice: q.price,
            // Keep prior mcap if quote omits it (some symbols return price only)
            currentMarketCap: q.marketCap ?? s.currentMarketCap,
            // Never wipe shares with null from a partial quote
            sharesOutstanding: derivedShares ?? s.sharesOutstanding,
          })
        }
      }
    } finally {
      refreshingRef.current = false
    }
  }, [])

  useEffect(() => {
    void refreshAll()
    const id = window.setInterval(() => {
      void refreshAll()
    }, QUOTE_REFRESH_MS)

    function onVis() {
      if (document.visibilityState === 'visible') void refreshAll()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refreshAll])
}

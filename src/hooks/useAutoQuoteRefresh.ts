import { useCallback, useEffect, useRef } from 'react'
import type { SavedPortfolio, SavedScenario } from '../types'
import { fetchQuoteClient } from '../lib/quote'

export const QUOTE_REFRESH_MS = 5 * 60 * 1000

type UpdateScenario = (id: string, patch: Partial<SavedScenario>) => boolean

/**
 * Refresh live quotes for all scenario (+ portfolio) tickers on mount and every 5 minutes.
 * Does not touch projection assumption rows.
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
      const symbols = new Set<string>()
      for (const s of scenariosRef.current) {
        if (s.symbol) symbols.add(s.symbol.toUpperCase())
      }
      for (const p of portfoliosRef.current) {
        for (const h of p.holdings ?? []) {
          if (h.symbol) symbols.add(h.symbol.toUpperCase())
        }
      }
      if (symbols.size === 0) return

      for (const symbol of symbols) {
        try {
          const q = await fetchQuoteClient(symbol)
          const matches = scenariosRef.current.filter(
            (s) => s.symbol.toUpperCase() === q.symbol.toUpperCase(),
          )
          for (const s of matches) {
            updateRef.current(s.id, {
              companyName: q.name,
              currency: q.currency,
              currentPrice: q.price,
              currentMarketCap: q.marketCap,
              sharesOutstanding: q.sharesOutstanding,
            })
          }
        } catch {
          // Per-symbol failures are non-fatal
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

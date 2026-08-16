import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedPortfolio, SavedScenario } from '../types'
import { fetchQuotesClient } from '../lib/quote'
import { marketCapFromSharePrice } from '../lib/sharePrice'

export const QUOTE_REFRESH_MS = 5 * 60 * 1000

type UpdateScenario = (id: string, patch: Partial<SavedScenario>) => boolean

/**
 * Refresh live quotes for all scenario (+ portfolio) tickers when enabled,
 * on enable, and every 5 minutes. Uses prices-only batch (fast) and keeps
 * prior mcap/shares when the API omits them.
 */
export function useAutoQuoteRefresh(
  scenarios: SavedScenario[],
  portfolios: SavedPortfolio[],
  updateScenario: UpdateScenario,
  enabled = true,
): { quotesLoading: boolean; quoteCount: number } {
  const scenariosRef = useRef(scenarios)
  const portfoliosRef = useRef(portfolios)
  const updateRef = useRef(updateScenario)
  scenariosRef.current = scenarios
  portfoliosRef.current = portfolios
  updateRef.current = updateScenario

  const refreshingRef = useRef(false)
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [quoteCount, setQuoteCount] = useState(0)

  const refreshAll = useCallback(async () => {
    if (!enabled) return
    if (refreshingRef.current) return
    refreshingRef.current = true

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

    const list = [...symbols]
    setQuoteCount(list.length)
    if (list.length === 0) {
      refreshingRef.current = false
      setQuotesLoading(false)
      return
    }

    setQuotesLoading(true)
    try {
      let quotes
      try {
        // pricesOnly: skip Nasdaq on the worker — main latency for multi-ticker refresh
        quotes = await fetchQuotesClient(list, { pricesOnly: true })
      } catch {
        return
      }

      const quoteBySym = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]))
      for (const s of scenariosRef.current) {
        const q = quoteBySym.get(s.symbol.toUpperCase())
        if (!q) continue
        // Prefer API shares; else keep prior shares; else infer once from prior mcap÷price.
        // Do not recompute shares as oldMcap / *new* price (would distort share count).
        let shares: number | null =
          q.sharesOutstanding != null &&
          Number.isFinite(q.sharesOutstanding) &&
          q.sharesOutstanding > 0
            ? q.sharesOutstanding
            : s.sharesOutstanding != null &&
                Number.isFinite(s.sharesOutstanding) &&
                s.sharesOutstanding > 0
              ? s.sharesOutstanding
              : null
        if (
          shares == null &&
          s.currentMarketCap != null &&
          s.currentMarketCap > 0 &&
          s.currentPrice != null &&
          s.currentPrice > 0
        ) {
          shares = s.currentMarketCap / s.currentPrice
        }

        // Live mcap from API when present; else price × shares so today tracks the new price.
        const mcap =
          q.marketCap ??
          marketCapFromSharePrice(q.price, shares) ??
          s.currentMarketCap

        updateRef.current(s.id, {
          companyName: q.name,
          currency: q.currency,
          currentPrice: q.price,
          currentMarketCap: mcap,
          sharesOutstanding: shares,
        })
      }
    } finally {
      refreshingRef.current = false
      setQuotesLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setQuotesLoading(false)
      return
    }
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
  }, [enabled, refreshAll])

  return { quotesLoading, quoteCount }
}

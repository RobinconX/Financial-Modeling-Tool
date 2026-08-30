import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedPortfolio, SavedScenario } from '../types'
import { fetchQuotesClient } from '../lib/quote'
import { marketCapFromSharePrice } from '../lib/sharePrice'
import { optionIsExpired } from '../lib/optionContract'
import { withLinkedMirrorSuppressed } from '../lib/linkedMirrorGate'

export const QUOTE_REFRESH_MS = 5 * 60 * 1000

type UpdateScenario = (id: string, patch: Partial<SavedScenario>) => boolean
type UpdatePortfolio = (id: string, patch: Partial<SavedPortfolio>) => boolean

/**
 * Refresh live quotes for scenario tickers and listed option premiums when
 * enabled, on enable, and every 5 minutes.
 */
export function useAutoQuoteRefresh(
  scenarios: SavedScenario[],
  portfolios: SavedPortfolio[],
  updateScenario: UpdateScenario,
  updatePortfolio: UpdatePortfolio,
  enabled = true,
): { quotesLoading: boolean; quoteCount: number } {
  const scenariosRef = useRef(scenarios)
  const portfoliosRef = useRef(portfolios)
  const updateRef = useRef(updateScenario)
  const updatePortfolioRef = useRef(updatePortfolio)
  scenariosRef.current = scenarios
  portfoliosRef.current = portfolios
  updateRef.current = updateScenario
  updatePortfolioRef.current = updatePortfolio

  const refreshingRef = useRef(false)
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [quoteCount, setQuoteCount] = useState(0)

  const refreshAll = useCallback(async () => {
    if (!enabled) return
    if (refreshingRef.current) return
    refreshingRef.current = true

    const isEquityTicker = (sym: string) => /^[A-Z]{1,5}$/.test(sym)

    const symbols = new Set<string>()
    for (const s of scenariosRef.current) {
      const sym = (s.symbol || '').toUpperCase()
      if (sym && isEquityTicker(sym)) symbols.add(sym)
    }
    for (const p of portfoliosRef.current) {
      for (const h of p.holdings ?? []) {
        const occ = h.option?.occSymbol?.toUpperCase()
        if (occ && h.option && !optionIsExpired(h.option.expiration)) {
          symbols.add(occ)
          continue
        }
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
        quotes = await fetchQuotesClient(list, { pricesOnly: true })
      } catch {
        return
      }

      const quoteBySym = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]))
      // Live marks stay in memory / localStorage; they must not write the linked file.
      withLinkedMirrorSuppressed(() => {
        for (const s of scenariosRef.current) {
          const q = quoteBySym.get(s.symbol.toUpperCase())
          if (!q) continue
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

          const mcap =
            q.marketCap ??
            marketCapFromSharePrice(q.price, shares) ??
            s.currentMarketCap

          if (
            s.companyName === q.name &&
            s.currency === q.currency &&
            s.currentPrice === q.price &&
            s.currentMarketCap === mcap &&
            s.sharesOutstanding === shares
          ) {
            continue
          }

          updateRef.current(s.id, {
            companyName: q.name,
            currency: q.currency,
            currentPrice: q.price,
            currentMarketCap: mcap,
            sharesOutstanding: shares,
          })
        }

        for (const p of portfoliosRef.current) {
          let changed = false
          const holdings = (p.holdings ?? []).map((h) => {
            const occ = h.option?.occSymbol?.toUpperCase()
            if (!occ || !h.option || optionIsExpired(h.option.expiration)) return h
            const q = quoteBySym.get(occ)
            if (!q || q.price === h.manualCurrentPrice) return h
            changed = true
            return { ...h, manualCurrentPrice: q.price }
          })
          if (changed) updatePortfolioRef.current(p.id, { holdings })
        }
      })
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

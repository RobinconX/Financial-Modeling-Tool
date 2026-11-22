import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortfolioTrade, PortfolioTradesState } from '../types'
import { removeTrade, upsertTrade } from '../lib/portfolioTrades'
import {
  loadPortfolioTrades,
  PORTFOLIO_TRADES_KEY,
  savePortfolioTrades,
} from '../lib/portfolioTradesStorage'

export function usePortfolioTrades() {
  const [state, setState] = useState<PortfolioTradesState>(() => loadPortfolioTrades())
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const persist = useCallback((next: PortfolioTradesState) => {
    const result = savePortfolioTrades(next)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    stateRef.current = next
    setState(next)
    return true
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== PORTFOLIO_TRADES_KEY) return
      const loaded = loadPortfolioTrades()
      stateRef.current = loaded
      setState(loaded)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const saveTrade = useCallback(
    (trade: PortfolioTrade) => persist(upsertTrade(stateRef.current, trade)),
    [persist],
  )

  const deleteTrade = useCallback(
    (tradeId: string) => persist(removeTrade(stateRef.current, tradeId)),
    [persist],
  )

  const replace = useCallback((next: PortfolioTradesState) => persist(next), [persist])

  return { trades: state, error, saveTrade, deleteTrade, replace }
}

export type PortfolioTradesApi = ReturnType<typeof usePortfolioTrades>
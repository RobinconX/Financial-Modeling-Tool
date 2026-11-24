import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortfolioTrade, PortfolioTradesState } from '../types'
import { removeTrade, upsertTrade } from '../lib/portfolioTrades'
import {
  loadPortfolioTradesWithRecovery,
  PORTFOLIO_TRADES_KEY,
  savePortfolioTrades,
} from '../lib/portfolioTradesStorage'
import type { StorageRecoveryNotice } from '../lib/storageLoadRecovery'

export function usePortfolioTrades() {
  const [initialLoad] = useState(() => loadPortfolioTradesWithRecovery())
  const [state, setState] = useState<PortfolioTradesState>(() => initialLoad.data)
  const [storageRecovery, setStorageRecovery] = useState<StorageRecoveryNotice | null>(
    () => initialLoad.recovery,
  )
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
      const loaded = loadPortfolioTradesWithRecovery()
      stateRef.current = loaded.data
      setState(loaded.data)
      if (loaded.recovery) setStorageRecovery(loaded.recovery)
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

  const dismissStorageRecovery = useCallback(() => setStorageRecovery(null), [])

  return {
    trades: state,
    error,
    storageRecovery,
    dismissStorageRecovery,
    saveTrade,
    deleteTrade,
    replace,
  }
}

export type PortfolioTradesApi = ReturnType<typeof usePortfolioTrades>
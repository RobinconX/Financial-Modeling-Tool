import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortfolioExternalCashFlow, PortfolioExternalCashState } from '../types'
import {
  removeExternalCashFlow,
  upsertExternalCashFlow,
} from '../lib/portfolioExternalCash'
import {
  loadPortfolioExternalCashWithRecovery,
  PORTFOLIO_EXTERNAL_CASH_KEY,
  savePortfolioExternalCash,
} from '../lib/portfolioExternalCashStorage'
import type { StorageRecoveryNotice } from '../lib/storageLoadRecovery'

export function usePortfolioExternalCash() {
  const [initialLoad] = useState(() => loadPortfolioExternalCashWithRecovery())
  const [state, setState] = useState<PortfolioExternalCashState>(() => initialLoad.data)
  const [storageRecovery, setStorageRecovery] = useState<StorageRecoveryNotice | null>(
    () => initialLoad.recovery,
  )
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const persist = useCallback((next: PortfolioExternalCashState) => {
    const result = savePortfolioExternalCash(next)
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
      if (e.key !== PORTFOLIO_EXTERNAL_CASH_KEY) return
      const loaded = loadPortfolioExternalCashWithRecovery()
      stateRef.current = loaded.data
      setState(loaded.data)
      if (loaded.recovery) setStorageRecovery(loaded.recovery)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const saveFlow = useCallback(
    (flow: PortfolioExternalCashFlow) =>
      persist(upsertExternalCashFlow(stateRef.current, flow)),
    [persist],
  )

  const deleteFlow = useCallback(
    (id: string) => persist(removeExternalCashFlow(stateRef.current, id)),
    [persist],
  )

  const replace = useCallback((next: PortfolioExternalCashState) => persist(next), [persist])

  const dismissStorageRecovery = useCallback(() => setStorageRecovery(null), [])

  return {
    externalCash: state,
    error,
    storageRecovery,
    dismissStorageRecovery,
    saveFlow,
    deleteFlow,
    replace,
  }
}
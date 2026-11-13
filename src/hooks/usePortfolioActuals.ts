import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayCurrency, PortfolioActualsState } from '../types'
import { clearActualYear, setActualMonth } from '../lib/portfolioActuals'
import type { StorageRecoveryNotice } from '../lib/storageLoadRecovery'
import {
  loadPortfolioActualsWithRecovery,
  PORTFOLIO_ACTUALS_KEY,
  savePortfolioActuals,
} from '../lib/portfolioActualsStorage'
import { PORTFOLIO_STORAGE_KEY } from '../lib/portfolioStorage'

export function usePortfolioActuals() {
  const [initialLoad] = useState(() => loadPortfolioActualsWithRecovery())
  const [state, setState] = useState<PortfolioActualsState>(() => initialLoad.data)
  const [storageRecovery, setStorageRecovery] = useState<StorageRecoveryNotice | null>(
    () => initialLoad.recovery,
  )
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const persist = useCallback((next: PortfolioActualsState) => {
    const result = savePortfolioActuals(next)
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
      if (e.key !== PORTFOLIO_ACTUALS_KEY && e.key !== PORTFOLIO_STORAGE_KEY) return
      const loaded = loadPortfolioActualsWithRecovery()
      stateRef.current = loaded.data
      setState(loaded.data)
      if (loaded.recovery) setStorageRecovery(loaded.recovery)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setMonth = useCallback(
    (year: number, month: number, amount: number | null) =>
      persist(setActualMonth(stateRef.current, year, month, amount)),
    [persist],
  )

  const clearYear = useCallback(
    (year: number) => persist(clearActualYear(stateRef.current, year)),
    [persist],
  )

  const setCurrency = useCallback(
    (currency: DisplayCurrency) => persist({ ...stateRef.current, currency }),
    [persist],
  )

  const replace = useCallback((next: PortfolioActualsState) => persist(next), [persist])

  const dismissStorageRecovery = useCallback(() => setStorageRecovery(null), [])

  return {
    actuals: state,
    error,
    storageRecovery,
    dismissStorageRecovery,
    setMonth,
    clearYear,
    setCurrency,
    replace,
  }
}

export type PortfolioActualsApi = ReturnType<typeof usePortfolioActuals>
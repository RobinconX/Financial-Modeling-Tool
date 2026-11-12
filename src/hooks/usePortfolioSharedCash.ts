import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortfolioSharedCashState } from '../types'
import { normalizePortfolioCashModel } from '../lib/portfolio'
import {
  loadPortfolioSharedCash,
  PORTFOLIO_SHARED_CASH_KEY,
  savePortfolioSharedCash,
} from '../lib/portfolioSharedCashStorage'

export function usePortfolioSharedCash() {
  const [state, setState] = useState<PortfolioSharedCashState>(() => loadPortfolioSharedCash())
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const persist = useCallback((next: PortfolioSharedCashState) => {
    const result = savePortfolioSharedCash(next)
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
      if (e.key !== PORTFOLIO_SHARED_CASH_KEY) return
      const loaded = loadPortfolioSharedCash()
      stateRef.current = loaded
      setState(loaded)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const replace = useCallback((next: PortfolioSharedCashState) => persist(next), [persist])

  const updateFromPortfolioPatch = useCallback(
    (patch: {
      deposits?: PortfolioSharedCashState['deposits']
      perpetualYearlyDeposit?: PortfolioSharedCashState['perpetualYearlyDeposit']
    }) => {
      const normalized = normalizePortfolioCashModel({
        id: 'shared',
        name: 'shared',
        currentCash: 0,
        deposits: patch.deposits ?? stateRef.current.deposits,
        perpetualYearlyDeposit:
          patch.perpetualYearlyDeposit !== undefined
            ? patch.perpetualYearlyDeposit
            : stateRef.current.perpetualYearlyDeposit,
        holdings: [],
        actions: [],
        createdAt: '',
        updatedAt: '',
      })
      return persist({
        ...stateRef.current,
        deposits: normalized.deposits,
        perpetualYearlyDeposit: normalized.perpetualYearlyDeposit ?? null,
      })
    },
    [persist],
  )

  return { sharedCash: state, error, replace, updateFromPortfolioPatch }
}

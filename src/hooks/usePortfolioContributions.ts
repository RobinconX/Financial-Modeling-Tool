import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayCurrency, PortfolioContributionsState } from '../types'
import { setContributionYear } from '../lib/portfolioContributions'
import {
  loadPortfolioContributions,
  PORTFOLIO_CONTRIBUTIONS_KEY,
  savePortfolioContributions,
} from '../lib/portfolioContributionsStorage'

export function usePortfolioContributions() {
  const [state, setState] = useState<PortfolioContributionsState>(() => loadPortfolioContributions())
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const persist = useCallback((next: PortfolioContributionsState) => {
    const result = savePortfolioContributions(next)
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
      if (e.key !== PORTFOLIO_CONTRIBUTIONS_KEY) return
      const loaded = loadPortfolioContributions()
      stateRef.current = loaded
      setState(loaded)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setYear = useCallback(
    (year: number, amount: number | null) =>
      persist(setContributionYear(stateRef.current, year, amount)),
    [persist],
  )

  const setCurrency = useCallback(
    (currency: DisplayCurrency) => persist({ ...stateRef.current, currency }),
    [persist],
  )

  return { contributions: state, error, setYear, setCurrency }
}

export type PortfolioContributionsApi = ReturnType<typeof usePortfolioContributions>

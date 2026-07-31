import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedPortfolio } from '../types'
import { clonePortfolio, newPortfolio, normalizePortfolioCashModel } from '../lib/portfolio'
import { loadPortfolios, PORTFOLIO_STORAGE_KEY, savePortfolios } from '../lib/portfolioStorage'

export function useSavedPortfolios() {
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>(() => loadPortfolios())
  const [error, setError] = useState<string | null>(null)
  /** Always-current list so consecutive updates (e.g. copy to N portfolios) stack. */
  const portfoliosRef = useRef(portfolios)
  portfoliosRef.current = portfolios

  const persist = useCallback(
    (next: SavedPortfolio[]): { ok: true } | { ok: false; error: string } => {
      const result = savePortfolios(next)
      if (!result.ok) {
        setError(result.error)
        return result
      }
      setError(null)
      portfoliosRef.current = next
      setPortfolios(next)
      return { ok: true }
    },
    [],
  )

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === PORTFOLIO_STORAGE_KEY) {
        const loaded = loadPortfolios()
        portfoliosRef.current = loaded
        setPortfolios(loaded)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const createPortfolio = useCallback(
    (name?: string) => {
      const created = newPortfolio(name ?? 'My portfolio')
      const result = persist([...portfoliosRef.current, created])
      if (!result.ok) return null
      return created
    },
    [persist],
  )

  const updatePortfolio = useCallback(
    (id: string, patch: Partial<SavedPortfolio>) => {
      const now = new Date().toISOString()
      const next = portfoliosRef.current.map((p) => {
        if (p.id !== id) return p
        const merged: SavedPortfolio = {
          ...p,
          ...patch,
          id: p.id,
          currentCash:
            patch.currentCash !== undefined
              ? Math.max(0, patch.currentCash)
              : (p.currentCash ?? 0),
          deposits: patch.deposits ?? p.deposits ?? [],
          actions: patch.actions ?? p.actions ?? [],
          holdings: patch.holdings ?? p.holdings,
          updatedAt: now,
        }
        return normalizePortfolioCashModel(merged)
      })
      return persist(next).ok
    },
    [persist],
  )

  const deletePortfolio = useCallback(
    (id: string) => persist(portfoliosRef.current.filter((p) => p.id !== id)).ok,
    [persist],
  )

  const copyPortfolio = useCallback(
    (id: string, name: string) => {
      const source = portfoliosRef.current.find((p) => p.id === id)
      if (!source) return null
      const created = clonePortfolio(source, name)
      const result = persist([...portfoliosRef.current, created])
      if (!result.ok) return null
      return created
    },
    [persist],
  )

  const reorderPortfolios = useCallback(
    (orderedIds: string[]) => {
      const current = portfoliosRef.current
      const byId = new Map(current.map((p) => [p.id, p]))
      const next: SavedPortfolio[] = []
      for (const id of orderedIds) {
        const p = byId.get(id)
        if (p) {
          next.push(p)
          byId.delete(id)
        }
      }
      // Append any missing (safety)
      for (const p of byId.values()) next.push(p)
      if (next.length !== current.length) return false
      return persist(next).ok
    },
    [persist],
  )

  return {
    portfolios,
    error,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    copyPortfolio,
    reorderPortfolios,
  }
}

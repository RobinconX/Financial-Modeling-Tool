import { useCallback, useEffect, useState } from 'react'
import type { SavedPortfolio } from '../types'
import { clonePortfolio, newPortfolio, normalizePortfolioCashModel } from '../lib/portfolio'
import { loadPortfolios, PORTFOLIO_STORAGE_KEY, savePortfolios } from '../lib/portfolioStorage'

export function useSavedPortfolios() {
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>(() => loadPortfolios())
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback(
    (next: SavedPortfolio[]): { ok: true } | { ok: false; error: string } => {
      const result = savePortfolios(next)
      if (!result.ok) {
        setError(result.error)
        return result
      }
      setError(null)
      setPortfolios(next)
      return { ok: true }
    },
    [],
  )

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === PORTFOLIO_STORAGE_KEY) setPortfolios(loadPortfolios())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const createPortfolio = useCallback(
    (name?: string) => {
      const created = newPortfolio(name ?? 'My portfolio')
      const result = persist([...portfolios, created])
      if (!result.ok) return null
      return created
    },
    [portfolios, persist],
  )

  const updatePortfolio = useCallback(
    (id: string, patch: Partial<SavedPortfolio>) => {
      const now = new Date().toISOString()
      const next = portfolios.map((p) => {
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
    [portfolios, persist],
  )

  const deletePortfolio = useCallback(
    (id: string) => persist(portfolios.filter((p) => p.id !== id)).ok,
    [portfolios, persist],
  )

  const copyPortfolio = useCallback(
    (id: string, name: string) => {
      const source = portfolios.find((p) => p.id === id)
      if (!source) return null
      const created = clonePortfolio(source, name)
      const result = persist([...portfolios, created])
      if (!result.ok) return null
      return created
    },
    [portfolios, persist],
  )

  const reorderPortfolios = useCallback(
    (orderedIds: string[]) => {
      const byId = new Map(portfolios.map((p) => [p.id, p]))
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
      if (next.length !== portfolios.length) return false
      return persist(next).ok
    },
    [portfolios, persist],
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

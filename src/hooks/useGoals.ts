import { useCallback, useEffect, useState } from 'react'
import type { NetWorthGoal } from '../types'
import { newNetWorthGoal } from '../lib/goals'
import { GOALS_STORAGE_KEY, loadGoals, saveGoals } from '../lib/goalsStorage'

export function useGoals() {
  const [goals, setGoals] = useState<NetWorthGoal[]>(() => loadGoals())
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback((next: NetWorthGoal[]) => {
    const result = saveGoals(next)
    if (!result.ok) {
      setError(result.error)
      return result
    }
    setError(null)
    setGoals(next)
    return result
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== GOALS_STORAGE_KEY) return
      setGoals(loadGoals())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addGoal = useCallback(
    (year: number, amountChf: number, name = '') => {
      const created = newNetWorthGoal(year, amountChf, name)
      const result = persist(
        [...goals, created].sort((a, b) => a.year - b.year || a.amountChf - b.amountChf),
      )
      return result.ok ? created : null
    },
    [goals, persist],
  )

  const updateGoal = useCallback(
    (id: string, patch: Partial<Pick<NetWorthGoal, 'year' | 'amountChf' | 'name'>>) => {
      const next = goals
        .map((g) => {
          if (g.id !== id) return g
          const year = patch.year != null ? Math.floor(patch.year) : g.year
          const amountChf = patch.amountChf != null ? patch.amountChf : g.amountChf
          const name = patch.name != null ? patch.name.trim().slice(0, 40) : g.name
          if (!Number.isFinite(year) || year < 1900 || year > 2200) return g
          if (!Number.isFinite(amountChf) || amountChf <= 0) return g
          return { ...g, year, amountChf, name }
        })
        .sort((a, b) => a.year - b.year || a.amountChf - b.amountChf)
      return persist(next).ok
    },
    [goals, persist],
  )

  const removeGoal = useCallback(
    (id: string) => persist(goals.filter((g) => g.id !== id)).ok,
    [goals, persist],
  )

  return { goals, error, addGoal, updateGoal, removeGoal }
}
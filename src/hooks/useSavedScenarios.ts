import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedScenario } from '../types'
import {
  findBySymbolAndName,
  groupScenariosByTicker,
  loadScenarios,
  saveScenarios,
} from '../lib/storage'
import { sortEasyProjections, sortYearProjections } from '../lib/valuation'

export function useSavedScenarios() {
  const [scenarios, setScenarios] = useState<SavedScenario[]>(() => loadScenarios())
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback(
    (next: SavedScenario[]): { ok: true } | { ok: false; error: string } => {
      const result = saveScenarios(next)
      if (!result.ok) {
        setError(result.error)
        return result
      }
      setError(null)
      setScenarios(next)
      return { ok: true }
    },
    [],
  )

  // Cross-tab sync
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'grok-lab.saved-scenarios.v1') {
        setScenarios(loadScenarios())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const upsertScenario = useCallback(
    (
      input: Omit<SavedScenario, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string
      },
      opts?: { overwriteByName?: boolean },
    ): { scenario: SavedScenario; overwritten: boolean } | { error: string } => {
      const now = new Date().toISOString()
      const symbol = input.symbol.toUpperCase()
      const name = input.name.trim() || 'Base'

      let existing: SavedScenario | undefined
      if (input.id) {
        existing = scenarios.find((s) => s.id === input.id)
      } else if (opts?.overwriteByName !== false) {
        existing = findBySymbolAndName(scenarios, symbol, name)
      }

      if (existing) {
        const updated: SavedScenario = {
          ...existing,
          ...input,
          id: existing.id,
          symbol,
          name,
          easyRows: sortEasyProjections(input.easyRows),
          advancedRows: sortYearProjections(input.advancedRows),
          createdAt: existing.createdAt,
          updatedAt: now,
        }
        const next = scenarios.map((s) => (s.id === existing!.id ? updated : s))
        const result = persist(next)
        if (!result.ok) return { error: result.error }
        return { scenario: updated, overwritten: true }
      }

      const created: SavedScenario = {
        id: crypto.randomUUID(),
        symbol,
        name,
        companyName: input.companyName,
        currency: input.currency,
        currentPrice: input.currentPrice,
        currentMarketCap: input.currentMarketCap,
        sharesOutstanding: input.sharesOutstanding,
        mcapOverride: input.mcapOverride,
        easyRows: sortEasyProjections(input.easyRows),
        advancedRows: sortYearProjections(input.advancedRows),
        createdAt: now,
        updatedAt: now,
      }
      const result = persist([...scenarios, created])
      if (!result.ok) return { error: result.error }
      return { scenario: created, overwritten: false }
    },
    [scenarios, persist],
  )

  const updateScenario = useCallback(
    (id: string, patch: Partial<SavedScenario>) => {
      const now = new Date().toISOString()
      const next = scenarios.map((s) => {
        if (s.id !== id) return s
        const merged: SavedScenario = {
          ...s,
          ...patch,
          id: s.id,
          symbol: (patch.symbol ?? s.symbol).toUpperCase(),
          updatedAt: now,
        }
        if (patch.easyRows) merged.easyRows = sortEasyProjections(patch.easyRows)
        if (patch.advancedRows) {
          merged.advancedRows = sortYearProjections(patch.advancedRows)
        }
        return merged
      })
      return persist(next).ok
    },
    [scenarios, persist],
  )

  const deleteScenario = useCallback(
    (id: string) => {
      return persist(scenarios.filter((s) => s.id !== id)).ok
    },
    [scenarios, persist],
  )

  const renameScenario = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return false
      return updateScenario(id, { name: trimmed })
    },
    [updateScenario],
  )

  const grouped = useMemo(() => groupScenariosByTicker(scenarios), [scenarios])

  return {
    scenarios,
    grouped,
    error,
    setError,
    upsertScenario,
    updateScenario,
    deleteScenario,
    renameScenario,
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const scenariosRef = useRef(scenarios)
  scenariosRef.current = scenarios

  const persist = useCallback(
    (next: SavedScenario[]): { ok: true } | { ok: false; error: string } => {
      const result = saveScenarios(next)
      if (!result.ok) {
        setError(result.error)
        return result
      }
      setError(null)
      scenariosRef.current = next
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

      const current = scenariosRef.current
      let existing: SavedScenario | undefined
      if (input.id) {
        existing = current.find((s) => s.id === input.id)
      } else if (opts?.overwriteByName !== false) {
        existing = findBySymbolAndName(current, symbol, name)
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
        const next = current.map((s) => (s.id === existing!.id ? updated : s))
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
      const result = persist([...current, created])
      if (!result.ok) return { error: result.error }
      return { scenario: created, overwritten: false }
    },
    [persist],
  )

  const updateScenario = useCallback(
    (id: string, patch: Partial<SavedScenario>) => {
      const now = new Date().toISOString()
      const next = scenariosRef.current.map((s) => {
        if (s.id !== id) return s
        const merged: SavedScenario = {
          ...s,
          ...patch,
          id: s.id,
          // Ticker is immutable after save (portfolio links / locked UI)
          symbol: s.symbol,
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
    [persist],
  )

  const deleteScenario = useCallback(
    (id: string) => persist(scenariosRef.current.filter((s) => s.id !== id)).ok,
    [persist],
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

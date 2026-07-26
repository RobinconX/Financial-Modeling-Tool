import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CashflowCadence,
  CashflowKind,
  CashflowLine,
  CashflowScenario,
} from '../types'
import {
  copyScenarioAsNew,
  emptyIncomeCostState,
  newCashflowLine,
  newScenario,
  reorderScenarios,
  sortedScenarios,
} from '../lib/incomeCost'
import {
  INCOME_COST_STORAGE_KEY,
  loadIncomeCost,
  saveIncomeCost,
} from '../lib/incomeCostStorage'

export function useIncomeCost() {
  const initial = loadIncomeCost()
  const [scenarios, setScenarios] = useState<CashflowScenario[]>(() => initial.scenarios)
  const [lines, setLines] = useState<CashflowLine[]>(() => initial.lines)
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback((nextScenarios: CashflowScenario[], nextLines: CashflowLine[]) => {
    const result = saveIncomeCost({
      version: 2,
      scenarios: nextScenarios,
      lines: nextLines,
    })
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    setScenarios(nextScenarios)
    setLines(nextLines)
    return true
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== INCOME_COST_STORAGE_KEY) return
      const s = loadIncomeCost()
      setScenarios(s.scenarios)
      setLines(s.lines)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const orderedScenarios = useMemo(() => sortedScenarios(scenarios), [scenarios])

  const upsertLine = useCallback(
    (line: CashflowLine) => {
      const exists = lines.some((l) => l.id === line.id)
      const next = exists
        ? lines.map((l) => (l.id === line.id ? line : l))
        : [...lines, line]
      return persist(scenarios, next)
    },
    [lines, scenarios, persist],
  )

  const removeLine = useCallback(
    (id: string) => persist(scenarios, lines.filter((l) => l.id !== id)),
    [lines, scenarios, persist],
  )

  const addLine = useCallback(
    (scenarioId: string, kind: CashflowKind, cadence: CashflowCadence = 'recurring') => {
      if (!scenarios.some((s) => s.id === scenarioId)) return null
      const line = newCashflowLine(scenarioId, kind, cadence)
      const ok = persist(scenarios, [...lines, line])
      return ok ? line : null
    },
    [lines, scenarios, persist],
  )

  const addScenario = useCallback(
    (name?: string) => {
      const maxOrder = scenarios.reduce((m, s) => Math.max(m, s.sortOrder), -1)
      const sc = newScenario(name ?? `Scenario ${scenarios.length + 1}`, maxOrder + 1)
      const ok = persist([...scenarios, sc], lines)
      return ok ? sc : null
    },
    [lines, scenarios, persist],
  )

  const renameScenario = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return false
      return persist(
        scenarios.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
        lines,
      )
    },
    [lines, scenarios, persist],
  )

  const removeScenario = useCallback(
    (id: string) => {
      if (scenarios.length <= 1) return false
      return persist(
        scenarios.filter((s) => s.id !== id),
        lines.filter((l) => l.scenarioId !== id),
      )
    },
    [lines, scenarios, persist],
  )

  const reorderScenariosByIds = useCallback(
    (orderedIds: string[]) => {
      return persist(reorderScenarios(scenarios, orderedIds), lines)
    },
    [lines, scenarios, persist],
  )

  const copyScenario = useCallback(
    (fromId: string, newName: string) => {
      if (!scenarios.some((s) => s.id === fromId)) return null
      const result = copyScenarioAsNew(scenarios, lines, fromId, newName)
      const ok = persist(result.scenarios, result.lines)
      return ok ? result.newScenario : null
    },
    [lines, scenarios, persist],
  )

  const reset = useCallback(() => {
    const empty = emptyIncomeCostState()
    return persist(empty.scenarios, empty.lines)
  }, [persist])

  return {
    scenarios: orderedScenarios,
    lines,
    error,
    upsertLine,
    removeLine,
    addLine,
    addScenario,
    renameScenario,
    removeScenario,
    reorderScenariosByIds,
    copyScenario,
    reset,
  }
}

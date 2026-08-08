import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CashflowCadence,
  CashflowKind,
  CashflowLine,
  CashflowScenario,
  WorkingBalanceDraw,
} from '../types'
import {
  copyScenarioAsNew,
  emptyIncomeCostState,
  newCashflowLine,
  newScenario,
  newWorkingBalanceDraw,
  normalizeAmounts12,
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
  const [draws, setDraws] = useState<WorkingBalanceDraw[]>(() => initial.draws ?? [])
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback(
    (
      nextScenarios: CashflowScenario[],
      nextLines: CashflowLine[],
      nextDraws: WorkingBalanceDraw[],
    ) => {
      const result = saveIncomeCost({
        version: 3,
        scenarios: nextScenarios,
        lines: nextLines,
        draws: nextDraws,
      })
      if (!result.ok) {
        setError(result.error)
        return false
      }
      setError(null)
      setScenarios(nextScenarios)
      setLines(nextLines)
      setDraws(nextDraws)
      return true
    },
    [],
  )

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== INCOME_COST_STORAGE_KEY) return
      const s = loadIncomeCost()
      setScenarios(s.scenarios)
      setLines(s.lines)
      setDraws(s.draws ?? [])
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
      return persist(scenarios, next, draws)
    },
    [lines, scenarios, draws, persist],
  )

  const removeLine = useCallback(
    (id: string) => persist(scenarios, lines.filter((l) => l.id !== id), draws),
    [lines, scenarios, draws, persist],
  )

  const addLine = useCallback(
    (scenarioId: string, kind: CashflowKind, cadence: CashflowCadence = 'recurring') => {
      if (!scenarios.some((s) => s.id === scenarioId)) return null
      const line = newCashflowLine(scenarioId, kind, cadence)
      const ok = persist(scenarios, [...lines, line], draws)
      return ok ? line : null
    },
    [lines, scenarios, draws, persist],
  )

  const upsertDraw = useCallback(
    (draw: WorkingBalanceDraw) => {
      const normalized: WorkingBalanceDraw = {
        ...draw,
        amounts: normalizeAmounts12(draw.amounts),
      }
      const exists = draws.some((d) => d.id === normalized.id)
      const next = exists
        ? draws.map((d) => (d.id === normalized.id ? normalized : d))
        : [...draws, normalized]
      return persist(scenarios, lines, next)
    },
    [draws, scenarios, lines, persist],
  )

  const removeDraw = useCallback(
    (id: string) => persist(scenarios, lines, draws.filter((d) => d.id !== id)),
    [draws, scenarios, lines, persist],
  )

  const addDraw = useCallback(
    (scenarioId: string) => {
      if (!scenarios.some((s) => s.id === scenarioId)) return null
      const maxOrder = draws
        .filter((d) => d.scenarioId === scenarioId)
        .reduce((m, d) => Math.max(m, d.sortOrder), -1)
      const draw = newWorkingBalanceDraw(scenarioId, maxOrder + 1)
      const ok = persist(scenarios, lines, [...draws, draw])
      return ok ? draw : null
    },
    [draws, scenarios, lines, persist],
  )

  const addScenario = useCallback(
    (name?: string, year?: number) => {
      const maxOrder = scenarios.reduce((m, s) => Math.max(m, s.sortOrder), -1)
      const usedYears = new Set(scenarios.map((s) => s.year))
      let y =
        year != null && Number.isFinite(year)
          ? Math.floor(year)
          : new Date().getFullYear()
      while (usedYears.has(y)) y += 1
      const sc = newScenario(name ?? `Scenario ${scenarios.length + 1}`, maxOrder + 1, y)
      const ok = persist([...scenarios, sc], lines, draws)
      return ok ? sc : null
    },
    [lines, scenarios, draws, persist],
  )

  const renameScenario = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return false
      return persist(
        scenarios.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
        lines,
        draws,
      )
    },
    [lines, scenarios, draws, persist],
  )

  const setScenarioYear = useCallback(
    (id: string, year: number) => {
      if (!Number.isFinite(year) || year < 1970 || year > 2100) return false
      return persist(
        scenarios.map((s) =>
          s.id === id ? { ...s, year: Math.floor(year) } : s,
        ),
        lines,
        draws,
      )
    },
    [lines, scenarios, draws, persist],
  )

  const removeScenario = useCallback(
    (id: string) => {
      if (scenarios.length <= 1) return false
      return persist(
        scenarios.filter((s) => s.id !== id),
        lines.filter((l) => l.scenarioId !== id),
        draws.filter((d) => d.scenarioId !== id),
      )
    },
    [lines, scenarios, draws, persist],
  )

  const reorderScenariosByIds = useCallback(
    (orderedIds: string[]) => {
      return persist(reorderScenarios(scenarios, orderedIds), lines, draws)
    },
    [lines, scenarios, draws, persist],
  )

  const copyScenario = useCallback(
    (fromId: string, newName: string) => {
      if (!scenarios.some((s) => s.id === fromId)) return null
      const result = copyScenarioAsNew(scenarios, lines, fromId, newName, undefined, draws)
      const ok = persist(result.scenarios, result.lines, result.draws)
      return ok ? result.newScenario : null
    },
    [lines, scenarios, draws, persist],
  )

  const reset = useCallback(() => {
    const empty = emptyIncomeCostState()
    return persist(empty.scenarios, empty.lines, empty.draws)
  }, [persist])

  return {
    scenarios: orderedScenarios,
    lines,
    draws,
    error,
    upsertLine,
    removeLine,
    addLine,
    upsertDraw,
    removeDraw,
    addDraw,
    addScenario,
    renameScenario,
    setScenarioYear,
    removeScenario,
    reorderScenariosByIds,
    copyScenario,
    reset,
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OverviewScenario, OverviewSeries, OverviewState } from '../types'
import {
  clampOverviewRange,
  cloneSeriesList,
  newOverviewScenario,
  newOverviewSeries,
  sortedOverviewScenarios,
} from '../lib/overview'
import { loadOverview, saveOverview, OVERVIEW_STORAGE_KEY } from '../lib/overviewStorage'

export function useOverview() {
  const initial = loadOverview()
  const [state, setState] = useState<OverviewState>(() => initial)
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback((next: OverviewState) => {
    const result = saveOverview(next)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    setState(next)
    return true
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== OVERVIEW_STORAGE_KEY) return
      setState(loadOverview())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const scenarios = useMemo(
    () => sortedOverviewScenarios(state.scenarios),
    [state.scenarios],
  )

  const selected =
    scenarios.find((s) => s.id === state.selectedScenarioId) ?? scenarios[0] ?? null

  const orderedSeries = useMemo(() => {
    if (!selected) return []
    return [...selected.series].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    )
  }, [selected])

  const updateScenario = useCallback(
    (id: string, patch: Partial<OverviewScenario>) => {
      const next = state.scenarios.map((s) => {
        if (s.id !== id) return s
        const merged = { ...s, ...patch, id: s.id }
        if (patch.startYear != null || patch.endYear != null) {
          const range = clampOverviewRange(merged.startYear, merged.endYear)
          merged.startYear = range.startYear
          merged.endYear = range.endYear
        }
        return merged
      })
      return persist({ ...state, scenarios: next })
    },
    [persist, state],
  )

  const selectScenario = useCallback(
    (id: string) => {
      if (!state.scenarios.some((s) => s.id === id)) return false
      return persist({ ...state, selectedScenarioId: id })
    },
    [persist, state],
  )

  const addScenario = useCallback(
    (name?: string) => {
      const maxOrder = state.scenarios.reduce((m, s) => Math.max(m, s.sortOrder), -1)
      const sc = newOverviewScenario(name ?? `Scenario ${state.scenarios.length + 1}`, maxOrder + 1)
      return persist({
        ...state,
        scenarios: [...state.scenarios, sc],
        selectedScenarioId: sc.id,
      })
        ? sc
        : null
    },
    [persist, state],
  )

  /** Save current series/range under a new scenario name (copy). */
  const saveAsScenario = useCallback(
    (name: string) => {
      if (!selected) return null
      const maxOrder = state.scenarios.reduce((m, s) => Math.max(m, s.sortOrder), -1)
      const sc = newOverviewScenario(name, maxOrder + 1)
      sc.startYear = selected.startYear
      sc.endYear = selected.endYear
      sc.series = cloneSeriesList(selected.series)
      return persist({
        ...state,
        scenarios: [...state.scenarios, sc],
        selectedScenarioId: sc.id,
      })
        ? sc
        : null
    },
    [persist, selected, state],
  )

  const renameScenario = useCallback(
    (id: string, name: string) => updateScenario(id, { name: name.trim() || 'Untitled' }),
    [updateScenario],
  )

  const removeScenario = useCallback(
    (id: string) => {
      if (state.scenarios.length <= 1) return false
      const next = state.scenarios.filter((s) => s.id !== id)
      const selectedScenarioId =
        state.selectedScenarioId === id ? next[0]!.id : state.selectedScenarioId
      return persist({ ...state, scenarios: next, selectedScenarioId })
    },
    [persist, state],
  )

  const setRange = useCallback(
    (startYear: number, endYear: number) => {
      if (!selected) return false
      return updateScenario(selected.id, { startYear, endYear })
    },
    [selected, updateScenario],
  )

  const patchActiveSeries = useCallback(
    (series: OverviewSeries[]) => {
      if (!selected) return false
      return updateScenario(selected.id, { series })
    },
    [selected, updateScenario],
  )

  const addSeries = useCallback(
    (
      partial: Omit<OverviewSeries, 'id' | 'sortOrder' | 'enabled'> &
        Partial<Pick<OverviewSeries, 'enabled'>>,
    ) => {
      if (!selected) return null
      const maxOrder = selected.series.reduce((m, s) => Math.max(m, s.sortOrder), -1)
      const series = newOverviewSeries(partial, maxOrder + 1)
      const ok = patchActiveSeries([...selected.series, series])
      return ok ? series : null
    },
    [patchActiveSeries, selected],
  )

  const updateSeries = useCallback(
    (id: string, patch: Partial<OverviewSeries>) => {
      if (!selected) return false
      const next = selected.series.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s))
      return patchActiveSeries(next)
    },
    [patchActiveSeries, selected],
  )

  const removeSeries = useCallback(
    (id: string) => {
      if (!selected) return false
      return patchActiveSeries(selected.series.filter((s) => s.id !== id))
    },
    [patchActiveSeries, selected],
  )

  const toggleSeries = useCallback(
    (id: string) => {
      if (!selected) return false
      return patchActiveSeries(
        selected.series.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
      )
    },
    [patchActiveSeries, selected],
  )

  return {
    scenarios,
    selectedScenarioId: selected?.id ?? null,
    selectedScenario: selected,
    startYear: selected?.startYear ?? new Date().getFullYear(),
    endYear: selected?.endYear ?? new Date().getFullYear() + 10,
    series: orderedSeries,
    error,
    selectScenario,
    addScenario,
    saveAsScenario,
    renameScenario,
    removeScenario,
    setRange,
    addSeries,
    updateSeries,
    removeSeries,
    toggleSeries,
  }
}

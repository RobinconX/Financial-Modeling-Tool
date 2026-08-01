import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OverviewScenario, OverviewSeries, OverviewState } from '../types'
import {
  clampOverviewRange,
  cloneSeriesList,
  ensurePermanentLeftover,
  isPermanentLeftover,
  newOverviewScenario,
  newOverviewSeries,
  sortedOverviewScenarios,
} from '../lib/overview'
import { loadOverview, saveOverview, OVERVIEW_STORAGE_KEY } from '../lib/overviewStorage'

export function useOverview() {
  const [state, setState] = useState<OverviewState>(() => loadOverview())
  const [error, setError] = useState<string | null>(null)

  /** Always derive next state from the latest snapshot (avoids stale range edits). */
  const persistUpdate = useCallback((recipe: (prev: OverviewState) => OverviewState) => {
    let ok = false
    setState((prev) => {
      const next = recipe(prev)
      const result = saveOverview(next)
      if (!result.ok) {
        setError(result.error)
        return prev
      }
      setError(null)
      ok = true
      return next
    })
    return ok
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
      return persistUpdate((prev) => {
        const scenarios = prev.scenarios.map((s) => {
          if (s.id !== id) return s
          const merged = { ...s, ...patch, id: s.id }
          if (patch.startYear != null || patch.endYear != null) {
            const range = clampOverviewRange(merged.startYear, merged.endYear)
            merged.startYear = range.startYear
            merged.endYear = range.endYear
          }
          return merged
        })
        return { ...prev, scenarios }
      })
    },
    [persistUpdate],
  )

  const selectScenario = useCallback(
    (id: string) => {
      return persistUpdate((prev) => {
        if (!prev.scenarios.some((s) => s.id === id)) return prev
        return { ...prev, selectedScenarioId: id }
      })
    },
    [persistUpdate],
  )

  const addScenario = useCallback(
    (name?: string) => {
      let created: OverviewScenario | null = null
      persistUpdate((prev) => {
        const maxOrder = prev.scenarios.reduce((m, s) => Math.max(m, s.sortOrder), -1)
        const sc = newOverviewScenario(
          name ?? `Scenario ${prev.scenarios.length + 1}`,
          maxOrder + 1,
        )
        created = sc
        return {
          ...prev,
          scenarios: [...prev.scenarios, sc],
          selectedScenarioId: sc.id,
        }
      })
      return created
    },
    [persistUpdate],
  )

  const saveAsScenario = useCallback(
    (name: string) => {
      let created: OverviewScenario | null = null
      persistUpdate((prev) => {
        const sel =
          prev.scenarios.find((s) => s.id === prev.selectedScenarioId) ?? prev.scenarios[0]
        if (!sel) return prev
        const maxOrder = prev.scenarios.reduce((m, s) => Math.max(m, s.sortOrder), -1)
        const sc = newOverviewScenario(name, maxOrder + 1)
        sc.startYear = sel.startYear
        sc.endYear = sel.endYear
        sc.series = cloneSeriesList(sel.series)
        created = sc
        return {
          ...prev,
          scenarios: [...prev.scenarios, sc],
          selectedScenarioId: sc.id,
        }
      })
      return created
    },
    [persistUpdate],
  )

  const renameScenario = useCallback(
    (id: string, name: string) => updateScenario(id, { name: name.trim() || 'Untitled' }),
    [updateScenario],
  )

  const removeScenario = useCallback(
    (id: string) => {
      return persistUpdate((prev) => {
        if (prev.scenarios.length <= 1) return prev
        const scenarios = prev.scenarios.filter((s) => s.id !== id)
        const selectedScenarioId =
          prev.selectedScenarioId === id ? scenarios[0]!.id : prev.selectedScenarioId
        return { ...prev, scenarios, selectedScenarioId }
      })
    },
    [persistUpdate],
  )

  const setRange = useCallback(
    (startYear: number, endYear: number) => {
      return persistUpdate((prev) => {
        const id = prev.selectedScenarioId ?? prev.scenarios[0]?.id
        if (!id) return prev
        const range = clampOverviewRange(startYear, endYear)
        const scenarios = prev.scenarios.map((s) =>
          s.id === id
            ? { ...s, startYear: range.startYear, endYear: range.endYear }
            : s,
        )
        return { ...prev, scenarios }
      })
    },
    [persistUpdate],
  )

  const addSeries = useCallback(
    (
      partial: Omit<OverviewSeries, 'id' | 'sortOrder' | 'enabled'> &
        Partial<Pick<OverviewSeries, 'enabled'>>,
    ) => {
      let created: OverviewSeries | null = null
      persistUpdate((prev) => {
        const id = prev.selectedScenarioId ?? prev.scenarios[0]?.id
        if (!id) return prev
        const sel = prev.scenarios.find((s) => s.id === id)
        if (!sel) return prev
        const maxOrder = sel.series.reduce((m, s) => Math.max(m, s.sortOrder), -1)
        const series = newOverviewSeries(partial, maxOrder + 1)
        created = series
        const scenarios = prev.scenarios.map((s) =>
          s.id === id ? { ...s, series: [...s.series, series] } : s,
        )
        return { ...prev, scenarios }
      })
      return created
    },
    [persistUpdate],
  )

  const updateSeries = useCallback(
    (id: string, patch: Partial<OverviewSeries>) => {
      return persistUpdate((prev) => {
        const sid = prev.selectedScenarioId ?? prev.scenarios[0]?.id
        if (!sid) return prev
        const scenarios = prev.scenarios.map((sc) => {
          if (sc.id !== sid) return sc
          return {
            ...sc,
            series: sc.series.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)),
          }
        })
        return { ...prev, scenarios }
      })
    },
    [persistUpdate],
  )

  const removeSeries = useCallback(
    (id: string) => {
      return persistUpdate((prev) => {
        const sid = prev.selectedScenarioId ?? prev.scenarios[0]?.id
        if (!sid) return prev
        const scenarios = prev.scenarios.map((sc) => {
          if (sc.id !== sid) return sc
          const target = sc.series.find((s) => s.id === id)
          // Leftover cash is permanent
          if (target && isPermanentLeftover(target)) return sc
          return {
            ...sc,
            series: ensurePermanentLeftover(sc.series.filter((s) => s.id !== id)),
          }
        })
        return { ...prev, scenarios }
      })
    },
    [persistUpdate],
  )

  const toggleSeries = useCallback(
    (id: string) => {
      return persistUpdate((prev) => {
        const sid = prev.selectedScenarioId ?? prev.scenarios[0]?.id
        if (!sid) return prev
        const scenarios = prev.scenarios.map((sc) => {
          if (sc.id !== sid) return sc
          return {
            ...sc,
            series: sc.series.map((s) => {
              if (s.id !== id) return s
              // Leftover always stays enabled
              if (isPermanentLeftover(s)) return { ...s, enabled: true }
              return { ...s, enabled: !s.enabled }
            }),
          }
        })
        return { ...prev, scenarios }
      })
    },
    [persistUpdate],
  )

  /**
   * Reorder series groups for the selected scenario.
   * Group keys: "savings" (all savings series as one block) or a series id.
   * Updates sortOrder so the bar chart stack matches this order.
   */
  const reorderSeriesGroups = useCallback(
    (groupKeys: string[]) => {
      return persistUpdate((prev) => {
        const sid = prev.selectedScenarioId ?? prev.scenarios[0]?.id
        if (!sid) return prev
        const scenarios = prev.scenarios.map((sc) => {
          if (sc.id !== sid) return sc
          const byId = new Map(sc.series.map((s) => [s.id, s]))
          const savings = sc.series
            .filter((s) => s.type === 'savings')
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          const next: OverviewSeries[] = []
          let order = 0
          const seen = new Set<string>()
          for (const key of groupKeys) {
            if (key === 'savings') {
              for (const s of savings) {
                if (seen.has(s.id)) continue
                next.push({ ...s, sortOrder: order++ })
                seen.add(s.id)
              }
            } else {
              const s = byId.get(key)
              if (!s || s.type === 'savings' || seen.has(s.id)) continue
              next.push({ ...s, sortOrder: order++ })
              seen.add(s.id)
            }
          }
          for (const s of sc.series) {
            if (seen.has(s.id)) continue
            next.push({ ...s, sortOrder: order++ })
            seen.add(s.id)
          }
          return { ...sc, series: ensurePermanentLeftover(next) }
        })
        return { ...prev, scenarios }
      })
    },
    [persistUpdate],
  )

  /** Reorder savings accounts within the savings group (relative stack order). */
  const reorderSavingsSeries = useCallback(
    (orderedIds: string[]) => {
      return persistUpdate((prev) => {
        const sid = prev.selectedScenarioId ?? prev.scenarios[0]?.id
        if (!sid) return prev
        const scenarios = prev.scenarios.map((sc) => {
          if (sc.id !== sid) return sc
          const savings = sc.series.filter((s) => s.type === 'savings')
          if (savings.length === 0) return sc
          const nonSavings = sc.series.filter((s) => s.type !== 'savings')
          const byId = new Map(savings.map((s) => [s.id, s]))
          const orderedSavings: OverviewSeries[] = []
          for (const id of orderedIds) {
            const s = byId.get(id)
            if (s) orderedSavings.push(s)
          }
          for (const s of savings) {
            if (!orderedSavings.some((x) => x.id === s.id)) orderedSavings.push(s)
          }
          // Place savings block at min sortOrder of previous savings cluster
          const blockStart = Math.min(...savings.map((s) => s.sortOrder))
          const before = nonSavings
            .filter((s) => s.sortOrder < blockStart)
            .sort((a, b) => a.sortOrder - b.sortOrder)
          const after = nonSavings
            .filter((s) => s.sortOrder >= blockStart)
            .sort((a, b) => a.sortOrder - b.sortOrder)
          let order = 0
          const next: OverviewSeries[] = []
          for (const s of before) next.push({ ...s, sortOrder: order++ })
          for (const s of orderedSavings) next.push({ ...s, sortOrder: order++ })
          for (const s of after) next.push({ ...s, sortOrder: order++ })
          return { ...sc, series: ensurePermanentLeftover(next) }
        })
        return { ...prev, scenarios }
      })
    },
    [persistUpdate],
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
    reorderSeriesGroups,
    reorderSavingsSeries,
  }
}

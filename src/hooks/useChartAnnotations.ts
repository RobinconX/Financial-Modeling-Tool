import { useCallback, useEffect, useState } from 'react'
import type { ChartAnnotation } from '../types'
import { newChartAnnotation } from '../lib/annotations'
import {
  ANNOTATIONS_STORAGE_KEY,
  loadAnnotations,
  saveAnnotations,
} from '../lib/annotationsStorage'

export function useChartAnnotations() {
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>(() => loadAnnotations())
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback((next: ChartAnnotation[]) => {
    const result = saveAnnotations(next)
    if (!result.ok) {
      setError(result.error)
      return result
    }
    setError(null)
    setAnnotations(next)
    return result
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== ANNOTATIONS_STORAGE_KEY) return
      setAnnotations(loadAnnotations())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addAnnotation = useCallback(
    (year: number, label: string) => {
      const created = newChartAnnotation(year, label)
      if (!created.label) return null
      const result = persist(
        [...annotations, created].sort((a, b) => a.year - b.year || a.label.localeCompare(b.label)),
      )
      return result.ok ? created : null
    },
    [annotations, persist],
  )

  const updateAnnotation = useCallback(
    (id: string, patch: { year?: number; label?: string }) => {
      const next = annotations
        .map((a) => {
          if (a.id !== id) return a
          const year = patch.year != null ? Math.floor(patch.year) : a.year
          const label = (patch.label ?? a.label).trim().slice(0, 80)
          if (!Number.isFinite(year) || year < 1900 || year > 2200 || !label) return a
          return { ...a, year, label }
        })
        .sort((a, b) => a.year - b.year || a.label.localeCompare(b.label))
      return persist(next).ok
    },
    [annotations, persist],
  )

  const removeAnnotation = useCallback(
    (id: string) => persist(annotations.filter((a) => a.id !== id)).ok,
    [annotations, persist],
  )

  return { annotations, error, addAnnotation, updateAnnotation, removeAnnotation }
}
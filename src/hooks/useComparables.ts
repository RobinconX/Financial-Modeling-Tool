import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedComparable } from '../types'
import { newComparable } from '../lib/comparables'
import {
  COMPARABLES_STORAGE_KEY,
  loadComparablesWithRecovery,
  saveComparables,
} from '../lib/comparablesStorage'
import type { StorageRecoveryNotice } from '../lib/storageLoadRecovery'

export function useComparables() {
  const [initialLoad] = useState(() => loadComparablesWithRecovery())
  const [comparables, setComparables] = useState<SavedComparable[]>(() => initialLoad.data)
  const [storageRecovery, setStorageRecovery] = useState<StorageRecoveryNotice | null>(
    () => initialLoad.recovery,
  )
  const [error, setError] = useState<string | null>(null)

  const dismissStorageRecovery = useCallback(() => setStorageRecovery(null), [])
  const ref = useRef(comparables)
  ref.current = comparables

  const persist = useCallback((next: SavedComparable[]) => {
    const result = saveComparables(next)
    if (!result.ok) {
      setError(result.error)
      return result
    }
    setError(null)
    ref.current = next
    setComparables(next)
    return result
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== COMPARABLES_STORAGE_KEY) return
      const loaded = loadComparablesWithRecovery()
      ref.current = loaded.data
      setComparables(loaded.data)
      if (loaded.recovery) setStorageRecovery(loaded.recovery)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const createComparable = useCallback(
    (name?: string) => {
      const created = newComparable(name ?? `Comparable ${ref.current.length + 1}`, ref.current.length)
      const result = persist([...ref.current, created])
      if (!result.ok) return null
      return created
    },
    [persist],
  )

  const updateComparable = useCallback(
    (id: string, patch: Partial<SavedComparable>) => {
      const now = new Date().toISOString()
      const next = ref.current.map((c) => {
        if (c.id !== id) return c
        return {
          ...c,
          ...patch,
          id: c.id,
          createdAt: c.createdAt,
          updatedAt: now,
        }
      })
      return persist(next).ok
    },
    [persist],
  )

  const deleteComparable = useCallback(
    (id: string) => persist(ref.current.filter((c) => c.id !== id)).ok,
    [persist],
  )

  return {
    comparables,
    error,
    storageRecovery,
    dismissStorageRecovery,
    createComparable,
    updateComparable,
    deleteComparable,
  }
}
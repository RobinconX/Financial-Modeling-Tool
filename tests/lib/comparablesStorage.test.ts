import { beforeEach, describe, expect, it } from 'vitest'
import { corruptBackupKey } from '../../src/lib/storageLoadRecovery'
import {
  COMPARABLES_STORAGE_KEY,
  loadComparablesWithRecovery,
} from '../../src/lib/comparablesStorage'

describe('loadComparablesWithRecovery', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v))
        },
        removeItem: (k: string) => {
          store.delete(k)
        },
      },
    })
  })

  it('does not flag a valid empty payload', () => {
    store.set(
      COMPARABLES_STORAGE_KEY,
      JSON.stringify({ version: 1, comparables: [] }),
    )
    const result = loadComparablesWithRecovery()
    expect(result.recovery).toBeNull()
    expect(result.data).toEqual([])
  })

  it('archives invalid JSON', () => {
    const corrupt = '{nope'
    store.set(COMPARABLES_STORAGE_KEY, corrupt)
    const result = loadComparablesWithRecovery()
    expect(result.recovery).toMatchObject({
      storageKey: COMPARABLES_STORAGE_KEY,
      label: 'Comparables',
      reason: 'parse',
    })
    expect(store.get(corruptBackupKey(COMPARABLES_STORAGE_KEY))).toBe(corrupt)
  })

  it('archives wrong shape', () => {
    const corrupt = JSON.stringify({ version: 1, comparables: 'bad' })
    store.set(COMPARABLES_STORAGE_KEY, corrupt)
    const result = loadComparablesWithRecovery()
    expect(result.recovery?.reason).toBe('shape')
    expect(store.get(corruptBackupKey(COMPARABLES_STORAGE_KEY))).toBe(corrupt)
  })
})

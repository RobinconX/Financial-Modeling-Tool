import { beforeEach, describe, expect, it } from 'vitest'
import {
  corruptBackupKey,
  CORRUPT_BACKUP_PREFIX,
} from '../../src/lib/storageLoadRecovery'
import {
  loadScenarios,
  loadScenariosWithRecovery,
  STORAGE_KEY,
} from '../../src/lib/storage'

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

describe('loadScenariosWithRecovery', () => {
  it('returns empty data when storage is unset', () => {
    const result = loadScenariosWithRecovery()
    expect(result.data).toEqual([])
    expect(result.recovery).toBeNull()
  })

  it('archives corrupt JSON and exposes recovery notice', () => {
    const corrupt = '{not-json'
    store.set(STORAGE_KEY, corrupt)
    const result = loadScenariosWithRecovery()
    expect(result.data).toEqual([])
    expect(result.recovery).toMatchObject({
      storageKey: STORAGE_KEY,
      label: 'Projections',
      reason: 'parse',
    })
    const backupKey = corruptBackupKey(STORAGE_KEY)
    expect(backupKey.startsWith(CORRUPT_BACKUP_PREFIX)).toBe(true)
    expect(store.get(backupKey)).toBe(corrupt)
    expect(store.get(STORAGE_KEY)).toBe(corrupt)
  })

  it('archives invalid shape without clearing the primary key', () => {
    const corrupt = JSON.stringify({ version: 1, notScenarios: [] })
    store.set(STORAGE_KEY, corrupt)
    const result = loadScenariosWithRecovery()
    expect(result.data).toEqual([])
    expect(result.recovery?.reason).toBe('shape')
    expect(store.get(corruptBackupKey(STORAGE_KEY))).toBe(corrupt)
  })

  it('loadScenarios wrapper returns only data', () => {
    store.set(STORAGE_KEY, '{bad')
    expect(loadScenarios()).toEqual([])
  })
})

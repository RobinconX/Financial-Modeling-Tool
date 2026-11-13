import { beforeEach, describe, expect, it } from 'vitest'
import { corruptBackupKey } from '../../src/lib/storageLoadRecovery'
import {
  loadSavingsWithRecovery,
  SAVINGS_STORAGE_KEY,
} from '../../src/lib/savingsStorage'

describe('loadSavingsWithRecovery', () => {
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
    store.set(SAVINGS_STORAGE_KEY, JSON.stringify({ version: 1, accounts: [] }))
    const result = loadSavingsWithRecovery()
    expect(result.recovery).toBeNull()
    expect(result.data.accounts.some((a) => a.role === 'cash')).toBe(true)
  })

  it('archives invalid JSON', () => {
    const corrupt = '{nope'
    store.set(SAVINGS_STORAGE_KEY, corrupt)
    const result = loadSavingsWithRecovery()
    expect(result.recovery).toMatchObject({
      storageKey: SAVINGS_STORAGE_KEY,
      label: 'Savings',
      reason: 'parse',
    })
    expect(store.get(corruptBackupKey(SAVINGS_STORAGE_KEY))).toBe(corrupt)
  })

  it('archives wrong shape', () => {
    const corrupt = JSON.stringify({ version: 1, accounts: 'bad' })
    store.set(SAVINGS_STORAGE_KEY, corrupt)
    const result = loadSavingsWithRecovery()
    expect(result.recovery?.reason).toBe('shape')
    expect(store.get(corruptBackupKey(SAVINGS_STORAGE_KEY))).toBe(corrupt)
  })
})

import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearActualsFocus,
  readActualsFocus,
  writeActualsFocus,
} from '../../src/lib/actualsFocus'

describe('actualsFocus storage', () => {
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
    clearActualsFocus()
  })

  it('round-trips portfolio focus with period', () => {
    writeActualsFocus({ tab: 'portfolio', periodKey: '2026-03' })
    expect(readActualsFocus()).toEqual({
      tab: 'portfolio',
      periodKey: '2026-03',
    })
  })

  it('round-trips savings focus with account and period', () => {
    writeActualsFocus({
      tab: 'savings',
      savingsAccountId: 'cash-1',
      periodKey: '2025-12',
    })
    expect(readActualsFocus()).toEqual({
      tab: 'savings',
      savingsAccountId: 'cash-1',
      periodKey: '2025-12',
    })
    clearActualsFocus()
    expect(readActualsFocus()).toBeNull()
  })

  it('ignores malformed stored values', () => {
    localStorage.setItem('grok-lab-actuals-focus', '{"tab":"nope"}')
    expect(readActualsFocus()).toBeNull()
  })

  it('requires savings account id for savings tab', () => {
    writeActualsFocus({ tab: 'savings', periodKey: '2024-06' })
    expect(readActualsFocus()).toBeNull()
  })
})

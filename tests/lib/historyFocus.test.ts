import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearHistoryFocus,
  readHistoryFocus,
  writeHistoryFocus,
} from '../../src/lib/historyFocus'

describe('historyFocus storage', () => {
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
    clearHistoryFocus()
  })

  it('round-trips a series and period focus', () => {
    writeHistoryFocus({ seriesId: 'savings:cash', periodKey: '2026-03' })
    expect(readHistoryFocus()).toEqual({
      seriesId: 'savings:cash',
      periodKey: '2026-03',
    })
    clearHistoryFocus()
    expect(readHistoryFocus()).toBeNull()
  })

  it('ignores malformed stored values', () => {
    localStorage.setItem('grok-lab-history-focus', '{"nope":true}')
    expect(readHistoryFocus()).toBeNull()
  })
})

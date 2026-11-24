import { beforeEach, describe, expect, it } from 'vitest'
import { corruptBackupKey } from '../../src/lib/storageLoadRecovery'
import {
  loadPortfolioTrades,
  loadPortfolioTradesWithRecovery,
  PORTFOLIO_TRADES_KEY,
  savePortfolioTrades,
} from '../../src/lib/portfolioTradesStorage'

describe('loadPortfolioTradesWithRecovery', () => {
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
      PORTFOLIO_TRADES_KEY,
      JSON.stringify({ version: 1, trades: [] }),
    )
    const result = loadPortfolioTradesWithRecovery()
    expect(result.recovery).toBeNull()
    expect(result.data).toEqual({ version: 1, trades: [] })
  })

  it('archives invalid JSON and leaves corrupt key untouched until user saves', () => {
    const corrupt = '{not json'
    store.set(PORTFOLIO_TRADES_KEY, corrupt)
    const result = loadPortfolioTradesWithRecovery()
    expect(result.data).toEqual({ version: 1, trades: [] })
    expect(result.recovery).toMatchObject({
      storageKey: PORTFOLIO_TRADES_KEY,
      label: 'Portfolio trades',
      reason: 'parse',
    })
    expect(store.get(corruptBackupKey(PORTFOLIO_TRADES_KEY))).toBe(corrupt)
    expect(store.get(PORTFOLIO_TRADES_KEY)).toBe(corrupt)
  })

  it('archives wrong shape', () => {
    const corrupt = JSON.stringify({ version: 1, trades: 'bad' })
    store.set(PORTFOLIO_TRADES_KEY, corrupt)
    const result = loadPortfolioTradesWithRecovery()
    expect(result.recovery?.reason).toBe('shape')
    expect(store.get(corruptBackupKey(PORTFOLIO_TRADES_KEY))).toBe(corrupt)
    expect(store.get(PORTFOLIO_TRADES_KEY)).toBe(corrupt)
  })

  it('loadPortfolioTrades returns data only', () => {
    store.set(PORTFOLIO_TRADES_KEY, '{bad')
    expect(loadPortfolioTrades()).toEqual({ version: 1, trades: [] })
  })

  it('save overwrites corrupt primary key only after explicit persist', () => {
    store.set(PORTFOLIO_TRADES_KEY, '{bad')
    loadPortfolioTradesWithRecovery()
    expect(store.get(PORTFOLIO_TRADES_KEY)).toBe('{bad')
    savePortfolioTrades({ version: 1, trades: [] })
    expect(store.get(PORTFOLIO_TRADES_KEY)).toContain('"trades"')
  })
})
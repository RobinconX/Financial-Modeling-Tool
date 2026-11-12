import { describe, expect, it, beforeEach } from 'vitest'
import {
  inferPortfolioCashDisplayCurrency,
  portfolioSeedDisplayCurrency,
  PORTFOLIO_DISPLAY_CURRENCY_KEY,
  readPortfolioDisplayCurrency,
} from '../../src/lib/portfolioDisplayCurrency'
import { newOpeningDeposit, newPortfolio } from '../../src/lib/portfolio'

describe('portfolioDisplayCurrency', () => {
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
    localStorage.setItem(PORTFOLIO_DISPLAY_CURRENCY_KEY, 'CHF')
  })

  it('uses Portfolio tab display currency when seed is the open book', () => {
    const p = newPortfolio('Open')
    expect(readPortfolioDisplayCurrency()).toBe('CHF')
    expect(portfolioSeedDisplayCurrency(p, p.id)).toBe('CHF')
  })

  it('infers CHF from opening deposit when seed is not the open book', () => {
    const p = newPortfolio('Other')
    p.deposits = [{ ...newOpeningDeposit(1, 2026), currency: 'CHF' }]
    expect(portfolioSeedDisplayCurrency(p, 'other-id')).toBe('CHF')
    expect(inferPortfolioCashDisplayCurrency(p)).toBe('CHF')
  })

  it('defaults to USD when cash rows have no currency', () => {
    const p = newPortfolio('Plain')
    p.deposits = [newOpeningDeposit(1, 2026)]
    expect(inferPortfolioCashDisplayCurrency(p)).toBe('USD')
  })
})

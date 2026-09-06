import { describe, expect, it } from 'vitest'
import {
  emptyPortfolioActuals,
  hasActualMonths,
  normalizePortfolioActuals,
  pickActualsFromPortfolios,
  setActualMonth,
  stripPortfolioActuals,
} from '../../src/lib/portfolioActuals'
import { newPortfolio } from '../../src/lib/portfolio'

describe('pickActualsFromPortfolios', () => {
  it('prefers the selected portfolio when it has months', () => {
    const selected = newPortfolio('Sel')
    selected.id = 'sel'
    selected.actuals = { '2024-12': 10 }
    selected.actualsCurrency = 'CHF'
    const other = newPortfolio('Other')
    other.id = 'oth'
    other.actuals = { '2024-12': 1, '2025-01': 2, '2025-02': 3 }
    const out = pickActualsFromPortfolios([other, selected], 'sel')
    expect(out.currency).toBe('CHF')
    expect(out.byMonth).toEqual({ '2024-12': 10 })
  })

  it('falls back to the richest map when selected has none', () => {
    const empty = newPortfolio('Empty')
    empty.id = 'empty'
    const rich = newPortfolio('Rich')
    rich.id = 'rich'
    rich.actuals = { '2024-12': 5, '2025-06': 6 }
    const thin = newPortfolio('Thin')
    thin.id = 'thin'
    thin.actuals = { '2024-12': 1 }
    const out = pickActualsFromPortfolios([empty, thin, rich], 'empty')
    expect(out.byMonth).toEqual({ '2024-12': 5, '2025-06': 6 })
  })

  it('returns empty when nobody has months', () => {
    expect(hasActualMonths(pickActualsFromPortfolios([newPortfolio('A')]))).toBe(false)
  })
})

describe('normalize / strip / set', () => {
  it('drops invalid months', () => {
    const n = normalizePortfolioActuals({
      version: 1,
      currency: 'CHF',
      byMonth: { '2024-12': 10, nope: 1, '2024-13': 2, '2024-01': -1 },
    })
    expect(n.currency).toBe('CHF')
    expect(n.byMonth).toEqual({ '2024-12': 10 })
  })

  it('strips embedded actuals off a portfolio', () => {
    const p = newPortfolio('X')
    p.actuals = { '2024-12': 1 }
    p.actualsCurrency = 'USD'
    const next = stripPortfolioActuals(p)
    expect(next.actuals).toBeUndefined()
    expect(next.actualsCurrency).toBeUndefined()
  })

  it('setActualMonth writes and clears', () => {
    let s = emptyPortfolioActuals('USD')
    s = setActualMonth(s, 2024, 12, 100)
    expect(s.byMonth['2024-12']).toBe(100)
    s = setActualMonth(s, 2024, 12, null)
    expect(s.byMonth['2024-12']).toBeUndefined()
  })
})

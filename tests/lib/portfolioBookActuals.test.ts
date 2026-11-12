import { describe, expect, it } from 'vitest'
import {
  bookActualsState,
  bookContributionsState,
  extractActualsRecordStash,
} from '../../src/lib/portfolioBookActuals'
import { newPortfolio } from '../../src/lib/portfolio'

describe('portfolioBookActuals', () => {
  it('reads value actuals and money-in from the portfolio book', () => {
    const p = newPortfolio('Book')
    p.actuals = { '2025-01': 50_000 }
    p.actualsCurrency = 'CHF'
    p.portfolioMoneyIn = { version: 1, currency: 'CHF', byYear: { '2025': 5_000 } }
    expect(bookActualsState(p).byMonth['2025-01']).toBe(50_000)
    expect(bookActualsState(p).currency).toBe('CHF')
    expect(bookContributionsState(p).byYear['2025']).toBe(5_000)
  })

  it('extractActualsRecordStash captures both value and money-in', () => {
    const p = newPortfolio('Book')
    p.actuals = { '2024-03': 1 }
    p.portfolioMoneyIn = { version: 1, currency: 'USD', byYear: { '2024': 2 } }
    const stash = extractActualsRecordStash(p)
    expect(stash.actuals['2024-03']).toBe(1)
    expect(stash.moneyIn.byYear['2024']).toBe(2)
  })
})

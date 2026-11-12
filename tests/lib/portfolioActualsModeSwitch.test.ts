import { describe, expect, it } from 'vitest'
import {
  buildSwitchActualsToPerPortfolio,
  buildSwitchActualsToShared,
} from '../../src/lib/portfolioActualsModeSwitch'
import { emptyPortfolioContributions } from '../../src/lib/portfolioContributions'
import { emptyPortfolioActuals } from '../../src/lib/portfolioActuals'
import { newPortfolio } from '../../src/lib/portfolio'
import { bookActualsState, bookContributionsState } from '../../src/lib/portfolioBookActuals'

describe('portfolioActualsModeSwitch', () => {
  it('stashes all books and seeds shared actuals from the chosen portfolio', () => {
    const open = newPortfolio('Open book')
    const other = newPortfolio('Other')
    open.actuals = { '2024-11': 100_000 }
    other.actuals = { '2024-11': 200_000 }
    open.portfolioMoneyIn = { version: 1, currency: 'USD', byYear: { '2024': 10_000 } }
    other.portfolioMoneyIn = { version: 1, currency: 'USD', byYear: { '2024': 20_000 } }
    const built = buildSwitchActualsToShared([open, other], open.id, 'CHF')
    expect('error' in built).toBe(false)
    if ('error' in built) return
    expect(built.sharedActuals.currency).toBe('CHF')
    expect(built.sharedActuals.byMonth['2024-11']).toBe(100_000)
    expect(built.sharedContributions.byYear['2024']).toBe(10_000)
    expect(built.portfolios[0]!.actualsRecordStash?.actuals['2024-11']).toBe(100_000)
    expect(built.portfolios[1]!.actualsRecordStash?.actuals['2024-11']).toBe(200_000)
    expect(built.portfolios[0]!.actuals).toBeUndefined()
  })

  it('restore vs applyShared when switching back', () => {
    const a = newPortfolio('A')
    const b = newPortfolio('B')
    a.actuals = { '2023-12': 1 }
    b.actuals = { '2023-12': 2 }
  const sharedActuals = emptyPortfolioActuals()
    sharedActuals.byMonth = { '2024-06': 99 }
    const sharedContributions = emptyPortfolioContributions()
    sharedContributions.byYear = { '2024': 99 }

    const stashed = buildSwitchActualsToShared([a, b], a.id, 'USD')
    if ('error' in stashed) throw new Error(stashed.error)
    const restored = buildSwitchActualsToPerPortfolio(
      stashed.portfolios,
      sharedActuals,
      sharedContributions,
      'restore',
    )
    expect(bookActualsState(restored[0]!).byMonth['2023-12']).toBe(1)
    expect(bookActualsState(restored[1]!).byMonth['2023-12']).toBe(2)
    expect(restored[0]!.actualsRecordStash).toBeNull()

    const stashed2 = buildSwitchActualsToShared([a, b], a.id, 'USD')
    if ('error' in stashed2) throw new Error(stashed2.error)
    const applied = buildSwitchActualsToPerPortfolio(
      stashed2.portfolios,
      sharedActuals,
      sharedContributions,
      'applyShared',
    )
    expect(bookActualsState(applied[0]!).byMonth['2024-06']).toBe(99)
    expect(bookActualsState(applied[1]!).byMonth['2024-06']).toBe(99)
    expect(bookContributionsState(applied[0]!).byYear['2024']).toBe(99)
  })
})

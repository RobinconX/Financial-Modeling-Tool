import { describe, expect, it } from 'vitest'
import {
  buildSwitchToPerPortfolio,
  buildSwitchToShared,
} from '../../src/lib/portfolioCashModeSwitch'
import { newOpeningDeposit, newPortfolio } from '../../src/lib/portfolio'
import { sharedCashFromPortfolio } from '../../src/lib/portfolioSharedCash'

describe('portfolioCashModeSwitch', () => {
  it('stashes all books and seeds shared cash from the chosen portfolio', () => {
    const open = newPortfolio('Open book')
    const other = newPortfolio('Other')
    open.deposits = [newOpeningDeposit(100, 2026)]
    other.deposits = [newOpeningDeposit(200, 2026)]
    const built = buildSwitchToShared([open, other], open.id, 'CHF')
    expect('error' in built).toBe(false)
    if ('error' in built) return
    expect(built.sharedCash.currency).toBe('CHF')
    expect(built.sharedCash.deposits.find((d) => d.isOpening)?.amount).toBe(100)
    expect(built.portfolios[0]!.cashStash?.deposits.find((d) => d.isOpening)?.amount).toBe(100)
    expect(built.portfolios[1]!.cashStash?.deposits.find((d) => d.isOpening)?.amount).toBe(200)
  })

  it('stores an explicit display currency on shared cash (e.g. from the confirm modal)', () => {
    const open = newPortfolio('Open book')
    open.deposits = [newOpeningDeposit(100, 2026)]
    const built = buildSwitchToShared([open], open.id, 'USD')
    expect('error' in built).toBe(false)
    if ('error' in built) return
    expect(built.sharedCash.currency).toBe('USD')
  })

  it('restore vs applyShared when switching back', () => {
    const a = newPortfolio('A')
    const b = newPortfolio('B')
    a.deposits = [newOpeningDeposit(1, 2026)]
    b.deposits = [newOpeningDeposit(2, 2026)]
    const shared = sharedCashFromPortfolio(a, 'USD')
    shared.deposits = [newOpeningDeposit(99, 2026)]
    const stashed = buildSwitchToShared([a, b], a.id, 'USD')
    if ('error' in stashed) throw new Error(stashed.error)
    const restored = buildSwitchToPerPortfolio(stashed.portfolios, shared, 'restore')
    expect(restored[0]!.deposits.find((d) => d.isOpening)?.amount).toBe(1)
    expect(restored[1]!.deposits.find((d) => d.isOpening)?.amount).toBe(2)
    expect(restored[0]!.cashStash).toBeNull()

    const stashed2 = buildSwitchToShared([a, b], a.id, 'USD')
    if ('error' in stashed2) throw new Error(stashed2.error)
    const applied = buildSwitchToPerPortfolio(stashed2.portfolios, shared, 'applyShared')
    expect(applied[0]!.deposits.find((d) => d.isOpening)?.amount).toBe(99)
    expect(applied[1]!.deposits.find((d) => d.isOpening)?.amount).toBe(99)
  })
})

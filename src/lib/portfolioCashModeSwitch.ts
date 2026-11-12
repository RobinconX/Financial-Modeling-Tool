import type { DisplayCurrency, PortfolioSharedCashState, SavedPortfolio } from '../types'
import {
  applyCashStashToPortfolio,
  applySharedCashSlice,
  extractCashStash,
  sharedCashFromPortfolio,
} from './portfolioSharedCash'

export type SwitchToSharedResult = {
  portfolios: SavedPortfolio[]
  sharedCash: PortfolioSharedCashState
}

/** Stash every book; seed shared cash from the open portfolio. */
export function buildSwitchToShared(
  portfolios: SavedPortfolio[],
  openPortfolioId: string,
  displayCurrency: DisplayCurrency,
): SwitchToSharedResult | { error: string } {
  const open = portfolios.find((p) => p.id === openPortfolioId)
  if (!open) return { error: 'Open portfolio not found.' }
  const now = new Date().toISOString()
  const nextPortfolios = portfolios.map((p) => ({
    ...p,
    cashStash: extractCashStash(p),
    updatedAt: now,
  }))
  return {
    portfolios: nextPortfolios,
    sharedCash: sharedCashFromPortfolio(open, displayCurrency),
  }
}

export type SwitchToPerPortfolioChoice = 'restore' | 'applyShared'

export function buildSwitchToPerPortfolio(
  portfolios: SavedPortfolio[],
  shared: PortfolioSharedCashState,
  choice: SwitchToPerPortfolioChoice,
): SavedPortfolio[] {
  const now = new Date().toISOString()
  return portfolios.map((p) => {
    let merged: SavedPortfolio
    if (choice === 'restore' && p.cashStash) {
      merged = applyCashStashToPortfolio(p, p.cashStash, false)
    } else if (choice === 'applyShared') {
      merged = applySharedCashSlice(p, shared, true)
    } else {
      merged = p
    }
    const { cashStash: _drop, ...rest } = merged
    return { ...rest, cashStash: null, updatedAt: now }
  })
}

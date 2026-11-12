import type {
  DisplayCurrency,
  PortfolioActualsState,
  PortfolioContributionsState,
  SavedPortfolio,
} from '../types'
import { emptyPortfolioContributions } from './portfolioContributions'
import { emptyPortfolioActuals } from './portfolioActuals'
import {
  applyActualsRecordStash,
  bookActualsState,
  bookContributionsState,
  extractActualsRecordStash,
  stashFromSharedStores,
  stripPortfolioBookActuals,
} from './portfolioBookActuals'

export type SwitchActualsToPerPortfolioChoice = 'restore' | 'applyShared'

export type SwitchToSharedActualsResult = {
  portfolios: SavedPortfolio[]
  sharedActuals: PortfolioActualsState
  sharedContributions: PortfolioContributionsState
}

export function buildSwitchActualsToShared(
  portfolios: SavedPortfolio[],
  seedPortfolioId: string,
  displayCurrency: DisplayCurrency,
): SwitchToSharedActualsResult | { error: string } {
  const seed = portfolios.find((p) => p.id === seedPortfolioId)
  if (!seed) return { error: 'Seed portfolio not found.' }
  const now = new Date().toISOString()
  const bookActuals = bookActualsState(seed)
  const bookContrib = bookContributionsState(seed)
  const sharedActuals: PortfolioActualsState = {
    version: 1,
    currency: displayCurrency,
    byMonth: { ...bookActuals.byMonth },
  }
  const sharedContributions: PortfolioContributionsState = {
    version: 1,
    currency: displayCurrency,
    byYear: { ...bookContrib.byYear },
  }
  const nextPortfolios = portfolios.map((p) => ({
    ...stripPortfolioBookActuals(p),
    actualsRecordStash: extractActualsRecordStash(p),
    updatedAt: now,
  }))
  return { portfolios: nextPortfolios, sharedActuals, sharedContributions }
}

export function buildSwitchActualsToPerPortfolio(
  portfolios: SavedPortfolio[],
  sharedActuals: PortfolioActualsState,
  sharedContributions: PortfolioContributionsState,
  choice: SwitchActualsToPerPortfolioChoice,
): SavedPortfolio[] {
  const now = new Date().toISOString()
  const sharedStash = stashFromSharedStores(sharedActuals, sharedContributions)
  return portfolios.map((p) => {
    let merged: SavedPortfolio
    if (choice === 'restore' && p.actualsRecordStash) {
      merged = applyActualsRecordStash(p, p.actualsRecordStash, false)
    } else if (choice === 'applyShared') {
      merged = applyActualsRecordStash(
        stripPortfolioBookActuals(p),
        sharedStash,
        true,
      )
    } else {
      merged = { ...p, actualsRecordStash: null }
    }
    return { ...merged, actualsRecordStash: null, updatedAt: now }
  })
}

export function emptySharedActualsStores(): {
  sharedActuals: PortfolioActualsState
  sharedContributions: PortfolioContributionsState
} {
  return {
    sharedActuals: emptyPortfolioActuals(),
    sharedContributions: emptyPortfolioContributions(),
  }
}

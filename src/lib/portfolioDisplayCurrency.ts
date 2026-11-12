import type { DisplayCurrency, SavedPortfolio } from '../types'
import { getDeposits } from './portfolio'
import { loadSelectedPortfolioId } from './portfolioStorage'

export const PORTFOLIO_DISPLAY_CURRENCY_KEY = 'grok-lab-portfolio-currency'

export function readPortfolioDisplayCurrency(): DisplayCurrency {
  try {
    const v = localStorage.getItem(PORTFOLIO_DISPLAY_CURRENCY_KEY)
    return v === 'CHF' ? 'CHF' : 'USD'
  } catch {
    return 'USD'
  }
}

/** Infer display currency from cash rows when the book is not open on the Portfolio tab. */
export function inferPortfolioCashDisplayCurrency(portfolio: SavedPortfolio): DisplayCurrency {
  const deposits = getDeposits(portfolio)
  const opening = deposits.find((d) => d.isOpening)
  if (opening?.currency === 'CHF' || opening?.currency === 'USD') return opening.currency
  for (const d of deposits) {
    if (d.currency === 'CHF') return 'CHF'
  }
  const perpetual = portfolio.perpetualYearlyDeposit
  if (perpetual?.currency === 'CHF' || perpetual?.currency === 'USD') return perpetual.currency
  return 'USD'
}

export function portfolioSeedDisplayCurrency(
  portfolio: SavedPortfolio,
  openPortfolioIdOnTab?: string | null,
): DisplayCurrency {
  const tabId = openPortfolioIdOnTab ?? loadSelectedPortfolioId()
  if (tabId === portfolio.id) return readPortfolioDisplayCurrency()
  return inferPortfolioCashDisplayCurrency(portfolio)
}

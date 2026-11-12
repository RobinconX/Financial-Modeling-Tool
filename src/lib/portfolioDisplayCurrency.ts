import type { DisplayCurrency } from '../types'

export const PORTFOLIO_DISPLAY_CURRENCY_KEY = 'grok-lab-portfolio-currency'

export function readPortfolioDisplayCurrency(): DisplayCurrency {
  try {
    const v = localStorage.getItem(PORTFOLIO_DISPLAY_CURRENCY_KEY)
    return v === 'CHF' ? 'CHF' : 'USD'
  } catch {
    return 'USD'
  }
}

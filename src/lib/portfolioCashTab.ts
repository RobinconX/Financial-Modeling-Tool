import type { DisplayCurrency, SavedPortfolio, SavedScenario } from '../types'
import { toDisplay } from './fx'
import { cashAtYear } from './portfolio'

export const CASH_TAB_SOURCE_LABEL =
  'Cash tab — `cashAtYear` (deposits + buy/sell actions on Positions)'

export const CASH_TAB_YEAR_RESOLUTION_NOTE =
  'The Cash tab is modeled by calendar year only (no daily history). Peak/reconciliation use the Cash tab balance for the date’s year through that year’s planned flows.'

/** Cash tab balance for a calendar year (USD book), after `resolvePortfolioCash` when shared. */
export function cashTabBalanceUsdAtYear(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  year: number,
  currentYear = new Date().getFullYear(),
): number {
  return cashAtYear(portfolio, year, scenarios, currentYear)
}

export function cashTabBalanceDisplayAtYear(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  year: number,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
  currentYear = new Date().getFullYear(),
): number {
  return toDisplay(
    cashTabBalanceUsdAtYear(portfolio, scenarios, year, currentYear),
    displayCurrency,
    usdToChf,
  )
}

export function cashTabBalanceDisplayAsOf(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  isoDate: string,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
  currentYear = new Date().getFullYear(),
): {
  amount: number
  calendarYear: number
  sourceLabel: string
  resolutionNote: string
} {
  const calendarYear = Math.floor(Number(isoDate.slice(0, 4)))
  const year = Number.isFinite(calendarYear) ? calendarYear : currentYear
  return {
    amount: cashTabBalanceDisplayAtYear(
      portfolio,
      scenarios,
      year,
      displayCurrency,
      usdToChf,
      currentYear,
    ),
    calendarYear: year,
    sourceLabel: CASH_TAB_SOURCE_LABEL,
    resolutionNote: CASH_TAB_YEAR_RESOLUTION_NOTE,
  }
}
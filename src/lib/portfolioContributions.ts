import type { DisplayCurrency, PortfolioContributionsState, SavedPortfolio } from '../types'
import { amountToDisplay, toDisplay } from './fx'
import { depositInYear, getDeposits } from './portfolio'

export function emptyPortfolioContributions(
  currency: DisplayCurrency = 'USD',
): PortfolioContributionsState {
  return { version: 1, currency, byYear: {} }
}

export function contributionYears(state: PortfolioContributionsState): number[] {
  const out: number[] = []
  for (const key of Object.keys(state.byYear)) {
    const y = Number(key)
    if (Number.isFinite(y)) out.push(y)
  }
  return out.sort((a, b) => a - b)
}

/** Sum of entered contributions with year <= `year` (stored currency). */
export function investedAt(state: PortfolioContributionsState, year: number): number {
  let sum = 0
  for (const [key, raw] of Object.entries(state.byYear)) {
    const y = Number(key)
    if (!Number.isFinite(y) || y > year) continue
    if (Number.isFinite(raw) && raw > 0) sum += raw
  }
  return sum
}

export function investedAtDisplay(
  state: PortfolioContributionsState,
  year: number,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): number | null {
  const invested = investedAt(state, year)
  if (!(invested > 0)) return 0
  if (state.currency !== displayCurrency && (usdToChf == null || usdToChf <= 0)) return null
  return amountToDisplay(invested, state.currency, displayCurrency, usdToChf)
}

/**
 * Shared money-in through `year`, plus this portfolio’s remaining current-year
 * deposit (planned − already deposited) and later planned deposits (later years
 * that already have a money-in row are not added again).
 */
function alreadyDepositedInYear(portfolio: SavedPortfolio, year: number): number {
  let sum = 0
  for (const d of getDeposits(portfolio)) {
    if (d.isOpening || d.year !== year) continue
    const planned = Number.isFinite(d.amount) ? Math.max(0, d.amount) : 0
    const already = Number.isFinite(d.alreadyDeposited) ? Math.max(0, d.alreadyDeposited!) : 0
    sum += Math.min(planned, already)
  }
  return sum
}

export function investedForRoiDisplay(
  state: PortfolioContributionsState,
  year: number,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
  portfolio?: SavedPortfolio | null,
  currentYear = new Date().getFullYear(),
  asOfNow = false,
): number | null {
  const shared = investedAtDisplay(state, year, displayCurrency, usdToChf)
  if (shared == null) return null
  if (!portfolio || year < currentYear) return shared

  if (asOfNow) {
    if (state.byYear[String(currentYear)] != null) return shared
    const already = alreadyDepositedInYear(portfolio, currentYear)
    if (!(already > 0)) return shared
    if (displayCurrency === 'CHF' && (usdToChf == null || usdToChf <= 0)) return null
    return shared + toDisplay(already, displayCurrency, usdToChf)
  }

  const skip = new Set(
    Object.keys(state.byYear)
      .map((k) => Number(k))
      .filter((y) => Number.isFinite(y)),
  )
  let plannedUsd = 0
  const remainingThisYear = depositInYear(portfolio, currentYear, currentYear)
  if (remainingThisYear > 0) plannedUsd += remainingThisYear
  for (let y = currentYear + 1; y <= year; y++) {
    if (skip.has(y)) continue
    const n = depositInYear(portfolio, y, currentYear)
    if (n > 0) plannedUsd += n
  }
  if (!(plannedUsd > 0)) return shared
  if (displayCurrency === 'CHF' && (usdToChf == null || usdToChf <= 0)) return null
  return shared + toDisplay(plannedUsd, displayCurrency, usdToChf)
}

export type SimpleRoi = {
  invested: number
  value: number
  gain: number
  roi: number
}

/** cash / invested. Null when invested is 0. */
export function cashToInvestedPct(cash: number, invested: number): number | null {
  if (!Number.isFinite(cash) || !Number.isFinite(invested) || !(invested > 0)) return null
  return cash / invested
}

/** (value − invested) / invested. Null when invested is 0. */
export function simpleRoi(value: number, invested: number): SimpleRoi | null {
  if (!Number.isFinite(value) || !Number.isFinite(invested) || !(invested > 0)) return null
  const gain = value - invested
  return { invested, value, gain, roi: gain / invested }
}

export function setContributionYear(
  state: PortfolioContributionsState,
  year: number,
  amount: number | null,
): PortfolioContributionsState {
  const y = Math.floor(year)
  const next = { ...state.byYear }
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    delete next[String(y)]
  } else {
    next[String(y)] = amount
  }
  return { ...state, byYear: next }
}

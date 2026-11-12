import type {
  DisplayCurrency,
  PortfolioActualsRecordStash,
  PortfolioActualsState,
  PortfolioContributionsState,
  PortfolioMoneyIn,
  SavedPortfolio,
} from '../types'
import { emptyPortfolioContributions } from './portfolioContributions'
import { hasActualMonths } from './portfolioActuals'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeByYear(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    const y = Math.floor(Number(k))
    if (!Number.isFinite(y) || y < 1900 || y > 2200) continue
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) continue
    out[String(y)] = n
  }
  return out
}

export function emptyPortfolioMoneyIn(currency: DisplayCurrency = 'USD'): PortfolioMoneyIn {
  return { version: 1, currency, byYear: {} }
}

export function normalizePortfolioMoneyIn(raw: unknown): PortfolioMoneyIn | null {
  if (!isRecord(raw)) return null
  const currency: DisplayCurrency = raw.currency === 'CHF' ? 'CHF' : 'USD'
  const byYear = normalizeByYear(raw.byYear)
  if (Object.keys(byYear).length === 0 && raw.version == null) return null
  return { version: 1, currency, byYear }
}

export function normalizeActualsRecordStash(raw: unknown): PortfolioActualsRecordStash | null {
  if (!isRecord(raw)) return null
  const actualsCurrency: DisplayCurrency =
    raw.actualsCurrency === 'CHF' ? 'CHF' : 'USD'
  const byMonth: Record<string, number> = {}
  if (isRecord(raw.actuals)) {
    for (const [k, v] of Object.entries(raw.actuals)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) byMonth[k] = n
    }
  }
  const moneyIn = normalizePortfolioMoneyIn(raw.moneyIn) ?? emptyPortfolioMoneyIn(actualsCurrency)
  if (Object.keys(byMonth).length === 0 && Object.keys(moneyIn.byYear).length === 0) {
    return null
  }
  return { actuals: byMonth, actualsCurrency, moneyIn }
}

export function bookActualsState(portfolio: SavedPortfolio): PortfolioActualsState {
  const byMonth = { ...(portfolio.actuals ?? {}) }
  const currency: DisplayCurrency =
    portfolio.actualsCurrency === 'CHF' ? 'CHF' : 'USD'
  return { version: 1, currency, byMonth }
}

export function hasBookActualsMonths(portfolio: SavedPortfolio): boolean {
  return Object.keys(portfolio.actuals ?? {}).length > 0
}

export function bookContributionsState(
  portfolio: SavedPortfolio,
): PortfolioContributionsState {
  const mi = portfolio.portfolioMoneyIn ?? emptyPortfolioMoneyIn()
  return {
    version: 1,
    currency: mi.currency,
    byYear: { ...mi.byYear },
  }
}

export function hasBookMoneyIn(portfolio: SavedPortfolio): boolean {
  const byYear = portfolio.portfolioMoneyIn?.byYear ?? {}
  return Object.values(byYear).some((v) => Number(v) > 0)
}

export function portfolioBookRecordCurrency(portfolio: SavedPortfolio): DisplayCurrency {
  if (portfolio.actualsCurrency === 'CHF' || portfolio.actualsCurrency === 'USD') {
    return portfolio.actualsCurrency
  }
  const mi = portfolio.portfolioMoneyIn
  if (mi?.currency === 'CHF' || mi?.currency === 'USD') return mi.currency
  return 'USD'
}

export function extractActualsRecordStash(portfolio: SavedPortfolio): PortfolioActualsRecordStash {
  return {
    actuals: { ...(portfolio.actuals ?? {}) },
    actualsCurrency: portfolio.actualsCurrency === 'CHF' ? 'CHF' : 'USD',
    moneyIn: portfolio.portfolioMoneyIn
      ? { ...portfolio.portfolioMoneyIn, byYear: { ...portfolio.portfolioMoneyIn.byYear } }
      : emptyPortfolioMoneyIn(),
  }
}

export function applyActualsRecordStash(
  portfolio: SavedPortfolio,
  stash: PortfolioActualsRecordStash,
  newMoneyInIds = false,
): SavedPortfolio {
  void newMoneyInIds
  return {
    ...portfolio,
    actuals: { ...stash.actuals },
    actualsCurrency: stash.actualsCurrency,
    portfolioMoneyIn: {
      version: 1,
      currency: stash.moneyIn.currency,
      byYear: { ...stash.moneyIn.byYear },
    },
  }
}

export function applyActualsStateToPortfolio(
  portfolio: SavedPortfolio,
  state: PortfolioActualsState,
): SavedPortfolio {
  return {
    ...portfolio,
    actuals: { ...state.byMonth },
    actualsCurrency: state.currency === 'CHF' ? 'CHF' : 'USD',
  }
}

export function applyContributionsStateToPortfolio(
  portfolio: SavedPortfolio,
  state: PortfolioContributionsState,
): SavedPortfolio {
  return {
    ...portfolio,
    portfolioMoneyIn: {
      version: 1,
      currency: state.currency,
      byYear: { ...state.byYear },
    },
  }
}

export function stripPortfolioBookActuals(portfolio: SavedPortfolio): SavedPortfolio {
  const next = { ...portfolio }
  delete next.actuals
  delete next.actualsCurrency
  delete next.portfolioMoneyIn
  return next
}

export function stashFromSharedStores(
  actuals: PortfolioActualsState,
  contributions: PortfolioContributionsState,
): PortfolioActualsRecordStash {
  return {
    actuals: { ...actuals.byMonth },
    actualsCurrency: actuals.currency,
    moneyIn: {
      version: 1,
      currency: contributions.currency,
      byYear: { ...contributions.byYear },
    },
  }
}

export function sharedActualsEmpty(state: PortfolioActualsState | null | undefined): boolean {
  return !state || !hasActualMonths(state)
}

export function sharedContributionsEmpty(
  state: PortfolioContributionsState | null | undefined,
): boolean {
  if (!state) return true
  return !Object.values(state.byYear).some((v) => Number(v) > 0)
}

export type PortfolioActualsMode = import('./portfolioActualsMode').PortfolioActualsMode

export function resolveBookActuals(
  portfolio: SavedPortfolio | null | undefined,
  mode: PortfolioActualsMode,
  shared: PortfolioActualsState | null | undefined,
): PortfolioActualsState | null {
  if (mode === 'perPortfolio') {
    if (!portfolio) return null
    return hasBookActualsMonths(portfolio) ? bookActualsState(portfolio) : null
  }
  return shared ?? null
}

export function resolveBookContributions(
  portfolio: SavedPortfolio | null | undefined,
  mode: PortfolioActualsMode,
  shared: PortfolioContributionsState | null | undefined,
): PortfolioContributionsState | null {
  if (mode === 'perPortfolio') {
    if (!portfolio) return null
    return hasBookMoneyIn(portfolio) ? bookContributionsState(portfolio) : emptyPortfolioContributions()
  }
  return shared ?? null
}

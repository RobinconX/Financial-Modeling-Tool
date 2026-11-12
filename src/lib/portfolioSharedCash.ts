import type {
  DisplayCurrency,
  PerpetualYearlyDeposit,
  PortfolioCashStash,
  PortfolioDeposit,
  PortfolioSharedCashState,
  SavedPortfolio,
} from '../types'
import { getDeposits, normalizePortfolioCashModel } from './portfolio'
import type { PortfolioCashMode } from './portfolioCashMode'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function cloneDeposit(d: PortfolioDeposit): PortfolioDeposit {
  return { ...d }
}

function clonePerpetual(
  p: PerpetualYearlyDeposit | null | undefined,
): PerpetualYearlyDeposit | null {
  if (!p) return null
  return { ...p }
}

function normalizeDeposits(raw: unknown): PortfolioDeposit[] {
  if (!Array.isArray(raw)) return []
  const out: PortfolioDeposit[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' ? item.id : crypto.randomUUID()
    const year = Math.floor(Number(item.year))
    const amount = Number(item.amount)
    if (!Number.isFinite(year) || !Number.isFinite(amount)) continue
    const row: PortfolioDeposit = {
      id,
      year,
      amount: Math.max(0, amount),
    }
    if (item.currency === 'CHF' || item.currency === 'USD') row.currency = item.currency
    if (item.isOpening === true) row.isOpening = true
    if (item.source === 'surplus') {
      row.source = 'surplus'
      row.surplusScenarioId =
        typeof item.surplusScenarioId === 'string' ? item.surplusScenarioId : null
      if (item.surplusPercent != null) row.surplusPercent = Number(item.surplusPercent)
    }
    if (item.alreadyDeposited != null && Number(item.alreadyDeposited) > 0) {
      row.alreadyDeposited = Number(item.alreadyDeposited)
    }
    out.push(row)
  }
  return out
}

function normalizePerpetual(raw: unknown): PerpetualYearlyDeposit | null {
  if (!isRecord(raw)) return null
  const amount = Number(raw.amount)
  if (!Number.isFinite(amount)) return null
  const row: PerpetualYearlyDeposit = { amount: Math.max(0, amount), source: 'fixed' }
  if (raw.currency === 'CHF' || raw.currency === 'USD') row.currency = raw.currency
  if (raw.source === 'surplus') {
    row.source = 'surplus'
    row.surplusScenarioId =
      typeof raw.surplusScenarioId === 'string' ? raw.surplusScenarioId : null
    if (raw.surplusPercent != null) row.surplusPercent = Number(raw.surplusPercent)
  }
  return row
}

export function emptyPortfolioSharedCash(
  currency: DisplayCurrency = 'USD',
): PortfolioSharedCashState {
  return { version: 1, currency, deposits: [], perpetualYearlyDeposit: null }
}

export function normalizePortfolioSharedCash(raw: unknown): PortfolioSharedCashState {
  if (!isRecord(raw)) return emptyPortfolioSharedCash()
  const currency: DisplayCurrency = raw.currency === 'CHF' ? 'CHF' : 'USD'
  const deposits = normalizeDeposits(raw.deposits)
  const perpetualYearlyDeposit = normalizePerpetual(raw.perpetualYearlyDeposit)
  return { version: 1, currency, deposits, perpetualYearlyDeposit }
}

export function normalizePortfolioCashStash(raw: unknown): PortfolioCashStash | null {
  if (!isRecord(raw)) return null
  const deposits = normalizeDeposits(raw.deposits)
  const perpetualYearlyDeposit = normalizePerpetual(raw.perpetualYearlyDeposit)
  if (deposits.length === 0 && !perpetualYearlyDeposit) return null
  return { deposits, perpetualYearlyDeposit }
}

/** Snapshot of a portfolio’s cash tab (for stash / seed). */
export function extractCashStash(portfolio: SavedPortfolio): PortfolioCashStash {
  return {
    deposits: getDeposits(portfolio).map(cloneDeposit),
    perpetualYearlyDeposit: clonePerpetual(portfolio.perpetualYearlyDeposit),
  }
}

export function sharedCashFromPortfolio(
  portfolio: SavedPortfolio,
  currency: DisplayCurrency,
): PortfolioSharedCashState {
  const slice = extractCashStash(portfolio)
  return {
    version: 1,
    currency,
    deposits: slice.deposits.map(cloneDeposit),
    perpetualYearlyDeposit: clonePerpetual(slice.perpetualYearlyDeposit),
  }
}

export function applyCashStashToPortfolio(
  portfolio: SavedPortfolio,
  stash: PortfolioCashStash,
  newDepositIds = false,
): SavedPortfolio {
  const deposits = stash.deposits.map((d) => ({
    ...(newDepositIds ? { ...d, id: crypto.randomUUID() } : cloneDeposit(d)),
  }))
  return normalizePortfolioCashModel({
    ...portfolio,
    deposits,
    perpetualYearlyDeposit: clonePerpetual(stash.perpetualYearlyDeposit),
    currentCash: 0,
  })
}

export function applySharedCashSlice(
  portfolio: SavedPortfolio,
  shared: PortfolioSharedCashState,
  newDepositIds = false,
): SavedPortfolio {
  return applyCashStashToPortfolio(
    portfolio,
    {
      deposits: shared.deposits,
      perpetualYearlyDeposit: shared.perpetualYearlyDeposit,
    },
    newDepositIds,
  )
}

/** Merge shared cash onto a portfolio for projections (holdings/actions unchanged). */
export function resolvePortfolioCash(
  portfolio: SavedPortfolio,
  mode: PortfolioCashMode,
  shared: PortfolioSharedCashState | null | undefined,
): SavedPortfolio {
  if (mode !== 'shared' || !shared) return portfolio
  return applySharedCashSlice(portfolio, shared, false)
}

export function resolvePortfoliosCash(
  portfolios: SavedPortfolio[],
  mode: PortfolioCashMode,
  shared: PortfolioSharedCashState | null | undefined,
): SavedPortfolio[] {
  if (mode !== 'shared' || !shared) return portfolios
  return portfolios.map((p) => resolvePortfolioCash(p, mode, shared))
}

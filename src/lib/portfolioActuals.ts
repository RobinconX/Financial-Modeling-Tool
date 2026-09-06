import type { DisplayCurrency, PortfolioActualsState, SavedPortfolio } from '../types'
import { makeActualKey, parseActualKey } from './portfolio'

export function emptyPortfolioActuals(
  currency: DisplayCurrency = 'USD',
): PortfolioActualsState {
  return { version: 1, currency, byMonth: {} }
}

export function hasActualMonths(state: PortfolioActualsState | null | undefined): boolean {
  if (!state?.byMonth) return false
  return Object.keys(state.byMonth).length > 0
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeByMonth(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!parseActualKey(k)) continue
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) continue
    out[k] = n
  }
  return out
}

export function normalizePortfolioActuals(raw: unknown): PortfolioActualsState {
  if (!isRecord(raw)) return emptyPortfolioActuals()
  const currency: DisplayCurrency = raw.currency === 'CHF' ? 'CHF' : 'USD'
  return { version: 1, currency, byMonth: normalizeByMonth(raw.byMonth) }
}

/** Lift embedded per-portfolio actuals (old saves) into the shared store. */
export function pickActualsFromPortfolios(
  portfolios: SavedPortfolio[],
  selectedId?: string | null,
): PortfolioActualsState {
  const nonempty = portfolios.filter((p) => Object.keys(p.actuals ?? {}).length > 0)
  if (nonempty.length === 0) return emptyPortfolioActuals()

  const selected = selectedId ? nonempty.find((p) => p.id === selectedId) : undefined
  const source =
    selected ??
    nonempty.reduce((best, p) =>
      Object.keys(p.actuals ?? {}).length > Object.keys(best.actuals ?? {}).length ? p : best,
    )

  return {
    version: 1,
    currency: source.actualsCurrency === 'CHF' ? 'CHF' : 'USD',
    byMonth: { ...(source.actuals ?? {}) },
  }
}

export function stripPortfolioActuals(p: SavedPortfolio): SavedPortfolio {
  if (p.actuals == null && p.actualsCurrency == null) return p
  const next = { ...p }
  delete next.actuals
  delete next.actualsCurrency
  return next
}

export function setActualMonth(
  state: PortfolioActualsState,
  year: number,
  month: number,
  amount: number | null,
): PortfolioActualsState {
  const key = makeActualKey(year, month)
  const next = { ...state.byMonth }
  if (amount == null || !Number.isFinite(amount) || amount < 0) {
    delete next[key]
  } else {
    next[key] = amount
  }
  return { ...state, byMonth: next }
}

export function clearActualYear(
  state: PortfolioActualsState,
  year: number,
): PortfolioActualsState {
  const y = Math.floor(year)
  const next = { ...state.byMonth }
  for (let m = 1; m <= 12; m++) {
    delete next[makeActualKey(y, m)]
  }
  return { ...state, byMonth: next }
}
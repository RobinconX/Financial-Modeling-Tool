import type { PortfolioActualsState } from '../types'
import {
  emptyPortfolioActuals,
  hasActualMonths,
  normalizePortfolioActuals,
  pickActualsFromPortfolios,
  stripPortfolioActuals,
} from './portfolioActuals'
import { queueAppDataChanged } from './linkedMirrorGate'
import { loadPortfolios, loadSelectedPortfolioId, savePortfolios } from './portfolioStorage'

export const PORTFOLIO_ACTUALS_KEY = 'grok-lab.portfolioActuals.v1'

function readStored(): PortfolioActualsState | null {
  try {
    const raw = localStorage.getItem(PORTFOLIO_ACTUALS_KEY)
    if (!raw) return null
    return normalizePortfolioActuals(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Load shared actuals. If the store is empty, promote leftover per-portfolio
 * maps (old saves) and strip them so History/Overview cannot double-count.
 */
export function loadPortfolioActuals(): PortfolioActualsState {
  const stored = readStored()
  if (stored && hasActualMonths(stored)) return stored

  const portfolios = loadPortfolios()
  const migrated = pickActualsFromPortfolios(portfolios, loadSelectedPortfolioId())
  if (!hasActualMonths(migrated)) return stored ?? emptyPortfolioActuals()

  savePortfolioActuals(migrated)
  const stripped = portfolios.map(stripPortfolioActuals)
  if (stripped.some((p, i) => p !== portfolios[i])) {
    savePortfolios(stripped)
  }
  return migrated
}

export function savePortfolioActuals(
  state: PortfolioActualsState,
): { ok: true } | { ok: false; error: string } {
  try {
    const payload = normalizePortfolioActuals(state)
    localStorage.setItem(PORTFOLIO_ACTUALS_KEY, JSON.stringify(payload))
    queueAppDataChanged()
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to save portfolio actuals',
    }
  }
}
import type { PortfolioSharedCashState } from '../types'
import { emptyPortfolioSharedCash, normalizePortfolioSharedCash } from './portfolioSharedCash'
import { queueAppDataChanged } from './linkedMirrorGate'

export const PORTFOLIO_SHARED_CASH_KEY = 'grok-lab.portfolioSharedCash.v1'

export function loadPortfolioSharedCash(): PortfolioSharedCashState {
  try {
    const raw = localStorage.getItem(PORTFOLIO_SHARED_CASH_KEY)
    if (!raw) return emptyPortfolioSharedCash()
    return normalizePortfolioSharedCash(JSON.parse(raw))
  } catch {
    return emptyPortfolioSharedCash()
  }
}

export function savePortfolioSharedCash(
  state: PortfolioSharedCashState,
): { ok: true } | { ok: false; error: string } {
  try {
    const payload = normalizePortfolioSharedCash(state)
    localStorage.setItem(PORTFOLIO_SHARED_CASH_KEY, JSON.stringify(payload))
    queueAppDataChanged()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save shared cash' }
  }
}

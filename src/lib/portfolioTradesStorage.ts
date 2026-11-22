import type { PortfolioTradesState } from '../types'
import { emptyPortfolioTrades, normalizePortfolioTrades } from './portfolioTrades'
import { queueAppDataChanged } from './linkedMirrorGate'

export const PORTFOLIO_TRADES_KEY = 'grok-lab.portfolioTrades.v1'

export function loadPortfolioTrades(): PortfolioTradesState {
  try {
    const raw = localStorage.getItem(PORTFOLIO_TRADES_KEY)
    if (!raw) return emptyPortfolioTrades()
    return normalizePortfolioTrades(JSON.parse(raw))
  } catch {
    return emptyPortfolioTrades()
  }
}

export function savePortfolioTrades(
  state: PortfolioTradesState,
): { ok: true } | { ok: false; error: string } {
  try {
    const payload = normalizePortfolioTrades(state)
    localStorage.setItem(PORTFOLIO_TRADES_KEY, JSON.stringify(payload))
    queueAppDataChanged()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save trades' }
  }
}
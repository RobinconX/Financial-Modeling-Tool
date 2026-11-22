import type { PortfolioTradesState } from '../types'
import {
  backfillPortfolioTradeHoldingLinks,
  emptyPortfolioTrades,
  normalizePortfolioTrades,
} from './portfolioTrades'
import { loadPortfolios } from './portfolioStorage'
import { loadScenarios } from './storage'
import { queueAppDataChanged } from './linkedMirrorGate'

export const PORTFOLIO_TRADES_KEY = 'grok-lab.portfolioTrades.v1'

export function loadPortfolioTrades(): PortfolioTradesState {
  try {
    const raw = localStorage.getItem(PORTFOLIO_TRADES_KEY)
    if (!raw) return emptyPortfolioTrades()
    const normalized = normalizePortfolioTrades(JSON.parse(raw))
    return backfillPortfolioTradeHoldingLinks(
      normalized,
      loadPortfolios(),
      loadScenarios(),
    )
  } catch {
    return emptyPortfolioTrades()
  }
}

export function savePortfolioTrades(
  state: PortfolioTradesState,
): { ok: true } | { ok: false; error: string } {
  try {
    const payload = backfillPortfolioTradeHoldingLinks(
      normalizePortfolioTrades(state),
      loadPortfolios(),
      loadScenarios(),
    )
    localStorage.setItem(PORTFOLIO_TRADES_KEY, JSON.stringify(payload))
    queueAppDataChanged()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save trades' }
  }
}
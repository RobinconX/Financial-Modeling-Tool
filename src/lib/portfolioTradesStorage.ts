import type { PortfolioTradesState } from '../types'
import {
  backfillPortfolioTradeHoldingLinks,
  emptyPortfolioTrades,
  normalizePortfolioTrades,
} from './portfolioTrades'
import { loadPortfolios } from './portfolioStorage'
import { loadScenarios } from './storage'
import { queueAppDataChanged } from './linkedMirrorGate'
import {
  buildRecoveryNotice,
  type StorageLoadResult,
} from './storageLoadRecovery'

export const PORTFOLIO_TRADES_KEY = 'grok-lab.portfolioTrades.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function finishLoad(parsed: unknown): PortfolioTradesState {
  const normalized = normalizePortfolioTrades(parsed)
  return backfillPortfolioTradeHoldingLinks(
    normalized,
    loadPortfolios(),
    loadScenarios(),
  )
}

export function loadPortfolioTradesWithRecovery(): StorageLoadResult<PortfolioTradesState> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PORTFOLIO_TRADES_KEY)
    if (!raw) return { data: emptyPortfolioTrades(), recovery: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.warn('[portfolioTradesStorage] Failed to parse', err)
      return {
        data: emptyPortfolioTrades(),
        recovery: buildRecoveryNotice(
          PORTFOLIO_TRADES_KEY,
          'Portfolio trades',
          'parse',
          raw,
        ),
      }
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.trades)) {
      console.warn('[portfolioTradesStorage] Invalid payload; resetting')
      return {
        data: emptyPortfolioTrades(),
        recovery: buildRecoveryNotice(
          PORTFOLIO_TRADES_KEY,
          'Portfolio trades',
          'shape',
          raw,
        ),
      }
    }
    return { data: finishLoad(parsed), recovery: null }
  } catch (err) {
    console.warn('[portfolioTradesStorage] Failed to load', err)
    if (raw) {
      return {
        data: emptyPortfolioTrades(),
        recovery: buildRecoveryNotice(
          PORTFOLIO_TRADES_KEY,
          'Portfolio trades',
          'parse',
          raw,
        ),
      }
    }
    return { data: emptyPortfolioTrades(), recovery: null }
  }
}

export function loadPortfolioTrades(): PortfolioTradesState {
  return loadPortfolioTradesWithRecovery().data
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
import type { PortfolioExternalCashState } from '../types'
import {
  emptyPortfolioExternalCash,
  normalizePortfolioExternalCash,
} from './portfolioExternalCash'
import { queueAppDataChanged } from './linkedMirrorGate'
import { buildRecoveryNotice, type StorageLoadResult } from './storageLoadRecovery'

export const PORTFOLIO_EXTERNAL_CASH_KEY = 'grok-lab.portfolioExternalCash.v1'

export function loadPortfolioExternalCashWithRecovery(): StorageLoadResult<PortfolioExternalCashState> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PORTFOLIO_EXTERNAL_CASH_KEY)
    if (!raw) return { data: emptyPortfolioExternalCash(), recovery: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {
        data: emptyPortfolioExternalCash(),
        recovery: buildRecoveryNotice(
          PORTFOLIO_EXTERNAL_CASH_KEY,
          'External cash',
          'parse',
          raw,
        ),
      }
    }
    return { data: normalizePortfolioExternalCash(parsed), recovery: null }
  } catch {
    return { data: emptyPortfolioExternalCash(), recovery: null }
  }
}

export function loadPortfolioExternalCash(): PortfolioExternalCashState {
  return loadPortfolioExternalCashWithRecovery().data
}

export function savePortfolioExternalCash(
  state: PortfolioExternalCashState,
): { ok: true } | { ok: false; error: string } {
  try {
    const payload = normalizePortfolioExternalCash(state)
    localStorage.setItem(PORTFOLIO_EXTERNAL_CASH_KEY, JSON.stringify(payload))
    queueAppDataChanged()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save' }
  }
}
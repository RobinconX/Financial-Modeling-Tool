import type { PortfolioActualsState } from '../types'
import { normalizeActualsRecordStash } from './portfolioBookActuals'
import {
  emptyPortfolioActuals,
  hasActualMonths,
  normalizePortfolioActuals,
  pickActualsFromPortfolios,
  stripPortfolioActuals,
} from './portfolioActuals'
import { queueAppDataChanged } from './linkedMirrorGate'
import { getPortfolioActualsMode } from './portfolioActualsMode'
import {
  loadPortfolios,
  loadSelectedPortfolioId,
  PORTFOLIO_STORAGE_KEY,
  savePortfolios,
} from './portfolioStorage'
import {
  buildRecoveryNotice,
  type StorageLoadResult,
  type StorageRecoveryNotice,
} from './storageLoadRecovery'

export const PORTFOLIO_ACTUALS_KEY = 'grok-lab.portfolioActuals.v1'
/** Distinct banner/dismiss key when corrupt data lives on saved portfolios, not the shared store. */
export const PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY = `${PORTFOLIO_ACTUALS_KEY}.embedded-in-portfolios`

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function portfolioActualsPayloadLooksCorrupt(
  parsed: Record<string, unknown>,
  normalized: PortfolioActualsState,
): boolean {
  if (parsed.version != null && parsed.version !== 1) return true
  const rawByMonth = parsed.byMonth
  if (rawByMonth != null && !isRecord(rawByMonth)) return true
  if (isRecord(rawByMonth)) {
    const rawKeys = Object.keys(rawByMonth)
    if (rawKeys.length > 0 && !hasActualMonths(normalized)) return true
  }
  return false
}

function actualsRecordStashHadData(raw: Record<string, unknown>): boolean {
  if (isRecord(raw.actuals) && Object.keys(raw.actuals).length > 0) return true
  const moneyIn = raw.moneyIn
  if (isRecord(moneyIn) && isRecord(moneyIn.byYear) && Object.keys(moneyIn.byYear).length > 0) {
    return true
  }
  return false
}

function embeddedPortfolioActualsLookCorrupt(portfolioRaw: Record<string, unknown>): boolean {
  const stash = portfolioRaw.actualsRecordStash
  if (stash != null) {
    if (!isRecord(stash)) return true
    if (normalizeActualsRecordStash(stash) == null && actualsRecordStashHadData(stash)) {
      return true
    }
  }

  const actuals = portfolioRaw.actuals
  if (actuals != null && !isRecord(actuals)) return true
  if (isRecord(actuals)) {
    let valid = 0
    for (const [k, v] of Object.entries(actuals)) {
      if (!/^\d{4}-\d{2}$/.test(k)) continue
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) valid++
    }
    if (Object.keys(actuals).length > 0 && valid === 0) return true
  }
  return false
}

function scanEmbeddedPortfolioActualsRecovery(): StorageRecoveryNotice | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY)
    if (!raw) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.portfolios)) return null
    const corrupt = parsed.portfolios.some(
      (p) => isRecord(p) && embeddedPortfolioActualsLookCorrupt(p),
    )
    if (!corrupt) return null
    return buildRecoveryNotice(
      PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY,
      'Portfolio actuals',
      'content',
      raw,
    )
  } catch (err) {
    console.warn('[portfolioActualsStorage] Failed to scan embedded actuals', err)
    return null
  }
}

function loadSharedActualsRaw(): {
  stored: PortfolioActualsState | null
  sharedRecovery: StorageRecoveryNotice | null
} {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PORTFOLIO_ACTUALS_KEY)
    if (!raw) return { stored: null, sharedRecovery: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.warn('[portfolioActualsStorage] Failed to parse', err)
      return {
        stored: null,
        sharedRecovery: buildRecoveryNotice(
          PORTFOLIO_ACTUALS_KEY,
          'Portfolio actuals',
          'parse',
          raw,
        ),
      }
    }
    if (!isRecord(parsed)) {
      return {
        stored: emptyPortfolioActuals(),
        sharedRecovery: buildRecoveryNotice(
          PORTFOLIO_ACTUALS_KEY,
          'Portfolio actuals',
          'shape',
          raw,
        ),
      }
    }
    const normalized = normalizePortfolioActuals(parsed)
    if (portfolioActualsPayloadLooksCorrupt(parsed, normalized)) {
      return {
        stored: normalized,
        sharedRecovery: buildRecoveryNotice(
          PORTFOLIO_ACTUALS_KEY,
          'Portfolio actuals',
          'content',
          raw,
        ),
      }
    }
    return { stored: normalized, sharedRecovery: null }
  } catch (err) {
    console.warn('[portfolioActualsStorage] Failed to load shared actuals', err)
    if (raw) {
      return {
        stored: null,
        sharedRecovery: buildRecoveryNotice(
          PORTFOLIO_ACTUALS_KEY,
          'Portfolio actuals',
          'parse',
          raw,
        ),
      }
    }
    return { stored: null, sharedRecovery: null }
  }
}

function resolvePortfolioActualsData(
  stored: PortfolioActualsState | null,
): PortfolioActualsState {
  if (getPortfolioActualsMode() === 'perPortfolio') {
    return stored ?? emptyPortfolioActuals()
  }
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

export function loadPortfolioActualsWithRecovery(): StorageLoadResult<PortfolioActualsState> {
  const { stored, sharedRecovery } = loadSharedActualsRaw()
  const embeddedRecovery = sharedRecovery ? null : scanEmbeddedPortfolioActualsRecovery()
  const recovery = sharedRecovery ?? embeddedRecovery
  const data = resolvePortfolioActualsData(stored)
  return { data, recovery }
}

/**
 * Load shared actuals. If the store is empty, promote leftover per-portfolio
 * maps (old saves) and strip them so History/Overview cannot double-count.
 */
export function loadPortfolioActuals(): PortfolioActualsState {
  return loadPortfolioActualsWithRecovery().data
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

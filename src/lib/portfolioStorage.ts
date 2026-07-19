import type {
  PortfolioAction,
  PortfolioDeposit,
  PortfolioHolding,
  SavedPortfolio,
} from '../types'
import { newDeposit, newHolding } from './portfolio'

export const PORTFOLIO_STORAGE_KEY = 'grok-lab.saved-portfolios.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asNumberOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeHolding(raw: unknown): PortfolioHolding | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : crypto.randomUUID()
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.toUpperCase() : ''
  const basis =
    raw.basis === 'ps' || raw.basis === 'pfcf' || raw.basis === 'pe' || raw.basis === 'easy'
      ? raw.basis
      : 'easy'

  const yearOverrides = Array.isArray(raw.yearOverrides)
    ? raw.yearOverrides
        .map((o) => {
          if (!isRecord(o)) return null
          const year = asNumber(o.year, 0)
          const valueDollars = asNumber(o.valueDollars, NaN)
          if (year <= 0 || !Number.isFinite(valueDollars)) return null
          return { year, valueDollars }
        })
        .filter((o): o is { year: number; valueDollars: number } => o != null)
    : []

  let sharesHeld = Math.max(0, asNumber(raw.sharesHeld, NaN))
  if (!Number.isFinite(sharesHeld)) {
    const legacyAlloc = asNumber(raw.allocationDollars, 0)
    const price = asNumberOrNull(raw.manualCurrentPrice)
    if (legacyAlloc > 0 && price != null && price > 0) {
      sharesHeld = legacyAlloc / price
    } else {
      sharesHeld = 0
    }
  }

  return {
    id,
    symbol,
    sharesHeld,
    scenarioId: typeof raw.scenarioId === 'string' ? raw.scenarioId : null,
    basis,
    yearOverrides,
    manualCurrentPrice: asNumberOrNull(raw.manualCurrentPrice),
  }
}

function normalizeDeposits(raw: Record<string, unknown>): PortfolioDeposit[] {
  if (Array.isArray(raw.deposits)) {
    return raw.deposits
      .map((d) => {
        if (!isRecord(d)) return null
        const year = asNumber(d.year, 0)
        const amount = asNumber(d.amount, NaN)
        if (year <= 0 || !Number.isFinite(amount) || amount < 0) return null
        return {
          id: typeof d.id === 'string' ? d.id : crypto.randomUUID(),
          year,
          amount,
        }
      })
      .filter((d): d is PortfolioDeposit => d != null)
      .sort((a, b) => a.year - b.year)
  }

  // Migrate legacy cashByYear only into deposits (cashDollars → currentCash)
  const deposits: PortfolioDeposit[] = []
  if (Array.isArray(raw.cashByYear)) {
    for (const c of raw.cashByYear) {
      if (!isRecord(c)) continue
      const year = asNumber(c.year, 0)
      const amount = asNumber(c.amount, NaN)
      if (year > 0 && Number.isFinite(amount) && amount >= 0) {
        deposits.push(newDeposit(year, amount))
      }
    }
  }
  return deposits.sort((a, b) => a.year - b.year)
}

function normalizeCurrentCash(raw: Record<string, unknown>, deposits: PortfolioDeposit[]): number {
  if (raw.currentCash != null) {
    return Math.max(0, asNumber(raw.currentCash, 0))
  }
  // Legacy cashDollars was absolute cash / starting capital
  if (raw.cashDollars != null) {
    return Math.max(0, asNumber(raw.cashDollars, 0))
  }
  // Older deposit-only model: treat deposits at/before current year as current cash,
  // leave only future deposits as deposits — handled at call site if needed.
  // Keep simple: no currentCash field means 0 (deposits still accumulate).
  void deposits
  return 0
}

function normalizePortfolio(raw: unknown): SavedPortfolio | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : null
  const name = typeof raw.name === 'string' ? raw.name.trim() : null
  if (!id || !name) return null
  const now = new Date().toISOString()
  const holdings = Array.isArray(raw.holdings)
    ? raw.holdings.map(normalizeHolding).filter((h): h is PortfolioHolding => h != null)
    : []

  const deposits = normalizeDeposits(raw)
  const currentCash = normalizeCurrentCash(raw, deposits)
  const actions: PortfolioAction[] = Array.isArray(raw.actions)
    ? raw.actions
        .map((a) => {
          if (!isRecord(a)) return null
          const type = a.type === 'sell' ? 'sell' : a.type === 'buy' ? 'buy' : null
          const holdingId = typeof a.holdingId === 'string' ? a.holdingId : null
          const year = asNumber(a.year, 0)
          const shares = asNumber(a.shares, NaN)
          if (!type || !holdingId || year <= 0 || !Number.isFinite(shares) || shares < 0) {
            return null
          }
          return {
            id: typeof a.id === 'string' ? a.id : crypto.randomUUID(),
            type,
            holdingId,
            year,
            shares,
            note: typeof a.note === 'string' ? a.note : undefined,
          } satisfies PortfolioAction
        })
        .filter((a): a is PortfolioAction => a != null)
    : []

  return {
    id,
    name,
    currentCash,
    deposits,
    actions,
    holdings,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

export function loadPortfolios(): SavedPortfolio[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.portfolios)) {
      console.warn('[portfolioStorage] Invalid payload; resetting')
      return []
    }
    return parsed.portfolios
      .map(normalizePortfolio)
      .filter((p): p is SavedPortfolio => p != null)
  } catch (err) {
    console.warn('[portfolioStorage] Failed to load', err)
    return []
  }
}

export function savePortfolios(
  portfolios: SavedPortfolio[],
): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(
      PORTFOLIO_STORAGE_KEY,
      JSON.stringify({ version: 1, portfolios }),
    )
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'QuotaExceededError'
        ? 'Browser storage is full. Delete some portfolios and try again.'
        : err instanceof Error
          ? err.message
          : 'Failed to save portfolios'
    return { ok: false, error: message }
  }
}

export { newHolding }

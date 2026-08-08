import type {
  PerpetualYearlyDeposit,
  PortfolioAction,
  PortfolioDeposit,
  PortfolioHolding,
  SavedPortfolio,
} from '../types'
import { newDeposit, newHolding, normalizePortfolioCashModel } from './portfolio'

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

  const manualOnly = raw.manualOnly === true
  let sharesHeld = asNumber(raw.sharesHeld, NaN)
  if (!Number.isFinite(sharesHeld)) {
    const legacyAlloc = asNumber(raw.allocationDollars, 0)
    const price = asNumberOrNull(raw.manualCurrentPrice)
    if (legacyAlloc > 0 && price != null && price > 0) {
      sharesHeld = legacyAlloc / price
    } else {
      sharesHeld = 0
    }
  } else if (!manualOnly) {
    // Equity longs only; manual positions may be short / negative qty.
    sharesHeld = Math.max(0, sharesHeld)
  }
  return {
    id,
    symbol,
    label: typeof raw.label === 'string' ? raw.label : null,
    sharesHeld,
    scenarioId: manualOnly
      ? null
      : typeof raw.scenarioId === 'string'
        ? raw.scenarioId
        : null,
    basis,
    yearOverrides,
    manualCurrentPrice: asNumberOrNull(raw.manualCurrentPrice),
    manualOnly: manualOnly || undefined,
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
        const dep: PortfolioDeposit = {
          id: typeof d.id === 'string' ? d.id : crypto.randomUUID(),
          year,
          amount,
        }
        if (d.currency === 'CHF' || d.currency === 'USD') dep.currency = d.currency
        if (d.isOpening === true) dep.isOpening = true
        if (d.source === 'surplus') {
          dep.source = 'surplus'
          dep.surplusScenarioId =
            typeof d.surplusScenarioId === 'string' ? d.surplusScenarioId : null
          dep.surplusPercent = Math.max(0, asNumber(d.surplusPercent, 0))
        }
        const already = asNumber(d.alreadyDeposited, NaN)
        if (Number.isFinite(already) && already > 0) {
          dep.alreadyDeposited = already
        }
        return dep
      })
      .filter((d): d is PortfolioDeposit => d != null)
      .sort((a, b) => a.year - b.year)
  }

  // Migrate legacy cashByYear only into deposits (cashDollars → opening via normalizePortfolioCashModel)
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
  const actions: PortfolioAction[] = []
  if (Array.isArray(raw.actions)) {
    for (const a of raw.actions) {
      if (!isRecord(a)) continue
      const type = a.type === 'sell' ? 'sell' : a.type === 'buy' ? 'buy' : null
      const holdingId = typeof a.holdingId === 'string' ? a.holdingId : null
      const year = asNumber(a.year, 0)
      const shares = asNumber(a.shares, NaN)
      if (!type || !holdingId || year <= 0 || !Number.isFinite(shares) || shares < 0) continue
      const action: PortfolioAction = {
        id: typeof a.id === 'string' ? a.id : crypto.randomUUID(),
        type,
        holdingId,
        year,
        shares,
      }
      const price = asNumberOrNull(a.price)
      if (price != null && price > 0) action.price = price
      if (typeof a.note === 'string') action.note = a.note
      actions.push(action)
    }
  }

  let perpetualYearlyDeposit: PerpetualYearlyDeposit | null = null
  if (isRecord(raw.perpetualYearlyDeposit)) {
    const p = raw.perpetualYearlyDeposit
    const amount = Math.max(0, asNumber(p.amount, 0))
    const source = p.source === 'surplus' ? 'surplus' : 'fixed'
    perpetualYearlyDeposit = {
      amount,
      source,
      surplusScenarioId:
        typeof p.surplusScenarioId === 'string' ? p.surplusScenarioId : null,
      surplusPercent: Math.max(0, asNumber(p.surplusPercent, 0)),
    }
    if (p.currency === 'CHF' || p.currency === 'USD') {
      perpetualYearlyDeposit.currency = p.currency
    }
  }

  const perpetualGrowthPercent =
    raw.perpetualGrowthPercent == null
      ? null
      : asNumber(raw.perpetualGrowthPercent, 0)

  let actuals: Record<string, number> | undefined
  if (isRecord(raw.actuals)) {
    actuals = {}
    for (const [k, v] of Object.entries(raw.actuals)) {
      if (!/^\d{4}-\d{2}$/.test(k)) continue
      const n = asNumber(v, NaN)
      if (Number.isFinite(n) && n >= 0) actuals[k] = n
    }
    if (Object.keys(actuals).length === 0) actuals = undefined
  }
  const actualsCurrency =
    raw.actualsCurrency === 'CHF' || raw.actualsCurrency === 'USD'
      ? raw.actualsCurrency
      : undefined

  return normalizePortfolioCashModel({
    id,
    name,
    currentCash,
    deposits,
    perpetualYearlyDeposit,
    perpetualGrowthPercent,
    actions,
    holdings,
    actuals,
    actualsCurrency,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  })
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
    // Lazy import avoids circular init if dataSync loads storage modules
    void import('./dataSync').then((m) => m.notifyAppDataChanged())
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

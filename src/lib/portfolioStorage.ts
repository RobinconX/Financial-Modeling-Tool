import type {
  OptionContract,
  PerpetualYearlyDeposit,
  PortfolioAction,
  PortfolioDeposit,
  PortfolioHolding,
  SavedPortfolio,
} from '../types'
import { queueAppDataChanged } from './linkedMirrorGate'
import { buildOccSymbol } from './optionContract'
import { stripPortfolioActuals } from './portfolioActuals'
import { newDeposit, newHolding, normalizePortfolioCashModel } from './portfolio'

export const PORTFOLIO_STORAGE_KEY = 'grok-lab.saved-portfolios.v1'
/** Legacy UI-only key; still read so older sessions keep their selection. */
const LEGACY_SELECTED_PORTFOLIO_KEY = 'grok-lab-selected-portfolio'

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
    option: normalizeOption(raw.option, symbol),
  }
}

function normalizeOption(raw: unknown, fallbackUnderlying: string): OptionContract | undefined {
  if (!isRecord(raw)) return undefined
  const right = raw.right === 'P' ? 'P' : raw.right === 'C' ? 'C' : null
  const strike = asNumber(raw.strike, NaN)
  const expiration = typeof raw.expiration === 'string' ? raw.expiration : ''
  if (!right || !Number.isFinite(strike) || strike < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
    return undefined
  }
  const underlying = (
    typeof raw.underlying === 'string' ? raw.underlying : fallbackUnderlying
  )
    .trim()
    .toUpperCase()
  if (!underlying) return undefined
  const multiplierRaw = asNumber(raw.multiplier, 100)
  const multiplier = multiplierRaw > 0 ? multiplierRaw : 100
  const occ =
    typeof raw.occSymbol === 'string' && raw.occSymbol.trim()
      ? raw.occSymbol.trim().toUpperCase()
      : buildOccSymbol(underlying, expiration, right, strike)
  if (!occ) return undefined
  return { underlying, expiration, right, strike, multiplier, occSymbol: occ }
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

  const holdingSort =
    raw.holdingSort === 'manual' ||
    raw.holdingSort === 'symbol' ||
    raw.holdingSort === 'value'
      ? raw.holdingSort
      : undefined

  let targetCompound: SavedPortfolio['targetCompound'] = null
  if (isRecord(raw.targetCompound)) {
    const amount = asNumber(raw.targetCompound.amount, NaN)
    const ratePercent = asNumber(raw.targetCompound.ratePercent, NaN)
    if (Number.isFinite(amount) && amount > 0 && Number.isFinite(ratePercent)) {
      const yearRaw = asNumber(raw.targetCompound.year, NaN)
      const year =
        Number.isFinite(yearRaw) && yearRaw >= 1000 && yearRaw <= 9999
          ? Math.floor(yearRaw)
          : new Date().getFullYear()
      targetCompound = {
        amount,
        currency:
          raw.targetCompound.currency === 'CHF' ? 'CHF' : 'USD',
        ratePercent,
        year,
      }
    }
  }

  let goalSpeed: SavedPortfolio['goalSpeed'] = null
  if (isRecord(raw.goalSpeed)) {
    const goalAmount = Math.max(0, asNumber(raw.goalSpeed.goalAmount, 0))
    const ratePercent = asNumberOrNull(raw.goalSpeed.ratePercent)
    const customStart = asNumberOrNull(raw.goalSpeed.customStart)
    const startYearRaw = asNumberOrNull(raw.goalSpeed.startYear)
    const startYear =
      startYearRaw != null && startYearRaw >= 1000 && startYearRaw <= 9999
        ? Math.floor(startYearRaw)
        : null
    const extras = Array.isArray(raw.goalSpeed.extras)
      ? raw.goalSpeed.extras
          .map((e) => {
            if (!isRecord(e)) return null
            const year = Math.floor(asNumber(e.year, 0))
            const amount = asNumber(e.amount, 0)
            if (year < 1000 || year > 9999 || !Number.isFinite(amount) || amount < 0) {
              return null
            }
            return {
              id: typeof e.id === 'string' ? e.id : crypto.randomUUID(),
              year,
              amount,
            }
          })
          .filter((e): e is { id: string; year: number; amount: number } => e != null)
      : []
    const extrasMode =
      raw.goalSpeed.extrasMode === 'stated' || raw.goalSpeed.extrasMode === 'custom'
        ? raw.goalSpeed.extrasMode
        : extras.length > 0
          ? 'custom'
          : 'stated'
    if (
      goalAmount > 0 ||
      customStart != null ||
      extras.length > 0 ||
      ratePercent != null ||
      raw.goalSpeed.extrasMode === 'stated' ||
      raw.goalSpeed.extrasMode === 'custom' ||
      startYear != null
    ) {
      goalSpeed = {
        goalAmount,
        currency: raw.goalSpeed.currency === 'CHF' ? 'CHF' : 'USD',
        ratePercent,
        customStart:
          customStart != null && Number.isFinite(customStart) && customStart >= 0
            ? customStart
            : null,
        startYear,
        extrasMode,
        extras,
      }
    }
  }

  return normalizePortfolioCashModel({
    id,
    name,
    currentCash,
    deposits,
    perpetualYearlyDeposit,
    perpetualGrowthPercent,
    actions,
    holdings,
    holdingSort,
    actuals,
    actualsCurrency,
    targetCompound,
    goalSpeed,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  })
}

function readPayload(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function loadPortfolios(): SavedPortfolio[] {
  try {
    const parsed = readPayload()
    if (!parsed || !Array.isArray(parsed.portfolios)) {
      if (parsed) console.warn('[portfolioStorage] Invalid payload; resetting')
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

export function loadSelectedPortfolioId(): string | null {
  const parsed = readPayload()
  if (parsed && typeof parsed.selectedId === 'string' && parsed.selectedId) {
    return parsed.selectedId
  }
  try {
    const legacy = localStorage.getItem(LEGACY_SELECTED_PORTFOLIO_KEY)
    return legacy && legacy.length > 0 ? legacy : null
  } catch {
    return null
  }
}

export function savePortfolios(
  portfolios: SavedPortfolio[],
  selectedId?: string | null,
): { ok: true } | { ok: false; error: string } {
  try {
    const requested = selectedId !== undefined ? selectedId : loadSelectedPortfolioId()
    const valid =
      requested && portfolios.some((p) => p.id === requested) ? requested : null
    localStorage.setItem(
      PORTFOLIO_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        portfolios: portfolios.map(stripPortfolioActuals),
        selectedId: valid,
      }),
    )
    try {
      if (valid) localStorage.setItem(LEGACY_SELECTED_PORTFOLIO_KEY, valid)
    } catch {
      /* ignore */
    }
    queueAppDataChanged()
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

export function persistSelectedPortfolioId(id: string | null): boolean {
  return savePortfolios(loadPortfolios(), id).ok
}

export { newHolding }

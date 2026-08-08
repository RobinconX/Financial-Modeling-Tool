import type {
  CashflowLine,
  DisplayCurrency,
  PerpetualYearlyDeposit,
  PortfolioAction,
  PortfolioDeposit,
  PortfolioDepositSource,
  PortfolioGrid,
  PortfolioGridRow,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
  ValuationBasis,
} from '../types'
import { scenarioTotals } from './incomeCost'
import { fixedAmountToUsd } from './fx'
import {
  effectiveMarketCap,
  impliedSharePrice,
  resolveSharesOutstanding,
} from './sharePrice'
import { buildAdvancedProjections } from './valuation'

/** Context to resolve surplus-linked deposits (Income/Cost is CHF; portfolio book is USD). */
export type DepositResolveContext = {
  incomeCostLines: CashflowLine[]
  /** USD→CHF rate; required to convert surplus CHF into USD book amounts */
  usdToChf: number | null
}

/**
 * Resolved USD deposit for cash math.
 * Fixed: amount in `currency` (default USD) → USD (CHF uses FX only at resolve time).
 * Surplus: max(0, scenario net yearly CHF) × percent / 100 → USD.
 * Does not mutate Income/Cost data or persisted deposit rows.
 */
export function resolveDepositAmount(
  d: PortfolioDeposit,
  ctx?: DepositResolveContext | null,
): number {
  const source: PortfolioDepositSource = d.source === 'surplus' ? 'surplus' : 'fixed'
  if (source !== 'surplus') {
    return fixedAmountToUsd(d.amount, d.currency, ctx?.usdToChf)
  }
  if (!ctx?.incomeCostLines || !d.surplusScenarioId) {
    return fixedAmountToUsd(d.amount, d.currency, ctx?.usdToChf)
  }
  const netChf = scenarioTotals(ctx.incomeCostLines, d.surplusScenarioId).netYearly
  const surplusChf = Math.max(0, netChf)
  const pct = Number.isFinite(d.surplusPercent) ? Math.max(0, d.surplusPercent!) : 0
  const chf = surplusChf * (pct / 100)
  if (ctx.usdToChf != null && ctx.usdToChf > 0) {
    return chf / ctx.usdToChf
  }
  // No FX: cannot convert CHF→USD reliably; fall back to stored amount as USD
  return fixedAmountToUsd(d.amount, d.currency ?? 'USD', ctx?.usdToChf)
}

/**
 * Already-deposited portion in USD book.
 * Fixed: same currency as `amount`. Surplus: stored as CHF (income domain).
 */
export function resolveAlreadyDeposited(
  d: PortfolioDeposit,
  ctx?: DepositResolveContext | null,
): number {
  const raw = d.alreadyDeposited
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return 0
  if (d.source === 'surplus') {
    if (ctx?.usdToChf != null && ctx.usdToChf > 0) return raw / ctx.usdToChf
    return raw
  }
  return fixedAmountToUsd(raw, d.currency, ctx?.usdToChf)
}

/** Planned deposit minus already deposited (USD book), floored at 0. */
export function remainingDepositAmount(
  d: PortfolioDeposit,
  ctx?: DepositResolveContext | null,
): number {
  const planned = resolveDepositAmount(d, ctx)
  const already = Math.min(planned, resolveAlreadyDeposited(d, ctx))
  return Math.max(0, planned - already)
}

/**
 * How much of a deposit counts toward cash at calendar year `asOfYear`, given
 * `currentYear` (today). Current-year plans only add the remaining amount
 * (already deposited is assumed to sit in opening cash).
 */
export function depositContributionTowardCash(
  d: PortfolioDeposit,
  asOfYear: number,
  currentYear = new Date().getFullYear(),
): number {
  if (d.year > asOfYear) return 0
  const planned = Number.isFinite(d.amount) ? Math.max(0, d.amount) : 0
  if (d.isOpening) return planned
  const already = Math.min(
    planned,
    Number.isFinite(d.alreadyDeposited) ? Math.max(0, d.alreadyDeposited!) : 0,
  )
  // Past years: full planned contribution
  if (d.year < currentYear) return planned
  // Current year: only what is still outstanding (already is in opening)
  if (d.year === currentYear) return Math.max(0, planned - already)
  // Future year already reached asOfYear: full plan
  return planned
}

/** Resolve a perpetual yearly deposit config to a USD book amount. */
export function resolvePerpetualYearlyAmount(
  p: PerpetualYearlyDeposit | null | undefined,
  ctx?: DepositResolveContext | null,
): number {
  if (!p) return 0
  return resolveDepositAmount(
    {
      id: 'perpetual',
      year: 0,
      amount: p.amount,
      currency: p.currency,
      source: p.source,
      surplusScenarioId: p.surplusScenarioId,
      surplusPercent: p.surplusPercent,
    },
    ctx,
  )
}

/** Portfolio copy with deposit (and perpetual) amounts resolved to USD for cash math / charts. */
export function withResolvedDepositAmounts(
  portfolio: SavedPortfolio,
  ctx?: DepositResolveContext | null,
): SavedPortfolio {
  const deposits = getDeposits(portfolio)
  const perpetual = portfolio.perpetualYearlyDeposit ?? null
  const needsResolve =
    deposits.some(
      (d) =>
        d.source === 'surplus' ||
        d.currency === 'CHF' ||
        (d.alreadyDeposited != null && d.alreadyDeposited > 0),
    ) ||
    (perpetual != null &&
      (perpetual.source === 'surplus' || perpetual.currency === 'CHF'))

  if (!needsResolve) return portfolio

  return {
    ...portfolio,
    deposits: deposits.map((d) => {
      const planned = resolveDepositAmount(d, ctx)
      const already = Math.min(planned, resolveAlreadyDeposited(d, ctx))
      return {
        ...d,
        amount: planned,
        alreadyDeposited: already > 0 ? already : undefined,
        currency: undefined,
        source: 'fixed' as const,
      }
    }),
    perpetualYearlyDeposit: perpetual
      ? {
          amount: resolvePerpetualYearlyAmount(perpetual, ctx),
          currency: undefined,
          source: 'fixed' as const,
        }
      : null,
  }
}

export type PropagatePortfolioFields = {
  /** Opening cash, planned deposits, and perpetual yearly deposit */
  cash?: boolean
  /** Shares (and linked scenario/basis/overrides) matched by symbol */
  holdings?: boolean
  /**
   * With holdings: also copy buy/sell actions for matched tickers
   * (holding ids remapped source → target).
   */
  actions?: boolean
  /** Monthly end-of-month actuals map + currency (full overwrite) */
  actuals?: boolean
}

/**
 * Copy cash, stock positions, and/or actuals from source onto target.
 * Holdings are matched by symbol; target-only symbols are left unchanged.
 * Does not change target id/name/createdAt.
 */
export function applyPortfolioValuesToTarget(
  source: SavedPortfolio,
  target: SavedPortfolio,
  fields: PropagatePortfolioFields,
): SavedPortfolio {
  const doCash = !!fields.cash
  const doHoldings = !!fields.holdings
  const doActions = !!fields.actions && doHoldings
  const doActuals = !!fields.actuals
  if (!doCash && !doHoldings && !doActuals) return target

  let deposits = getDeposits(target)
  let perpetualYearlyDeposit = target.perpetualYearlyDeposit ?? null
  let holdings = target.holdings
  let actions = getActions(target)
  let actuals = target.actuals
  let actualsCurrency = target.actualsCurrency

  if (doCash) {
    const srcDeps = getDeposits(source)
    const srcOpening = srcDeps.find((d) => d.isOpening)
    const srcPlanned = srcDeps.filter((d) => !d.isOpening)
    const tgtOpening = deposits.find((d) => d.isOpening) ?? newOpeningDeposit(0)

    const opening: PortfolioDeposit = {
      ...tgtOpening,
      amount: srcOpening?.amount ?? 0,
      currency: srcOpening?.currency,
      source: srcOpening?.source === 'surplus' ? 'surplus' : 'fixed',
      surplusScenarioId: srcOpening?.surplusScenarioId ?? null,
      surplusPercent: srcOpening?.surplusPercent,
      isOpening: true,
    }
    if (opening.source !== 'surplus') {
      delete opening.surplusScenarioId
      delete opening.surplusPercent
    }

    const planned: PortfolioDeposit[] = srcPlanned.map((d) => {
      const row: PortfolioDeposit = {
        id: crypto.randomUUID(),
        year: d.year,
        amount: d.amount,
        currency: d.currency,
        source: d.source === 'surplus' ? 'surplus' : 'fixed',
      }
      if (d.source === 'surplus') {
        row.surplusScenarioId = d.surplusScenarioId ?? null
        row.surplusPercent = d.surplusPercent
      }
      if (d.alreadyDeposited != null && d.alreadyDeposited > 0) {
        row.alreadyDeposited = d.alreadyDeposited
      }
      return row
    })

    deposits = [opening, ...planned]
    perpetualYearlyDeposit = source.perpetualYearlyDeposit
      ? { ...source.perpetualYearlyDeposit }
      : null
  }

  // source holding id → target holding id for matched symbols
  const sourceHoldingToTarget = new Map<string, string>()
  if (doHoldings) {
    holdings = target.holdings.map((th) => {
      const match = source.holdings.find(
        (sh) => sh.symbol.toUpperCase() === th.symbol.toUpperCase(),
      )
      if (!match) return th
      sourceHoldingToTarget.set(match.id, th.id)
      return {
        ...th,
        sharesHeld: match.sharesHeld,
        manualCurrentPrice: match.manualCurrentPrice,
        scenarioId: match.scenarioId,
        basis: match.basis,
        yearOverrides: (match.yearOverrides ?? []).map((o) => ({ ...o })),
      }
    })
  }

  if (doActions && sourceHoldingToTarget.size > 0) {
    const matchedTargetIds = new Set(sourceHoldingToTarget.values())
    // Drop target actions on matched tickers; keep actions on target-only symbols
    const kept = getActions(target).filter((a) => !matchedTargetIds.has(a.holdingId))
    const copied: PortfolioAction[] = []
    for (const a of getActions(source)) {
      const newHoldingId = sourceHoldingToTarget.get(a.holdingId)
      if (!newHoldingId) continue
      const next: PortfolioAction = {
        id: crypto.randomUUID(),
        type: a.type,
        holdingId: newHoldingId,
        year: a.year,
        shares: a.shares,
      }
      if (a.price != null && a.price > 0) next.price = a.price
      if (a.note) next.note = a.note
      copied.push(next)
    }
    actions = [...kept, ...copied]
  }

  if (doActuals) {
    actuals = source.actuals ? { ...source.actuals } : undefined
    actualsCurrency = source.actualsCurrency
  }

  return normalizePortfolioCashModel({
    ...target,
    deposits,
    perpetualYearlyDeposit,
    holdings,
    actions,
    actuals,
    actualsCurrency,
    currentCash: 0,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Last calendar year with an explicit non-opening deposit.
 * If none, uses opening deposit year (or fallbackYear).
 */
export function lastExplicitDepositYear(
  portfolio: SavedPortfolio,
  fallbackYear = new Date().getFullYear(),
): number {
  const deposits = getDeposits(portfolio)
  const planned = deposits.filter((d) => !d.isOpening)
  if (planned.length > 0) {
    return Math.max(...planned.map((d) => d.year))
  }
  const opening = deposits.find((d) => d.isOpening)
  if (opening && Number.isFinite(opening.year)) return opening.year
  return fallbackYear
}

export function newHolding(symbol = ''): PortfolioHolding {
  return {
    id: crypto.randomUUID(),
    symbol: symbol.toUpperCase(),
    label: null,
    sharesHeld: 0,
    scenarioId: null,
    basis: 'easy',
    yearOverrides: [],
    manualCurrentPrice: null,
    manualOnly: false,
  }
}

/** Free-form position (options, etc.) — no projection link. */
export function newManualHolding(name = ''): PortfolioHolding {
  return {
    id: crypto.randomUUID(),
    symbol: name.trim() ? name.trim().toUpperCase().slice(0, 24) : 'MANUAL',
    label: name.trim() || 'Manual position',
    sharesHeld: 1,
    scenarioId: null,
    basis: 'easy',
    yearOverrides: [],
    manualCurrentPrice: null,
    manualOnly: true,
  }
}

export function newDeposit(
  year?: number,
  amount = 0,
  opts?: { isOpening?: boolean },
): PortfolioDeposit {
  return {
    id: crypto.randomUUID(),
    year: year ?? new Date().getFullYear(),
    amount: Math.max(0, amount),
    ...(opts?.isOpening ? { isOpening: true } : {}),
  }
}

// --- Manual end-of-month portfolio actuals (YYYY-MM → total) ---

export function makeActualKey(year: number, month: number): string {
  const m = Math.min(12, Math.max(1, Math.floor(month)))
  return `${Math.floor(year)}-${String(m).padStart(2, '0')}`
}

export function parseActualKey(
  key: string,
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, month }
}

export function getActualsMap(portfolio: SavedPortfolio): Record<string, number> {
  if (!portfolio.actuals || typeof portfolio.actuals !== 'object') return {}
  return portfolio.actuals
}

export function getActualsCurrency(portfolio: SavedPortfolio): DisplayCurrency {
  return portfolio.actualsCurrency === 'CHF' ? 'CHF' : 'USD'
}

/** Nominal actual amount for a month (as stored), or null if unset. */
export function actualAmountAtMonth(
  portfolio: SavedPortfolio,
  year: number,
  month: number,
): number | null {
  const v = getActualsMap(portfolio)[makeActualKey(year, month)]
  if (v == null || !Number.isFinite(v) || v < 0) return null
  return v
}

/** Actual total in USD book for chart/math. */
export function actualUsdAtMonth(
  portfolio: SavedPortfolio,
  year: number,
  month: number,
  usdToChf?: number | null,
): number | null {
  const amount = actualAmountAtMonth(portfolio, year, month)
  if (amount == null) return null
  return fixedAmountToUsd(amount, getActualsCurrency(portfolio), usdToChf)
}

/**
 * Last recorded actual in a calendar year (highest month with a value).
 * Used as the year-end bar for past years on the chart.
 */
export function yearEndActualUsd(
  portfolio: SavedPortfolio,
  year: number,
  usdToChf?: number | null,
): number | null {
  const map = getActualsMap(portfolio)
  let bestMonth = 0
  let best: number | null = null
  for (const [key, raw] of Object.entries(map)) {
    const p = parseActualKey(key)
    if (!p || p.year !== year) continue
    if (raw == null || !Number.isFinite(raw) || raw < 0) continue
    if (p.month >= bestMonth) {
      bestMonth = p.month
      best = fixedAmountToUsd(raw, getActualsCurrency(portfolio), usdToChf)
    }
  }
  return best
}

/** Calendar years that have at least one actual month entry. */
export function listActualYears(portfolio: SavedPortfolio): number[] {
  const years = new Set<number>()
  for (const key of Object.keys(getActualsMap(portfolio))) {
    const p = parseActualKey(key)
    if (p) years.add(p.year)
  }
  return [...years].sort((a, b) => a - b)
}

export function earliestActualYear(
  portfolio: SavedPortfolio,
  fallback: number,
): number {
  const years = listActualYears(portfolio)
  return years.length > 0 ? years[0]! : fallback
}

export function newOpeningDeposit(amount = 0, year?: number): PortfolioDeposit {
  return newDeposit(year ?? new Date().getFullYear(), amount, { isOpening: true })
}

export function newPortfolio(name = 'My portfolio'): SavedPortfolio {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    currentCash: 0,
    deposits: [newOpeningDeposit(0)],
    actions: [],
    holdings: [],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Deep-clone a portfolio with new IDs so edits do not affect the source.
 * Holding `scenarioId` is preserved (shared projections). Action holdingIds are remapped.
 */
export function clonePortfolio(source: SavedPortfolio, name: string): SavedPortfolio {
  const now = new Date().toISOString()
  const holdingIdMap = new Map<string, string>()

  const holdings = (source.holdings ?? []).map((h) => {
    const newId = crypto.randomUUID()
    holdingIdMap.set(h.id, newId)
    return {
      id: newId,
      symbol: h.symbol,
      label: h.label ?? null,
      sharesHeld: h.sharesHeld,
      scenarioId: h.manualOnly ? null : h.scenarioId,
      basis: h.basis,
      yearOverrides: (h.yearOverrides ?? []).map((o) => ({
        year: o.year,
        valueDollars: o.valueDollars,
      })),
      manualCurrentPrice: h.manualCurrentPrice,
      manualOnly: h.manualOnly === true,
    }
  })

  const deposits = (source.deposits ?? []).map((d) => {
    const next: PortfolioDeposit = {
      id: crypto.randomUUID(),
      year: d.year,
      amount: d.amount,
    }
    if (d.currency === 'CHF' || d.currency === 'USD') next.currency = d.currency
    if (d.isOpening) next.isOpening = true
    if (d.source === 'surplus') {
      next.source = 'surplus'
      next.surplusScenarioId = d.surplusScenarioId ?? null
      next.surplusPercent = d.surplusPercent ?? 0
    }
    if (d.alreadyDeposited != null && d.alreadyDeposited > 0) {
      next.alreadyDeposited = d.alreadyDeposited
    }
    return next
  })

  const actions = (source.actions ?? [])
    .map((a) => {
      const newHoldingId = holdingIdMap.get(a.holdingId)
      if (!newHoldingId) return null
      const action: PortfolioAction = {
        id: crypto.randomUUID(),
        type: a.type,
        holdingId: newHoldingId,
        year: a.year,
        shares: a.shares,
      }
      if (a.price != null && a.price > 0) action.price = a.price
      if (a.note) action.note = a.note
      return action
    })
    .filter((a): a is PortfolioAction => a != null)

  return normalizePortfolioCashModel({
    id: crypto.randomUUID(),
    name: name.trim() || `Copy of ${source.name}`,
    currentCash: source.currentCash ?? 0,
    deposits,
    perpetualYearlyDeposit: source.perpetualYearlyDeposit
      ? { ...source.perpetualYearlyDeposit }
      : null,
    perpetualGrowthPercent: source.perpetualGrowthPercent ?? null,
    actions,
    holdings,
    holdingSort: source.holdingSort,
    actuals: source.actuals ? { ...source.actuals } : undefined,
    actualsCurrency: source.actualsCurrency,
    createdAt: now,
    updatedAt: now,
  })
}

/** Years to show on portfolio grid/chart after last stated projection when growth is on. */
export const DEFAULT_PERPETUAL_GROWTH_HORIZON = 20

/** Effective annual growth rate (0 if off / invalid). */
export function getPerpetualGrowthRate(portfolio: SavedPortfolio): number {
  const r = portfolio.perpetualGrowthPercent
  if (r == null || !Number.isFinite(r) || r === 0) return 0
  return r
}

/**
 * Last calendar year with an explicit portfolio projection input
 * (deposits, actions, or holding scenario/override values).
 */
export function lastStatedProjectionYear(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[] = [],
  currentYear = new Date().getFullYear(),
): number {
  let maxY = currentYear
  for (const d of getDeposits(portfolio)) {
    if (d.year > maxY) maxY = d.year
  }
  for (const a of getActions(portfolio)) {
    if (a.year > maxY) maxY = a.year
  }
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const actions = getActions(portfolio)
  for (const h of portfolio.holdings) {
    const scenario = h.scenarioId ? (byId.get(h.scenarioId) ?? null) : null
    const map = computeHoldingValues(h, scenario, actions, currentYear)
    for (const y of map.keys()) {
      if (y > maxY) maxY = y
    }
  }
  return maxY
}

/**
 * Fold legacy currentCash into an opening deposit; ensure exactly one opening row.
 * After normalize, currentCash is always 0 and cash lives only in deposits.
 */
export function normalizePortfolioCashModel(portfolio: SavedPortfolio): SavedPortfolio {
  const currentYear = new Date().getFullYear()
  let deposits = Array.isArray(portfolio.deposits) ? [...portfolio.deposits] : []

  let legacyCash = 0
  if (
    portfolio.currentCash != null &&
    Number.isFinite(portfolio.currentCash) &&
    portfolio.currentCash > 0
  ) {
    legacyCash = portfolio.currentCash
  } else if (
    portfolio.cashDollars != null &&
    Number.isFinite(portfolio.cashDollars) &&
    portfolio.cashDollars > 0
  ) {
    legacyCash = portfolio.cashDollars
  }

  const openings = deposits.filter((d) => d.isOpening)
  let opening = openings[0]

  if (!opening) {
    opening = newOpeningDeposit(legacyCash, currentYear)
    deposits = [opening, ...deposits]
  } else if (legacyCash > 0 && opening.amount === 0) {
    // Fold leftover currentCash into existing empty opening
    opening = { ...opening, amount: legacyCash, year: opening.year || currentYear }
    deposits = deposits.map((d) => (d.id === opening!.id ? opening! : d))
  } else if (legacyCash > 0 && openings.length === 1) {
    // Prefer not double-count: if both had cash, sum once into opening
    // (legacy path when both fields were set)
    if (portfolio.currentCash != null && portfolio.currentCash > 0) {
      // opening already has amount; leave it — caller should zero currentCash
    }
  }

  // Exactly one isOpening
  deposits = deposits.map((d) =>
    d.id === opening!.id ? { ...d, isOpening: true } : { ...d, isOpening: false },
  )

  deposits.sort((a, b) => {
    if (a.isOpening && !b.isOpening) return -1
    if (!a.isOpening && b.isOpening) return 1
    return a.year - b.year || a.id.localeCompare(b.id)
  })

  return {
    ...portfolio,
    currentCash: 0,
    deposits,
  }
}

export function newAction(
  type: PortfolioAction['type'] = 'buy',
  holdingId = '',
  year?: number,
): PortfolioAction {
  return {
    id: crypto.randomUUID(),
    type,
    holdingId,
    year: year ?? new Date().getFullYear() + 1,
    shares: 0,
  }
}

export function getActions(portfolio: SavedPortfolio): PortfolioAction[] {
  if (!Array.isArray(portfolio.actions)) return []
  return [...portfolio.actions].sort(
    (a, b) => a.year - b.year || a.type.localeCompare(b.type) || a.id.localeCompare(b.id),
  )
}

export function resolveCurrentPrice(
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
): number | null {
  // Manual positions may use 0 or negative unit marks (liabilities / shorts).
  if (
    holding.manualCurrentPrice != null &&
    Number.isFinite(holding.manualCurrentPrice) &&
    (holding.manualOnly === true || holding.manualCurrentPrice > 0)
  ) {
    return holding.manualCurrentPrice
  }
  if (scenario?.currentPrice != null && scenario.currentPrice > 0) {
    return scenario.currentPrice
  }
  return null
}

/** Deposits list sorted (opening first). Does not create rows — normalize on load/save. */
export function getDeposits(portfolio: SavedPortfolio): PortfolioDeposit[] {
  if (!Array.isArray(portfolio.deposits)) return []
  return [...portfolio.deposits].sort((a, b) => {
    if (a.isOpening && !b.isOpening) return -1
    if (!a.isOpening && b.isOpening) return 1
    return a.year - b.year || a.id.localeCompare(b.id)
  })
}

/** Opening cash (Now bar) — from isOpening deposit, or legacy currentCash if present. */
export function getOpeningCash(portfolio: SavedPortfolio): number {
  const deposits = Array.isArray(portfolio.deposits) ? portfolio.deposits : []
  const opening = deposits.find((d) => d.isOpening)
  if (opening && Number.isFinite(opening.amount) && opening.amount >= 0) {
    return opening.amount
  }
  // Pre-normalize legacy
  if (
    portfolio.currentCash != null &&
    Number.isFinite(portfolio.currentCash) &&
    portfolio.currentCash > 0
  ) {
    return portfolio.currentCash
  }
  if (portfolio.cashDollars != null && portfolio.cashDollars > 0) {
    return portfolio.cashDollars
  }
  return 0
}

/** @deprecated Use getOpeningCash — alias for opening / current cash */
export function getCurrentCash(portfolio: SavedPortfolio): number {
  return getOpeningCash(portfolio)
}

/**
 * Cash from deposits only (no trades):
 *   sum of deposits with year <= Y (opening cash is a deposit)
 *   + perpetual yearly amount × years after last explicit deposit (if configured).
 * Current-year non-opening deposits only contribute the remaining (planned − already).
 * Call with withResolvedDepositAmounts() first when surplus sources are used.
 */
export function cashFromDeposits(
  portfolio: SavedPortfolio,
  year: number,
  currentYear = new Date().getFullYear(),
): number {
  const deposits = getDeposits(portfolio)
  const hasOpening = deposits.some((d) => d.isOpening)
  // Legacy: currentCash not yet folded into deposits
  let sum = hasOpening ? 0 : getOpeningCash(portfolio)
  for (const d of deposits) {
    sum += depositContributionTowardCash(d, year, currentYear)
  }
  const last = lastExplicitDepositYear(portfolio, year)
  const perYear = resolvePerpetualYearlyAmount(portfolio.perpetualYearlyDeposit)
  if (perYear > 0 && year > last) {
    sum += perYear * (year - last)
  }
  return sum
}

/** @deprecated use cashForYear with portfolio actions — alias for deposit-only cash */
export function cashForYear(portfolio: SavedPortfolio, year: number): number {
  return cashAtYear(portfolio, year)
}

/** Non-opening deposit amount scheduled in a specific year (not cumulative), incl. perpetual. */
export function depositInYear(
  portfolio: SavedPortfolio,
  year: number,
  currentYear = new Date().getFullYear(),
): number {
  const explicit = getDeposits(portfolio)
    .filter((d) => d.year === year && !d.isOpening)
    .reduce((s, d) => s + depositContributionTowardCash(d, year, currentYear), 0)
  const last = lastExplicitDepositYear(portfolio, year)
  const perYear =
    year > last ? resolvePerpetualYearlyAmount(portfolio.perpetualYearlyDeposit) : 0
  return explicit + perYear
}

/** Shares held at year Y after buy/sell actions through that year. */
export function sharesAtYear(
  holding: PortfolioHolding,
  actions: PortfolioAction[],
  year: number,
): number {
  let shares = holding.sharesHeld
  for (const a of actions) {
    if (a.holdingId !== holding.id || a.year > year || !(a.shares > 0)) continue
    if (a.type === 'buy') shares += a.shares
    else shares -= a.shares
  }
  return shares
}

/** Trade price for an action year (live price for current year, else scenario). */
export function tradePriceForYear(
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
  year: number,
  currentYear = new Date().getFullYear(),
): number | null {
  if (year <= currentYear) {
    return resolveCurrentPrice(holding, scenario)
  }
  if (scenario) {
    const map = getHoldingSharePriceByYear(holding, scenario, currentYear)
    const px = map.get(year)
    if (px != null && px > 0) return px
  }
  // Fallback: live price if no projection that year
  return resolveCurrentPrice(holding, scenario)
}

/**
 * Effective share price for a planned buy/sell.
 * Prefer the action’s explicit `price` when set; otherwise scenario/live for the year.
 */
export function actionTradePrice(
  action: PortfolioAction,
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
  currentYear = new Date().getFullYear(),
): number | null {
  if (action.price != null && Number.isFinite(action.price) && action.price > 0) {
    return action.price
  }
  return tradePriceForYear(holding, scenario, action.year, currentYear)
}

/**
 * Cash at year Y including deposits and buy/sell cash flows.
 * May be negative (allowed; UI should warn).
 */
export function cashAtYear(
  portfolio: SavedPortfolio,
  year: number,
  scenarios: SavedScenario[] = [],
  currentYear = new Date().getFullYear(),
): number {
  let sum = cashFromDeposits(portfolio, year, currentYear)
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const holdingsById = new Map(portfolio.holdings.map((h) => [h.id, h]))

  for (const a of getActions(portfolio)) {
    if (a.year > year || !(a.shares > 0)) continue
    const holding = holdingsById.get(a.holdingId)
    if (!holding) continue
    const scenario = holding.scenarioId ? (byId.get(holding.scenarioId) ?? null) : null
    const px = actionTradePrice(a, holding, scenario, currentYear)
    if (px == null || px <= 0) continue
    const cashFlow = a.shares * px
    if (a.type === 'buy') sum -= cashFlow
    else sum += cashFlow
  }
  return sum
}

export function hasNegativeCash(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  years: number[],
  currentYear = new Date().getFullYear(),
): boolean {
  if (getCurrentCash(portfolio) < 0) return true
  for (const y of years) {
    if (cashAtYear(portfolio, y, scenarios, currentYear) < 0) return true
  }
  return false
}

export function holdingDisplayName(holding: PortfolioHolding): string {
  const label = holding.label?.trim()
  if (label) return label
  return (holding.symbol || '—').toUpperCase()
}

/** Human-readable row label for a holding (always derived fresh from scenario). */
export function holdingPositionLabel(
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
): string {
  const name = holdingDisplayName(holding)
  if (holding.manualOnly || (!holding.scenarioId && !scenario)) {
    const qty =
      holding.sharesHeld !== 0
        ? `${holding.sharesHeld.toLocaleString(undefined, { maximumFractionDigits: 4 })} unit${Math.abs(holding.sharesHeld) === 1 ? '' : 's'}`
        : null
    return [name, 'Manual', qty].filter(Boolean).join(' · ')
  }
  const symbol = (holding.symbol || '—').toUpperCase()
  const company =
    scenario?.companyName &&
    scenario.companyName.trim() &&
    scenario.companyName.trim().toUpperCase() !== symbol
      ? scenario.companyName.trim()
      : null
  const scenarioLabel = scenario?.name?.trim()
    ? scenario.name.trim()
    : holding.scenarioId
      ? 'Missing scenario'
      : 'Manual'
  const shareLabel =
    holding.sharesHeld > 0
      ? `${holding.sharesHeld.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh`
      : null

  return [name !== symbol ? name : symbol, company, scenarioLabel, shareLabel]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Projected shareholder equity value (post-dilution) by calendar year for a basis.
 * Easy: projected mcap rows. Advanced: PS / PFCF / PE implied mcap / dilution.
 * Does not require current mcap for easy rows (Saved tab can show mcap-only inputs).
 *
 * Includes the current calendar year when a year-end projection is stated
 * (used for portfolio year-end columns, not the live Now bar).
 */
export function getProjectedEquityByYear(
  scenario: SavedScenario,
  basis: ValuationBasis | 'easy',
  currentYear = new Date().getFullYear(),
): Map<number, number> {
  const map = new Map<number, number>()

  if (basis === 'easy') {
    for (const easy of scenario.easyRows ?? []) {
      const year = Number(easy.year)
      const projected = easy.projectedMarketCap
      // Past years only are excluded; current year = year-end projection
      if (!Number.isFinite(year) || year < currentYear) continue
      if (projected == null || !Number.isFinite(projected) || projected <= 0) continue
      map.set(year, projected)
    }
    return map
  }

  // Absolute equity values do not depend on today's mcap; pass a positive stand-in
  // when mcap is missing so buildAdvancedProjections still yields rows.
  const mcap = effectiveMarketCap(scenario.mcapOverride, scenario.currentMarketCap)
  const mcapForBuild = mcap != null && mcap > 0 ? mcap : 1
  for (const row of buildAdvancedProjections(
    mcapForBuild,
    scenario.advancedRows ?? [],
    currentYear,
  )) {
    if (row.basis !== basis) continue
    if (row.equityValue > 0) map.set(row.year, row.equityValue)
  }
  return map
}

/** Convert projected equity value → per-share price for this scenario. */
function equityToSharePrice(
  equity: number,
  scenario: SavedScenario,
  fallbackPrice?: number | null,
): number | null {
  if (!(equity > 0)) return null

  const shares = resolveSharesOutstanding({
    sharesOutstanding: scenario.sharesOutstanding,
    marketCap: scenario.currentMarketCap,
    price: scenario.currentPrice ?? fallbackPrice ?? null,
    mcapOverride: scenario.mcapOverride,
  })
  if (shares != null && shares > 0) {
    return impliedSharePrice(equity, shares)
  }

  // No share count: scale live price by equity / current mcap
  // (same as sharesHeld * live * equity/mcap when shares = mcap/price)
  const mcap = effectiveMarketCap(scenario.mcapOverride, scenario.currentMarketCap)
  const live = scenario.currentPrice ?? fallbackPrice ?? null
  if (mcap != null && mcap > 0 && live != null && live > 0) {
    return live * (equity / mcap)
  }
  return null
}

/**
 * Share prices by year from a scenario for a chosen basis (actual years only).
 * @param fallbackPrice optional price (e.g. holding manual) when scenario.currentPrice is null
 */
export function getScenarioSharePriceByYear(
  scenario: SavedScenario,
  basis: ValuationBasis | 'easy',
  currentYear = new Date().getFullYear(),
  fallbackPrice?: number | null,
): Map<number, number> {
  const map = new Map<number, number>()
  const equities = getProjectedEquityByYear(scenario, basis, currentYear)
  for (const [year, equity] of equities) {
    const px = equityToSharePrice(equity, scenario, fallbackPrice)
    if (px != null && px > 0) map.set(year, px)
  }
  return map
}

/**
 * Share prices for a holding: preferred basis first, then any basis that has data.
 * Holdings default to "easy" while many saved scenarios only fill Advanced —
 * without this fallback the portfolio grid stays empty.
 */
export function getHoldingSharePriceByYear(
  holding: PortfolioHolding,
  scenario: SavedScenario,
  currentYear = new Date().getFullYear(),
): Map<number, number> {
  const live = resolveCurrentPrice(holding, scenario)
  const order: Array<ValuationBasis | 'easy'> = [
    holding.basis,
    'easy',
    'ps',
    'pfcf',
    'pe',
  ]
  const seen = new Set<string>()
  for (const basis of order) {
    if (seen.has(basis)) continue
    seen.add(basis)
    const map = getScenarioSharePriceByYear(scenario, basis, currentYear, live)
    if (map.size > 0) return map
  }
  return new Map()
}

/**
 * After the last stated projection year: compound the portfolio total each year
 * and add that year's deposit (including perpetual yearly cash). Both may be on.
 * V_y = V_{y-1} × (1 + r/100) + depositInYear(y)
 */
export function compoundWithGrowthAndDeposits(
  lastTotal: number,
  lastStatedYear: number,
  targetYear: number,
  growthRatePercent: number,
  portfolio: SavedPortfolio,
): number {
  if (targetYear <= lastStatedYear) return lastTotal
  let v = lastTotal
  const r = growthRatePercent / 100
  for (let y = lastStatedYear + 1; y <= targetYear; y++) {
    v = v * (1 + r) + depositInYear(portfolio, y)
  }
  return v
}

/**
 * Position values by calendar year for one holding (year-end style).
 * Uses action-adjusted share counts × price; absolute $ overrides always win.
 * Manual-only holdings (options etc.) skip scenario prices and rely on
 * manualCurrentPrice × qty and yearOverrides.
 *
 * Current calendar year uses the scenario year-end projection when present;
 * otherwise falls back to the live mark. The live Now bar uses
 * {@link holdingLiveValue} instead (never the year-end projection).
 */
export function computeHoldingValues(
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
  actions: PortfolioAction[] = [],
  currentYear = new Date().getFullYear(),
): Map<number, number> {
  const values = new Map<number, number>()
  const actionYears = actions
    .filter((a) => a.holdingId === holding.id && a.year >= currentYear)
    .map((a) => a.year)

  const useScenario = scenario != null && holding.manualOnly !== true
  const priceByYear = useScenario
    ? getHoldingSharePriceByYear(holding, scenario, currentYear)
    : new Map()

  const yearsNeeded = new Set<number>([currentYear, ...actionYears, ...priceByYear.keys()])
  for (const o of holding.yearOverrides) {
    if (o.year >= currentYear) yearsNeeded.add(o.year)
  }

  const isManual = holding.manualOnly === true

  for (const year of yearsNeeded) {
    const sh = sharesAtYear(holding, actions, year)
    // Manual: allow negative qty (shorts). Equity: long-only shares.
    if (isManual ? sh === 0 : sh <= 0) continue

    let px: number | null = null
    if (year < currentYear) {
      // Past years are not projected here (chart uses actuals); keep live if needed
      px = resolveCurrentPrice(holding, useScenario ? scenario : null)
    } else if (useScenario) {
      // Current year and future: prefer stated year-end projection, else live fallback
      const projected = priceByYear.get(year)
      if (projected != null && projected > 0) {
        px = projected
      } else if (year === currentYear) {
        px = resolveCurrentPrice(holding, scenario)
      } else {
        px = tradePriceForYear(holding, scenario, year, currentYear)
      }
    } else {
      // Manual: unit mark for all years unless overridden below
      px = resolveCurrentPrice(holding, null)
    }

    // Manual: any finite mark (incl. 0 / negative). Equity: positive price only.
    if (px != null && Number.isFinite(px) && (isManual || px > 0)) {
      values.set(year, sh * px)
    }
  }

  // Absolute $ overrides win (and work with qty 0 — full position value).
  // Manual positions may set negative total values (liabilities).
  for (const o of holding.yearOverrides) {
    if (
      o.year >= currentYear &&
      Number.isFinite(o.valueDollars) &&
      (isManual || o.valueDollars >= 0)
    ) {
      values.set(o.year, o.valueDollars)
    }
  }

  return values
}

/**
 * Live / Now value for a holding (today's mark × shares as held).
 * Never uses year-end scenario projections for the current calendar year.
 * Pass `actions: []` for the Now bar so planned buy/sells are not applied —
 * only the position as currently held (`sharesHeld` × mark / overrides).
 */
export function holdingLiveValue(
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
  actions: PortfolioAction[] = [],
  currentYear = new Date().getFullYear(),
): number | null {
  const isManual = holding.manualOnly === true
  // Absolute $ override for this year wins (same as year-end grid)
  for (const o of holding.yearOverrides ?? []) {
    if (
      o.year === currentYear &&
      Number.isFinite(o.valueDollars) &&
      (isManual || o.valueDollars >= 0)
    ) {
      return o.valueDollars
    }
  }

  const sh = sharesAtYear(holding, actions, currentYear)
  if (isManual ? sh === 0 : sh <= 0) return null

  const px = resolveCurrentPrice(holding, isManual ? null : scenario)
  if (px != null && Number.isFinite(px) && (isManual || px > 0)) {
    return sh * px
  }
  return null
}

/**
 * Holding dollar value at calendar year Y.
 * Exact projection when present; otherwise carries forward the latest known
 * value at or before Y (matches portfolio grid intermediate columns).
 */
export function holdingValueAtYear(
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
  actions: PortfolioAction[],
  year: number,
  currentYear = new Date().getFullYear(),
): number | null {
  const map = computeHoldingValues(holding, scenario, actions, currentYear)
  const exact = map.get(year)
  if (exact != null && Number.isFinite(exact)) return exact

  let bestY = -Infinity
  let best: number | null = null
  for (const [y, v] of map) {
    if (y <= year && y > bestY && v != null && Number.isFinite(v)) {
      bestY = y
      best = v
    }
  }
  return best
}

/**
 * Portfolio book total in USD at calendar year Y.
 * Single source of truth for Portfolio tab and Overview:
 *  - ≤ last stated year: equity (with carry-forward) + cash
 *  - after last stated + growth: compound last total + yearly deposits
 *  - after last stated, no growth: cash only (equity ends at last stated)
 */
export function portfolioTotalUsdAtYear(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  year: number,
  currentYear = new Date().getFullYear(),
): number {
  const last = lastStatedProjectionYear(portfolio, scenarios, currentYear)
  const rate = getPerpetualGrowthRate(portfolio)
  const actions = getActions(portfolio)
  const byId = new Map(scenarios.map((s) => [s.id, s]))

  const statedAt = (y: number) => {
    let equity = 0
    for (const h of portfolio.holdings) {
      const scenario = h.scenarioId ? (byId.get(h.scenarioId) ?? null) : null
      const v = holdingValueAtYear(h, scenario, actions, y, currentYear)
      if (v != null) equity += v
    }
    return equity + cashAtYear(portfolio, y, scenarios, currentYear)
  }

  if (year <= last) return statedAt(year)
  if (rate !== 0) {
    return compoundWithGrowthAndDeposits(statedAt(last), last, year, rate, portfolio)
  }
  // No growth past last stated: cash continues; equity is not carried past last stated
  return cashAtYear(portfolio, year, scenarios, currentYear)
}

export type BuildPortfolioGridOptions = {
  /**
   * Extend the grid through this calendar year (inclusive).
   * Years after the last stated input use perpetual growth (if set) or cash-only.
   * Default: only years with explicit inputs.
   */
  throughYear?: number
}

export function buildPortfolioGrid(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  currentYear = new Date().getFullYear(),
  options?: BuildPortfolioGridOptions,
): PortfolioGrid {
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const actions = getActions(portfolio)
  const yearSet = new Set<number>([currentYear])

  for (const d of getDeposits(portfolio)) {
    if (d.year >= currentYear) yearSet.add(d.year)
  }
  for (const a of actions) {
    if (a.year >= currentYear) yearSet.add(a.year)
  }

  type Built = {
    holding: PortfolioHolding
    scenario: SavedScenario | null
    values: Map<number, number>
    warning: string | null
  }

  const built: Built[] = portfolio.holdings.map((holding) => {
    let scenario: SavedScenario | null = null
    let warning: string | null = null
    if (holding.scenarioId && !holding.manualOnly) {
      scenario = byId.get(holding.scenarioId) ?? null
      if (!scenario) {
        warning = 'Linked scenario missing — add overrides or re-link'
      } else if (scenario.symbol !== holding.symbol.toUpperCase() && holding.symbol) {
        warning = warning ?? `Scenario is for ${scenario.symbol}`
      }
    }
    const live = holdingLiveValue(holding, scenario, actions, currentYear)
    if (
      live == null &&
      (holding.sharesHeld > 0 ||
        holding.manualOnly ||
        (holding.yearOverrides?.length ?? 0) > 0)
    ) {
      warning =
        warning ??
        (holding.manualOnly
          ? 'Set unit price or a year value for this manual position'
          : 'Set current price (manual or via scenario) to value this holding')
    }

    // Oversell warning (skip for manual — negative qty is intentional)
    if (!holding.manualOnly) {
      const relevantYears = [
        currentYear,
        ...actions.filter((a) => a.holdingId === holding.id).map((a) => a.year),
      ]
      for (const y of relevantYears) {
        if (sharesAtYear(holding, actions, y) < 0) {
          warning = warning ?? `Sells exceed shares by ${y}`
          break
        }
      }
    }

    const values = computeHoldingValues(holding, scenario, actions, currentYear)
    for (const y of values.keys()) yearSet.add(y)
    return { holding, scenario, values, warning }
  })

  // Same last-stated definition as Overview (deposits, actions, holding projections)
  const lastStated = lastStatedProjectionYear(portfolio, scenarios, currentYear)
  // Ensure last stated year is always a column
  yearSet.add(lastStated)

  // Stated years only by default (explicit inputs)
  let years = [...yearSet].sort((a, b) => a - b)
  const growthRate = getPerpetualGrowthRate(portfolio)
  // Optional period extension (picker): fill every calendar year through throughYear
  const through =
    options?.throughYear != null && Number.isFinite(options.throughYear)
      ? Math.floor(options.throughYear)
      : lastStated
  if (through > lastStated) {
    for (let y = lastStated + 1; y <= through; y++) {
      yearSet.add(y)
    }
    years = [...yearSet].sort((a, b) => a - b)
  }

  const equityRows: PortfolioGridRow[] = built.map(({ holding, scenario, warning }) => {
    const endShares = sharesAtYear(holding, actions, lastStated)
    const baseLabel = holdingPositionLabel(holding, scenario)
    const actionNote =
      actions.some((a) => a.holdingId === holding.id) && endShares !== holding.sharesHeld
        ? ` → ${endShares.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh later`
        : ''
    const rowValues = years.map((y) => {
      if (y > lastStated) return null
      return holdingValueAtYear(holding, scenario, actions, y, currentYear)
    })
    return {
      key: holding.id,
      kind: 'equity' as const,
      label: baseLabel + actionNote,
      holdingId: holding.id,
      values: rowValues,
      warning,
    }
  })

  const cashValues = years.map((y) => {
    if (y > lastStated) {
      // After stated years: cash only if no growth (deposits may still accrue).
      // With growth, cash + deposits are folded into the green growth total.
      if (growthRate !== 0) return 0
      return cashAtYear(portfolio, y, scenarios, currentYear)
    }
    return cashAtYear(portfolio, y, scenarios, currentYear)
  })
  const cashNegative = cashValues.some((c) => c < 0)
  const cashRow: PortfolioGridRow = {
    key: 'cash',
    kind: 'cash',
    label: 'Cash',
    values: cashValues,
    warning: cashNegative
      ? 'Cash is negative in one or more years — buys exceed cash + deposits'
      : null,
  }

  // Growth years: same totals as portfolioTotalUsdAtYear (shared with Overview)
  const growthValues = years.map((y) => {
    if (growthRate === 0 || y <= lastStated) return null
    return portfolioTotalUsdAtYear(portfolio, scenarios, y, currentYear)
  })
  const hasGrowthYears = growthValues.some((v) => v != null && v > 0)
  const growthRow: PortfolioGridRow | null =
    hasGrowthYears
      ? {
          key: 'perpetual-growth',
          kind: 'growth',
          label: `Growth ${growthRate}%/yr`,
          values: growthValues,
        }
      : null

  const totals: (number | null)[] = years.map((y) =>
    portfolioTotalUsdAtYear(portfolio, scenarios, y, currentYear),
  )

  const totalRow: PortfolioGridRow = {
    key: 'total',
    kind: 'total',
    label: 'Total',
    values: totals,
  }

  return {
    years,
    rows: [...equityRows, cashRow, ...(growthRow ? [growthRow] : []), totalRow],
    totals,
    lastStatedYear: lastStated,
  }
}

export type PortfolioChartBreakdownRow = {
  key: string
  ticker: string
  /** null for cash */
  shares: number | null
  value: number
  isCash?: boolean
}

export type PortfolioChartPoint = {
  /** Stable category key for the X axis ("now" | "2026" | …) */
  xKey: string
  /** Display label on X axis ("Now" | "2026" | …) */
  yearLabel: string
  /** Calendar year for projection bars; null for the Now bar */
  year: number | null
  /** True for the leading "Now" bar (today's positions) */
  isNow: boolean
  /** True for the current calendar year bar (distinct from Now) */
  isCurrentYear: boolean
  /** True for years with no portfolio projection (keeps time spacing) */
  isEmpty: boolean
  /** True when this bar is perpetual growth (compounded last total + deposits) */
  isPerpetualGrowth: boolean
  /** True when total comes from manual end-of-month actuals (year-end last actual) */
  isActual: boolean
  total: number
  /** Per-holding (+ cash) breakdown for hover table */
  breakdown: PortfolioChartBreakdownRow[]
  [key: string]: number | string | boolean | null | PortfolioChartBreakdownRow[]
}

export const PERPETUAL_GROWTH_CHART_KEY = 'perpetualGrowth'
export const PERPETUAL_GROWTH_COLOR = '#22c55e'
/** Single-series total mode (portfolio value) */
export const PORTFOLIO_TOTAL_CHART_KEY = 'portfolioTotal'
export const PORTFOLIO_TOTAL_COLOR = '#38bdf8'
export const PORTFOLIO_ACTUAL_COLOR = '#f59e0b'

export type PortfolioChartMode = 'stacked' | 'total'

export type BuildPortfolioChartOptions = {
  /** stacked = per position; total = one color whole portfolio */
  mode?: PortfolioChartMode
  /** Inclusive calendar range for year bars (Now sits between past and current year) */
  fromYear?: number
  toYear?: number
  /** FX for converting CHF-denominated actuals to USD book */
  usdToChf?: number | null
}

/**
 * Stacked / total bar chart data, X-axis order:
 *   past years → **Now** (live) → current year → future years
 * - Past years: last actual of that year when present
 * - Now: live equity prices + opening cash
 * - Current/future: projections (stacked or total)
 */
export function buildPortfolioChartData(
  grid: PortfolioGrid,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[] = [],
  currentYear = new Date().getFullYear(),
  options?: BuildPortfolioChartOptions,
): PortfolioChartPoint[] {
  const mode: PortfolioChartMode = options?.mode === 'total' ? 'total' : 'stacked'
  const usdToChf = options?.usdToChf ?? null
  const equityRows = grid.rows.filter((r) => r.kind === 'equity')
  const indexByYear = new Map(grid.years.map((y, i) => [y, i]))
  const byScenarioId = new Map(scenarios.map((s) => [s.id, s]))
  const holdingsById = new Map(portfolio.holdings.map((h) => [h.id, h]))
  const actions = getActions(portfolio)
  const growthRow = grid.rows.find((r) => r.kind === 'growth')
  const cashRow = grid.rows.find((r) => r.kind === 'cash')
  const lastStated = grid.lastStatedYear ?? currentYear

  const hasLive =
    getOpeningCash(portfolio) > 0 ||
    portfolio.holdings.some(
      (h) =>
        h.sharesHeld !== 0 ||
        (h.yearOverrides?.length ?? 0) > 0 ||
        (h.manualCurrentPrice != null &&
          Number.isFinite(h.manualCurrentPrice) &&
          (h.manualOnly === true || h.manualCurrentPrice > 0)),
    ) ||
    Object.keys(getActualsMap(portfolio)).length > 0 ||
    grid.years.length > 0 ||
    (cashRow?.values.some((v) => v != null && v !== 0) ?? false)
  if (!hasLive) return []

  const data: PortfolioChartPoint[] = []

  /** Prefer grid cash (already FX/surplus-resolved) so chart matches the value table. */
  const cashForChartYear = (year: number): number => {
    const i = indexByYear.get(year)
    if (i != null && cashRow) {
      const v = cashRow.values[i]
      if (v != null && Number.isFinite(v)) return v
    }
    return cashAtYear(portfolio, year, scenarios, currentYear)
  }

  // --- Now point (inserted between past and current year) ---
  const nowCash = getOpeningCash(portfolio)
  const nowBreakdown: PortfolioChartBreakdownRow[] = []
  const nowPoint: PortfolioChartPoint = {
    xKey: 'now',
    yearLabel: 'Now',
    year: null,
    isNow: true,
    isCurrentYear: false,
    isEmpty: false,
    isPerpetualGrowth: false,
    isActual: false,
    total: 0,
    cash: mode === 'stacked' ? nowCash : 0,
    breakdown: [],
  }
  let nowTotal = nowCash
  for (const row of equityRows) {
    const holding = row.holdingId ? holdingsById.get(row.holdingId) : null
    const scenario =
      holding && holding.scenarioId && !holding.manualOnly
        ? (byScenarioId.get(holding.scenarioId) ?? null)
        : null
    // Now = positions as held today (no buy/sell actions applied)
    const v =
      holding != null
        ? (holdingLiveValue(holding, scenario, [], currentYear) ?? 0)
        : 0
    const shares = holding ? holding.sharesHeld : 0
    if (mode === 'stacked') nowPoint[row.key] = v
    nowTotal += v
    nowBreakdown.push({
      key: row.key,
      ticker: holding ? holdingDisplayName(holding) : row.label || '—',
      shares: holding?.manualOnly ? null : shares,
      value: v,
    })
  }
  if (nowCash !== 0) {
    nowBreakdown.push({
      key: 'cash',
      ticker: 'Cash',
      shares: null,
      value: nowCash,
      isCash: true,
    })
  }
  nowPoint.total = nowTotal
  if (mode === 'total') {
    nowPoint[PORTFOLIO_TOTAL_CHART_KEY] = nowTotal
  }
  nowPoint.breakdown = nowBreakdown

  // Year axis: period range, grid years, and actual years when in total mode
  const gridYears = grid.years.filter((y) => Number.isFinite(y))
  const defaultFrom =
    options?.fromYear ??
    (gridYears.length ? Math.min(...gridYears) : currentYear)
  const defaultTo =
    options?.toYear ??
    (gridYears.length ? Math.max(...gridYears) : currentYear)
  let fromY = Math.floor(options?.fromYear ?? defaultFrom)
  let toY = Math.floor(options?.toYear ?? defaultTo)
  if (mode === 'total') {
    const earliest = earliestActualYear(portfolio, fromY)
    if (earliest < fromY && options?.fromYear == null) fromY = earliest
  }
  if (toY < fromY) {
    const t = fromY
    fromY = toY
    toY = t
  }

  let nowInserted = false
  const insertNowIfNeeded = (year: number) => {
    // Place Now immediately before the current calendar year bar
    if (!nowInserted && year >= currentYear) {
      data.push(nowPoint)
      nowInserted = true
    }
  }

  for (let year = fromY; year <= toY; year++) {
    insertNowIfNeeded(year)
    const i = indexByYear.get(year)
    const isGrowthYear =
      i != null &&
      growthRow != null &&
      year > lastStated &&
      (growthRow.values[i] ?? 0) != null &&
      (growthRow.values[i] ?? 0) > 0

    // Past years: prefer year-end actual in total mode
    if (year < currentYear) {
      const actual = yearEndActualUsd(portfolio, year, usdToChf)
      if (actual == null) {
        // Skip empty past years in stacked mode; keep gap only if inside continuous range for total
        if (mode === 'stacked') continue
        // total mode: skip years with no actual
        continue
      }
      const point: PortfolioChartPoint = {
        xKey: String(year),
        yearLabel: String(year),
        year,
        isNow: false,
        isCurrentYear: false,
        isEmpty: false,
        isPerpetualGrowth: false,
        isActual: true,
        total: actual,
        cash: 0,
        breakdown: [
          {
            key: 'actual',
            ticker: 'Actual (year-end)',
            shares: null,
            value: actual,
          },
        ],
      }
      if (mode === 'total') {
        point[PORTFOLIO_TOTAL_CHART_KEY] = actual
      } else {
        // stacked: show as single cash-like total under portfolio total key for simplicity
        point[PORTFOLIO_TOTAL_CHART_KEY] = actual
      }
      data.push(point)
      continue
    }

    // Current / future years — projections
    if (i == null && !isGrowthYear) {
      // Year not on grid: still show total projection if we can compute
      if (mode === 'total') {
        const t = portfolioTotalUsdAtYear(portfolio, scenarios, year, currentYear)
        data.push({
          xKey: String(year),
          yearLabel: String(year),
          year,
          isNow: false,
          isCurrentYear: year === currentYear,
          isEmpty: t === 0,
          isPerpetualGrowth: year > lastStated && getPerpetualGrowthRate(portfolio) !== 0,
          isActual: false,
          total: t,
          cash: 0,
          [PORTFOLIO_TOTAL_CHART_KEY]: t,
          breakdown: [
            {
              key: PORTFOLIO_TOTAL_CHART_KEY,
              ticker: 'Portfolio',
              shares: null,
              value: t,
            },
          ],
        })
      }
      continue
    }

    if (i == null) continue

    if (mode === 'total') {
      const t = portfolioTotalUsdAtYear(portfolio, scenarios, year, currentYear)
      const isGrowth =
        year > lastStated && getPerpetualGrowthRate(portfolio) !== 0
      data.push({
        xKey: String(year),
        yearLabel: String(year),
        year,
        isNow: false,
        isCurrentYear: year === currentYear,
        isEmpty: false,
        isPerpetualGrowth: isGrowth,
        isActual: false,
        total: t,
        cash: 0,
        [PORTFOLIO_TOTAL_CHART_KEY]: t,
        breakdown: [
          {
            key: isGrowth ? PERPETUAL_GROWTH_CHART_KEY : PORTFOLIO_TOTAL_CHART_KEY,
            ticker: isGrowth ? 'Growth' : 'Portfolio',
            shares: null,
            value: t,
          },
        ],
      })
      continue
    }

    // stacked mode — cash from grid when present (same numbers as the table)
    const cash = !isGrowthYear ? cashForChartYear(year) : 0
    const breakdown: PortfolioChartBreakdownRow[] = []
    const point: PortfolioChartPoint = {
      xKey: String(year),
      yearLabel: String(year),
      year,
      isNow: false,
      isCurrentYear: year === currentYear,
      isEmpty: false,
      isPerpetualGrowth: !!isGrowthYear,
      isActual: false,
      total: 0,
      cash,
      breakdown: [],
    }

    if (isGrowthYear) {
      const g = growthRow!.values[i] ?? 0
      point[PERPETUAL_GROWTH_CHART_KEY] = g
      point.total = typeof g === 'number' ? g : 0
      breakdown.push({
        key: PERPETUAL_GROWTH_CHART_KEY,
        ticker: growthRow!.label || 'Growth',
        shares: null,
        value: point.total,
      })
      for (const row of equityRows) {
        point[row.key] = 0
      }
      point.cash = 0
    } else {
      for (const row of equityRows) {
        const holding = row.holdingId ? holdingsById.get(row.holdingId) : null
        const v = row.values[i] ?? 0
        const rawShares = holding ? sharesAtYear(holding, actions, year) : 0
        const shares = Math.max(0, rawShares)
        point[row.key] = v
        breakdown.push({
          key: row.key,
          ticker: holding?.symbol || row.label || '—',
          shares,
          value: typeof v === 'number' ? v : 0,
        })
      }
      let t = typeof cash === 'number' ? cash : 0
      for (const row of equityRows) {
        const v = point[row.key]
        if (typeof v === 'number') t += v
      }
      point.total = t
      if (cash !== 0) {
        breakdown.push({
          key: 'cash',
          ticker: 'Cash',
          shares: null,
          value: cash,
          isCash: true,
        })
      }
      point[PERPETUAL_GROWTH_CHART_KEY] = 0
    }
    point.breakdown = breakdown
    data.push(point)
  }

  // Range was only past years (or empty future): still show Now after them
  if (!nowInserted) data.push(nowPoint)

  // Recharts stacked bars break (blank chart) when stack keys are missing/NaN on some points.
  // Always zero-fill every series key used by PortfolioChart.
  const equityKeys = equityRows.map((r) => r.key)
  for (const p of data) {
    if (mode === 'stacked') {
      for (const k of equityKeys) {
        const v = p[k]
        p[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0
      }
      p.cash =
        typeof p.cash === 'number' && Number.isFinite(p.cash) ? p.cash : 0
      const g = p[PERPETUAL_GROWTH_CHART_KEY]
      p[PERPETUAL_GROWTH_CHART_KEY] =
        typeof g === 'number' && Number.isFinite(g) ? g : 0
      const t = p[PORTFOLIO_TOTAL_CHART_KEY]
      p[PORTFOLIO_TOTAL_CHART_KEY] =
        typeof t === 'number' && Number.isFinite(t) ? t : 0
    } else {
      const t = p[PORTFOLIO_TOTAL_CHART_KEY]
      const totalNum = typeof p.total === 'number' && Number.isFinite(p.total) ? p.total : 0
      p[PORTFOLIO_TOTAL_CHART_KEY] =
        typeof t === 'number' && Number.isFinite(t) ? t : totalNum
    }
    if (typeof p.total !== 'number' || !Number.isFinite(p.total)) {
      p.total = 0
    }
  }

  return data
}

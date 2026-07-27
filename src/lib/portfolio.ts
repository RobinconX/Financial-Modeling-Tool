import type {
  CashflowLine,
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
 * Surplus mode: max(0, scenario net yearly CHF) × percent / 100, converted to USD.
 * Does not mutate Income/Cost data.
 */
export function resolveDepositAmount(
  d: PortfolioDeposit,
  ctx?: DepositResolveContext | null,
): number {
  const source: PortfolioDepositSource = d.source === 'surplus' ? 'surplus' : 'fixed'
  if (source !== 'surplus') {
    return Number.isFinite(d.amount) && d.amount > 0 ? d.amount : 0
  }
  if (!ctx?.incomeCostLines || !d.surplusScenarioId) {
    return Number.isFinite(d.amount) && d.amount > 0 ? d.amount : 0
  }
  const netChf = scenarioTotals(ctx.incomeCostLines, d.surplusScenarioId).netYearly
  const surplusChf = Math.max(0, netChf)
  const pct = Number.isFinite(d.surplusPercent) ? Math.max(0, d.surplusPercent!) : 0
  const chf = surplusChf * (pct / 100)
  if (ctx.usdToChf != null && ctx.usdToChf > 0) {
    return chf / ctx.usdToChf
  }
  // No FX: cannot convert CHF→USD reliably; fall back to stored amount
  return Number.isFinite(d.amount) && d.amount > 0 ? d.amount : 0
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
      source: p.source,
      surplusScenarioId: p.surplusScenarioId,
      surplusPercent: p.surplusPercent,
    },
    ctx,
  )
}

/** Portfolio copy with deposit (and perpetual) amounts resolved for cash math / charts. */
export function withResolvedDepositAmounts(
  portfolio: SavedPortfolio,
  ctx?: DepositResolveContext | null,
): SavedPortfolio {
  const deposits = getDeposits(portfolio)
  const hasSurplusDeposit = deposits.some((d) => d.source === 'surplus')
  const hasSurplusPerpetual = portfolio.perpetualYearlyDeposit?.source === 'surplus'
  if (!hasSurplusDeposit && !hasSurplusPerpetual && !portfolio.perpetualYearlyDeposit) {
    return portfolio
  }
  const next: SavedPortfolio = {
    ...portfolio,
    deposits: hasSurplusDeposit
      ? deposits.map((d) => ({
          ...d,
          amount: resolveDepositAmount(d, ctx),
        }))
      : deposits,
  }
  if (portfolio.perpetualYearlyDeposit) {
    const p = portfolio.perpetualYearlyDeposit
    next.perpetualYearlyDeposit = {
      ...p,
      // Store resolved USD in amount for cashFromDeposits (display uses original via UI)
      amount: resolvePerpetualYearlyAmount(p, ctx),
      // Keep source as fixed after resolve so amount is used as-is
      source: 'fixed',
    }
  }
  return next
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
    sharesHeld: 0,
    scenarioId: null,
    basis: 'easy',
    yearOverrides: [],
    manualCurrentPrice: null,
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
      sharesHeld: h.sharesHeld,
      scenarioId: h.scenarioId,
      basis: h.basis,
      yearOverrides: (h.yearOverrides ?? []).map((o) => ({
        year: o.year,
        valueDollars: o.valueDollars,
      })),
      manualCurrentPrice: h.manualCurrentPrice,
    }
  })

  const deposits = (source.deposits ?? []).map((d) => {
    const next: PortfolioDeposit = {
      id: crypto.randomUUID(),
      year: d.year,
      amount: d.amount,
    }
    if (d.isOpening) next.isOpening = true
    if (d.source === 'surplus') {
      next.source = 'surplus'
      next.surplusScenarioId = d.surplusScenarioId ?? null
      next.surplusPercent = d.surplusPercent ?? 0
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
  if (holding.manualCurrentPrice != null && holding.manualCurrentPrice > 0) {
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
 * Call with withResolvedDepositAmounts() first when surplus sources are used.
 */
export function cashFromDeposits(portfolio: SavedPortfolio, year: number): number {
  const deposits = getDeposits(portfolio)
  const hasOpening = deposits.some((d) => d.isOpening)
  // Legacy: currentCash not yet folded into deposits
  let sum = hasOpening ? 0 : getOpeningCash(portfolio)
  for (const d of deposits) {
    if (d.year <= year && d.amount > 0) sum += d.amount
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
export function depositInYear(portfolio: SavedPortfolio, year: number): number {
  const explicit = getDeposits(portfolio)
    .filter((d) => d.year === year && !d.isOpening)
    .reduce((s, d) => s + d.amount, 0)
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
 * Cash at year Y including deposits and buy/sell cash flows.
 * May be negative (allowed; UI should warn).
 */
export function cashAtYear(
  portfolio: SavedPortfolio,
  year: number,
  scenarios: SavedScenario[] = [],
  currentYear = new Date().getFullYear(),
): number {
  let sum = cashFromDeposits(portfolio, year)
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const holdingsById = new Map(portfolio.holdings.map((h) => [h.id, h]))

  for (const a of getActions(portfolio)) {
    if (a.year > year || !(a.shares > 0)) continue
    const holding = holdingsById.get(a.holdingId)
    if (!holding) continue
    const scenario = holding.scenarioId ? (byId.get(holding.scenarioId) ?? null) : null
    const px = tradePriceForYear(holding, scenario, a.year, currentYear)
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

/** Human-readable row label for a holding (always derived fresh from scenario). */
export function holdingPositionLabel(
  holding: PortfolioHolding,
  scenario: SavedScenario | null,
): string {
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

  return [symbol, company, scenarioLabel, shareLabel].filter(Boolean).join(' · ')
}

/**
 * Projected shareholder equity value (post-dilution) by calendar year for a basis.
 * Easy: projected mcap rows. Advanced: PS / PFCF / PE implied mcap / dilution.
 * Does not require current mcap for easy rows (Saved tab can show mcap-only inputs).
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
      if (!Number.isFinite(year) || year <= currentYear) continue
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
 * Position values by year for one holding.
 * Uses action-adjusted share counts × price; optional absolute $ overrides win.
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

  const priceByYear =
    scenario != null ? getHoldingSharePriceByYear(holding, scenario, currentYear) : new Map()

  const yearsNeeded = new Set<number>([currentYear, ...actionYears, ...priceByYear.keys()])
  for (const o of holding.yearOverrides) {
    if (o.year >= currentYear) yearsNeeded.add(o.year)
  }

  for (const year of yearsNeeded) {
    const sh = sharesAtYear(holding, actions, year)
    if (sh <= 0) continue
    const px =
      year <= currentYear
        ? resolveCurrentPrice(holding, scenario)
        : (priceByYear.get(year) ?? tradePriceForYear(holding, scenario, year, currentYear))
    if (px != null && px > 0) {
      values.set(year, sh * px)
    }
  }

  // Manual overrides win
  for (const o of holding.yearOverrides) {
    if (o.year >= currentYear && o.valueDollars >= 0 && Number.isFinite(o.valueDollars)) {
      values.set(o.year, o.valueDollars)
    }
  }

  return values
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
    if (holding.scenarioId) {
      scenario = byId.get(holding.scenarioId) ?? null
      if (!scenario) {
        warning = 'Linked scenario missing — add overrides or re-link'
      } else if (scenario.symbol !== holding.symbol.toUpperCase() && holding.symbol) {
        warning = warning ?? `Scenario is for ${scenario.symbol}`
      }
    }
    const price = resolveCurrentPrice(holding, scenario)
    if (holding.sharesHeld > 0 && (price == null || price <= 0)) {
      warning = warning ?? 'Set current price (manual or via scenario) to value this holding'
    }

    // Oversell warning
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
  total: number
  /** Per-holding (+ cash) breakdown for hover table */
  breakdown: PortfolioChartBreakdownRow[]
  [key: string]: number | string | boolean | null | PortfolioChartBreakdownRow[]
}

export const PERPETUAL_GROWTH_CHART_KEY = 'perpetualGrowth'
export const PERPETUAL_GROWTH_COLOR = '#22c55e'

/**
 * Stacked bar chart data:
 * 1. First bar = **Now** (live equity prices + current cash only — no year deposits)
 * 2. Then calendar years from current year → max projection year
 *    Current year is a separate bar from Now (e.g. includes deposits through that year).
 */
export function buildPortfolioChartData(
  grid: PortfolioGrid,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[] = [],
  currentYear = new Date().getFullYear(),
): PortfolioChartPoint[] {
  if (grid.years.length === 0 && getCurrentCash(portfolio) <= 0) return []

  const equityRows = grid.rows.filter((r) => r.kind === 'equity')
  const indexByYear = new Map(grid.years.map((y, i) => [y, i]))
  const byScenarioId = new Map(scenarios.map((s) => [s.id, s]))
  const holdingsById = new Map(portfolio.holdings.map((h) => [h.id, h]))

  const data: PortfolioChartPoint[] = []
  const actions = getActions(portfolio)

  // --- Now: base shares only + opening cash (no planned deposits / actions) ---
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
    total: 0,
    cash: nowCash,
    breakdown: [],
  }
  let nowTotal = nowCash
  for (const row of equityRows) {
    const holding = row.holdingId ? holdingsById.get(row.holdingId) : null
    let v = 0
    const shares = holding?.sharesHeld ?? 0
    if (holding && shares > 0) {
      const scenario = holding.scenarioId
        ? (byScenarioId.get(holding.scenarioId) ?? null)
        : null
      const px = resolveCurrentPrice(holding, scenario)
      if (px != null && px > 0) v = shares * px
    }
    nowPoint[row.key] = v
    nowTotal += v
    nowBreakdown.push({
      key: row.key,
      ticker: holding?.symbol || row.label || '—',
      shares,
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
  nowPoint.breakdown = nowBreakdown
  data.push(nowPoint)

  const growthRow = grid.rows.find((r) => r.kind === 'growth')
  const lastStated = grid.lastStatedYear ?? currentYear

  // Only years present on the grid (input years, or extended by period picker)
  for (const year of grid.years) {
    if (year < currentYear) continue
    const i = indexByYear.get(year)
    if (i == null) continue
    const isGrowthYear =
      growthRow != null && year > lastStated && (growthRow.values[i] ?? 0) != null && (growthRow.values[i] ?? 0) > 0

    const cash = !isGrowthYear ? cashAtYear(portfolio, year, scenarios, currentYear) : 0
    const breakdown: PortfolioChartBreakdownRow[] = []
    const point: PortfolioChartPoint = {
      xKey: String(year),
      yearLabel: String(year),
      year,
      isNow: false,
      isCurrentYear: year === currentYear,
      isEmpty: false,
      isPerpetualGrowth: !!isGrowthYear,
      total: 0,
      cash,
      breakdown: [],
    }

    if (isGrowthYear) {
      const g = growthRow!.values[i] ?? 0
      point[PERPETUAL_GROWTH_CHART_KEY] = g
      point.total = g
      breakdown.push({
        key: PERPETUAL_GROWTH_CHART_KEY,
        ticker: growthRow!.label || 'Growth',
        shares: null,
        value: g,
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

  return data
}

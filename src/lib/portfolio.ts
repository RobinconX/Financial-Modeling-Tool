import type {
  PortfolioAction,
  PortfolioDeposit,
  PortfolioGrid,
  PortfolioGridRow,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
  ValuationBasis,
} from '../types'
import { effectiveMarketCap, impliedSharePrice } from './sharePrice'
import {
  buildAdvancedProjections,
  buildEasyProjections,
} from './valuation'

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

  const deposits = (source.deposits ?? []).map((d) => ({
    id: crypto.randomUUID(),
    year: d.year,
    amount: d.amount,
    ...(d.isOpening ? { isOpening: true as const } : {}),
  }))

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
    actions,
    holdings,
    createdAt: now,
    updatedAt: now,
  })
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
 *   sum of deposits with year <= Y (opening cash is a deposit).
 */
export function cashFromDeposits(portfolio: SavedPortfolio, year: number): number {
  const deposits = getDeposits(portfolio)
  const hasOpening = deposits.some((d) => d.isOpening)
  // Legacy: currentCash not yet folded into deposits
  let sum = hasOpening ? 0 : getOpeningCash(portfolio)
  for (const d of deposits) {
    if (d.year <= year && d.amount > 0) sum += d.amount
  }
  return sum
}

/** @deprecated use cashForYear with portfolio actions — alias for deposit-only cash */
export function cashForYear(portfolio: SavedPortfolio, year: number): number {
  return cashAtYear(portfolio, year)
}

/** Non-opening deposit amount scheduled in a specific year (not cumulative). */
export function depositInYear(portfolio: SavedPortfolio, year: number): number {
  return getDeposits(portfolio)
    .filter((d) => d.year === year && !d.isOpening)
    .reduce((s, d) => s + d.amount, 0)
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
    const map = getScenarioSharePriceByYear(scenario, holding.basis, currentYear)
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

/** Share prices by year from a scenario for a chosen basis (actual years only). */
export function getScenarioSharePriceByYear(
  scenario: SavedScenario,
  basis: ValuationBasis | 'easy',
  currentYear = new Date().getFullYear(),
): Map<number, number> {
  const map = new Map<number, number>()
  const mcap = effectiveMarketCap(scenario.mcapOverride, scenario.currentMarketCap)
  if (mcap == null || mcap <= 0) return map

  const shares = scenario.sharesOutstanding
  if (shares == null || shares <= 0) return map

  if (basis === 'easy') {
    for (const row of buildEasyProjections(mcap, scenario.easyRows, currentYear)) {
      const px = impliedSharePrice(row.equityValue, shares)
      if (px != null) map.set(row.year, px)
    }
    return map
  }

  for (const row of buildAdvancedProjections(mcap, scenario.advancedRows, currentYear)) {
    if (row.basis !== basis) continue
    const px = impliedSharePrice(row.equityValue, shares)
    if (px != null) map.set(row.year, px)
  }
  return map
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

  const yearsNeeded = new Set<number>([currentYear, ...actionYears])
  if (scenario) {
    for (const y of getScenarioSharePriceByYear(scenario, holding.basis, currentYear).keys()) {
      yearsNeeded.add(y)
    }
  }
  for (const o of holding.yearOverrides) {
    if (o.year >= currentYear) yearsNeeded.add(o.year)
  }

  for (const year of yearsNeeded) {
    const sh = sharesAtYear(holding, actions, year)
    if (sh <= 0) continue
    const px =
      year <= currentYear
        ? resolveCurrentPrice(holding, scenario)
        : tradePriceForYear(holding, scenario, year, currentYear)
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

export function buildPortfolioGrid(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  currentYear = new Date().getFullYear(),
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

  const years = [...yearSet].sort((a, b) => a - b)

  const equityRows: PortfolioGridRow[] = built.map(({ holding, scenario, values, warning }) => {
    const endShares = sharesAtYear(holding, actions, years[years.length - 1] ?? currentYear)
    const baseLabel = holdingPositionLabel(holding, scenario)
    const actionNote =
      actions.some((a) => a.holdingId === holding.id) && endShares !== holding.sharesHeld
        ? ` → ${endShares.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh later`
        : ''
    return {
      key: holding.id,
      kind: 'equity' as const,
      label: baseLabel + actionNote,
      holdingId: holding.id,
      values: years.map((y) => {
        const v = values.get(y)
        return v != null && Number.isFinite(v) ? v : null
      }),
      warning,
    }
  })

  const cashValues = years.map((y) => cashAtYear(portfolio, y, scenarios, currentYear))
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

  const totals: (number | null)[] = years.map((_, i) => {
    let sum = cashValues[i] ?? 0
    for (const row of equityRows) {
      const v = row.values[i]
      if (v != null) sum += v
    }
    return sum
  })

  const totalRow: PortfolioGridRow = {
    key: 'total',
    kind: 'total',
    label: 'Total',
    values: totals,
  }

  return {
    years,
    rows: [...equityRows, cashRow, totalRow],
    totals,
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
  total: number
  /** Per-holding (+ cash) breakdown for hover table */
  breakdown: PortfolioChartBreakdownRow[]
  [key: string]: number | string | boolean | null | PortfolioChartBreakdownRow[]
}

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

  const maxYear = Math.max(currentYear, ...(grid.years.length ? grid.years : [currentYear]))
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

  // --- Calendar years (current year first, then future; empty slots keep spacing) ---
  for (let year = currentYear; year <= maxYear; year++) {
    const i = indexByYear.get(year)
    const hasGridYear = i != null
    const cash = hasGridYear ? cashAtYear(portfolio, year, scenarios, currentYear) : 0
    const breakdown: PortfolioChartBreakdownRow[] = []
    const point: PortfolioChartPoint = {
      xKey: String(year),
      yearLabel: String(year),
      year,
      isNow: false,
      isCurrentYear: year === currentYear,
      isEmpty: !hasGridYear,
      total: 0,
      cash,
      breakdown: [],
    }
    for (const row of equityRows) {
      const holding = row.holdingId ? holdingsById.get(row.holdingId) : null
      const v = hasGridYear ? (row.values[i!] ?? 0) : 0
      const rawShares = holding ? sharesAtYear(holding, actions, year) : 0
      const shares = hasGridYear ? Math.max(0, rawShares) : 0
      point[row.key] = v
      breakdown.push({
        key: row.key,
        ticker: holding?.symbol || row.label || '—',
        shares,
        value: typeof v === 'number' ? v : 0,
      })
    }
    if (hasGridYear) {
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
    }
    point.breakdown = breakdown
    data.push(point)
  }

  return data
}

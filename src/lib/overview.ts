import type {
  CashflowLine,
  OverviewScenario,
  OverviewSeries,
  OverviewSeriesType,
  OverviewState,
  SavedPortfolio,
  SavedScenario,
  SavingsAccount,
} from '../types'
import { toDisplay } from './fx'
import {
  balanceNow,
  latestActual,
  makePeriodKey,
  monthsBetween,
  currentPeriodKey,
  simulateMonths,
} from './savings'
import {
  cashAtYear,
  computeHoldingValues,
  getActions,
  holdingPositionLabel,
  withResolvedDepositAmounts,
  type DepositResolveContext,
} from './portfolio'

export const OVERVIEW_CURRENCY = 'CHF' as const
export const OVERVIEW_DEFAULT_HORIZON_YEARS = 10
export const OVERVIEW_MAX_HORIZON_YEARS = 40

export type OverviewYearKind = 'actual' | 'projected'

export type OverviewChartRow = {
  year: number
  label: string
  kind: OverviewYearKind
  total: number
  [seriesId: string]: number | string
}

export type OverviewBuildDeps = {
  portfolios: SavedPortfolio[]
  stockScenarios: SavedScenario[]
  savingsAccounts: SavingsAccount[]
  incomeCostLines: CashflowLine[]
  usdToChf: number | null
  asOf?: Date
}

export function newOverviewScenario(
  name: string,
  sortOrder: number,
  asOf: Date = new Date(),
  series: OverviewSeries[] = [],
): OverviewScenario {
  const y = asOf.getFullYear()
  const range = clampOverviewRange(y, y + OVERVIEW_DEFAULT_HORIZON_YEARS, asOf)
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Base',
    sortOrder,
    startYear: range.startYear,
    endYear: range.endYear,
    series,
  }
}

export function defaultOverviewState(asOf: Date = new Date()): OverviewState {
  const base = newOverviewScenario('Base', 0, asOf)
  return {
    version: 2,
    scenarios: [base],
    selectedScenarioId: base.id,
  }
}

export function newOverviewSeries(
  partial: Omit<OverviewSeries, 'id' | 'sortOrder' | 'enabled'> &
    Partial<Pick<OverviewSeries, 'enabled' | 'sortOrder'>>,
  sortOrder: number,
): OverviewSeries {
  return {
    id: crypto.randomUUID(),
    enabled: partial.enabled ?? true,
    sortOrder,
    name: partial.name,
    type: partial.type,
    color: partial.color ?? null,
    portfolioId: partial.portfolioId ?? null,
    savingsAccountId: partial.savingsAccountId ?? null,
    baseChf: partial.baseChf ?? 0,
    annualRatePercent: partial.annualRatePercent ?? 0,
    baseYear: partial.baseYear ?? new Date().getFullYear(),
  }
}

/** Normalize #rgb / #rrggbb; return null if invalid. */
export function normalizeHexColor(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = raw.trim()
  if (!s) return null
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(s)
  if (m3) {
    const [r, g, b] = m3[1]!.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(s)
  if (m6) return `#${m6[1]!.toLowerCase()}`
  return null
}

export function sortedOverviewScenarios(scenarios: OverviewScenario[]): OverviewScenario[] {
  return [...scenarios].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export function cloneSeriesList(series: OverviewSeries[]): OverviewSeries[] {
  return series.map((s, i) => ({
    ...s,
    id: crypto.randomUUID(),
    sortOrder: i,
  }))
}

/** Portfolio = greens, savings = blues, manual = ambers/violets. */
const PORTFOLIO_SHADES = [
  '#34d399',
  '#10b981',
  '#059669',
  '#6ee7b7',
  '#a7f3d0',
  '#047857',
  '#22c55e',
  '#86efac',
]
const SAVINGS_SHADES = [
  '#38bdf8',
  '#0ea5e9',
  '#0284c7',
  '#7dd3fc',
  '#bae6fd',
  '#0369a1',
  '#60a5fa',
  '#93c5fd',
]
const MANUAL_SHADES = [
  '#fbbf24',
  '#f59e0b',
  '#d97706',
  '#fcd34d',
  '#a78bfa',
  '#8b5cf6',
  '#c4b5fd',
  '#e9d5ff',
]

export function shadesForType(type: OverviewSeriesType): string[] {
  if (type === 'portfolio') return PORTFOLIO_SHADES
  if (type === 'savings') return SAVINGS_SHADES
  return MANUAL_SHADES
}

/**
 * Assign colors: custom `series.color` wins; else shade by origin type.
 */
export function assignOverviewSeriesColors(series: OverviewSeries[]): Map<string, string> {
  const ordered = [...series].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const counters: Record<OverviewSeriesType, number> = {
    portfolio: 0,
    savings: 0,
    manual: 0,
  }
  const map = new Map<string, string>()
  for (const s of ordered) {
    const custom = normalizeHexColor(s.color)
    if (custom) {
      map.set(s.id, custom)
      continue
    }
    const shades = shadesForType(s.type)
    const i = counters[s.type] % shades.length
    counters[s.type] += 1
    map.set(s.id, shades[i]!)
  }
  return map
}

export type PortfolioBreakdownLine = {
  label: string
  kind: 'equity' | 'cash'
  valueChf: number
}

/**
 * Holdings + cash for a portfolio series at calendar year Y (CHF), for tooltips.
 */
export function portfolioBreakdownChfAtYear(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): PortfolioBreakdownLine[] {
  if (series.type !== 'portfolio' || !series.portfolioId) return []
  const p = deps.portfolios.find((x) => x.id === series.portfolioId)
  if (!p) return []
  if (deps.usdToChf == null || deps.usdToChf <= 0) return []

  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()
  const depositCtx: DepositResolveContext = {
    incomeCostLines: deps.incomeCostLines,
    usdToChf: deps.usdToChf,
  }
  const resolved = withResolvedDepositAmounts(p, depositCtx)
  const actions = getActions(resolved)
  const lines: PortfolioBreakdownLine[] = []

  for (const h of resolved.holdings) {
    const scenario = h.scenarioId
      ? (deps.stockScenarios.find((s) => s.id === h.scenarioId) ?? null)
      : null
    const map = computeHoldingValues(h, scenario, actions, currentYear)
    const usd = map.get(year)
    if (usd == null || !Number.isFinite(usd) || usd === 0) continue
    lines.push({
      label: holdingPositionLabel(h, scenario),
      kind: 'equity',
      valueChf: toDisplay(usd, 'CHF', deps.usdToChf),
    })
  }

  const cashUsd = cashAtYear(resolved, year, deps.stockScenarios, currentYear)
  if (Number.isFinite(cashUsd) && cashUsd !== 0) {
    lines.push({
      label: 'Cash',
      kind: 'cash',
      valueChf: toDisplay(cashUsd, 'CHF', deps.usdToChf),
    })
  }

  return lines
}

export function clampOverviewRange(
  startYear: number,
  endYear: number,
  asOf: Date = new Date(),
): { startYear: number; endYear: number } {
  const cy = asOf.getFullYear()
  let start = Math.floor(startYear)
  let end = Math.floor(endYear)
  if (!Number.isFinite(start)) start = cy
  if (!Number.isFinite(end)) end = cy + OVERVIEW_DEFAULT_HORIZON_YEARS
  const minY = cy - 20
  const maxY = cy + OVERVIEW_MAX_HORIZON_YEARS
  start = Math.min(Math.max(start, minY), maxY)
  end = Math.min(Math.max(end, minY), maxY)
  if (end < start) end = start
  return { startYear: start, endYear: end }
}

export function yearsInRange(startYear: number, endYear: number): number[] {
  const { startYear: s, endYear: e } = clampOverviewRange(startYear, endYear)
  const out: number[] = []
  for (let y = s; y <= e; y++) out.push(y)
  return out
}

export function yearKind(year: number, asOf: Date = new Date()): OverviewYearKind {
  return year <= asOf.getFullYear() ? 'actual' : 'projected'
}

/** Manual series: compound once per year after baseYear. */
export function manualValueAtYear(
  baseChf: number,
  annualRatePercent: number,
  baseYear: number,
  year: number,
): number {
  const base = Number.isFinite(baseChf) ? Math.max(0, baseChf) : 0
  const rate = Number.isFinite(annualRatePercent) ? annualRatePercent : 0
  const by = Number.isFinite(baseYear) ? Math.floor(baseYear) : year
  const steps = Math.max(0, year - by)
  return base * (1 + rate / 100) ** steps
}

/**
 * Savings account CHF balance for calendar year Y (end-of-year style).
 * Past: latest actual ≤ Dec Y. Current year: balance now. Future: sim to Dec Y.
 */
export function savingsValueAtYear(
  account: SavingsAccount,
  year: number,
  asOf: Date = new Date(),
): number {
  const nowYear = asOf.getFullYear()
  const nowKey = currentPeriodKey(asOf)

  if (year < nowYear) {
    const decKey = makePeriodKey(year, 12)
    return latestActual(account, decKey)
  }
  if (year === nowYear) {
    return balanceNow(account, asOf)
  }

  const targetKey = makePeriodKey(year, 12)
  const months = monthsBetween(nowKey, targetKey)
  if (months <= 0) return balanceNow(account, asOf)
  const sim = simulateMonths(account, asOf, months)
  return sim.get(targetKey) ?? 0
}

/**
 * Whole portfolio total in USD for calendar year Y
 * (equity + cash after deposits/actions), deposits surplus-resolved.
 */
export function portfolioTotalUsdAtYear(
  portfolio: SavedPortfolio,
  stockScenarios: SavedScenario[],
  year: number,
  depositCtx: DepositResolveContext | null,
  currentYear = new Date().getFullYear(),
): number {
  const resolved = withResolvedDepositAmounts(portfolio, depositCtx)
  const actions = getActions(resolved)
  let equity = 0
  for (const h of resolved.holdings) {
    const scenario = h.scenarioId
      ? (stockScenarios.find((s) => s.id === h.scenarioId) ?? null)
      : null
    const map = computeHoldingValues(h, scenario, actions, currentYear)
    const v = map.get(year)
    if (v != null && Number.isFinite(v)) equity += v
  }
  const cash = cashAtYear(resolved, year, stockScenarios, currentYear)
  return equity + cash
}

export function seriesValueChf(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): number {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()

  if (series.type === 'manual') {
    return manualValueAtYear(
      series.baseChf ?? 0,
      series.annualRatePercent ?? 0,
      series.baseYear ?? currentYear,
      year,
    )
  }

  if (series.type === 'savings') {
    const acc = deps.savingsAccounts.find((a) => a.id === series.savingsAccountId)
    if (!acc) return 0
    return savingsValueAtYear(acc, year, asOf)
  }

  if (series.type === 'portfolio') {
    const p = deps.portfolios.find((x) => x.id === series.portfolioId)
    if (!p) return 0
    const depositCtx: DepositResolveContext = {
      incomeCostLines: deps.incomeCostLines,
      usdToChf: deps.usdToChf,
    }
    const usd = portfolioTotalUsdAtYear(
      p,
      deps.stockScenarios,
      year,
      depositCtx,
      currentYear,
    )
    if (deps.usdToChf == null || deps.usdToChf <= 0) return 0
    return toDisplay(usd, 'CHF', deps.usdToChf)
  }

  return 0
}

export function enabledSeries(series: OverviewSeries[]): OverviewSeries[] {
  return [...series]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export function buildOverviewChartRows(
  state: { startYear: number; endYear: number; series: OverviewSeries[] },
  deps: OverviewBuildDeps,
): OverviewChartRow[] {
  const asOf = deps.asOf ?? new Date()
  const years = yearsInRange(state.startYear, state.endYear)
  const active = enabledSeries(state.series)

  return years.map((year) => {
    const row: OverviewChartRow = {
      year,
      label: String(year),
      kind: yearKind(year, asOf),
      total: 0,
    }
    let total = 0
    for (const s of active) {
      const v = seriesValueChf(s, year, deps)
      const safe = Number.isFinite(v) && v > 0 ? v : 0
      row[s.id] = safe
      total += safe
    }
    row.total = total
    return row
  })
}

/** Total net worth (enabled series only) for one scenario at year Y. */
export function scenarioTotalAtYear(
  scenario: OverviewScenario,
  year: number,
  deps: OverviewBuildDeps,
): number {
  let total = 0
  for (const s of enabledSeries(scenario.series)) {
    const v = seriesValueChf(s, year, deps)
    if (Number.isFinite(v) && v > 0) total += v
  }
  return total
}

export type OverviewCompareRow = {
  year: number
  label: string
  kind: OverviewYearKind
  /** Per-scenario totals keyed by scenario id */
  [scenarioId: string]: number | string
}

/**
 * Line-chart rows for comparing named overview scenarios.
 * Shared year axis = provided range, or union of each scenario’s range.
 */
export function buildOverviewCompareRows(
  scenarios: OverviewScenario[],
  deps: OverviewBuildDeps,
  range?: { startYear: number; endYear: number },
): OverviewCompareRow[] {
  if (scenarios.length === 0) return []
  const asOf = deps.asOf ?? new Date()
  let start: number
  let end: number
  if (range) {
    start = range.startYear
    end = range.endYear
  } else {
    start = Math.min(...scenarios.map((s) => s.startYear))
    end = Math.max(...scenarios.map((s) => s.endYear))
  }
  const years = yearsInRange(start, end)

  return years.map((year) => {
    const row: OverviewCompareRow = {
      year,
      label: String(year),
      kind: yearKind(year, asOf),
    }
    for (const sc of scenarios) {
      row[sc.id] = scenarioTotalAtYear(sc, year, deps)
    }
    return row
  })
}

/** Distinct line colors for scenario comparison (not origin-based). */
const COMPARE_LINE_COLORS = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#818cf8',
  '#e879f9',
  '#94a3b8',
]

export function assignScenarioCompareColors(scenarios: OverviewScenario[]): Map<string, string> {
  const ordered = sortedOverviewScenarios(scenarios)
  const map = new Map<string, string>()
  ordered.forEach((s, i) => {
    map.set(s.id, COMPARE_LINE_COLORS[i % COMPARE_LINE_COLORS.length]!)
  })
  return map
}

export function sourceLabel(type: OverviewSeries['type']): string {
  if (type === 'portfolio') return 'Portfolio'
  if (type === 'savings') return 'Savings'
  return 'Manual'
}

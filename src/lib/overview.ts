import type {
  CashflowLine,
  OverviewScenario,
  OverviewSeries,
  OverviewSeriesType,
  OverviewState,
  OverviewYearBinding,
  SavedPortfolio,
  SavedScenario,
  SavingsAccount,
} from '../types'
import { toDisplay } from './fx'
import { scenarioTotals } from './incomeCost'
import {
  balanceNow,
  comparePeriodKeys,
  isPermanentCashAccount,
  latestActual,
  makePeriodKey,
  monthsBetween,
  currentPeriodKey,
  parsePeriodKey,
  simulateMonths,
} from './savings'
import {
  cashAtYear,
  cashFromDeposits,
  getActions,
  getActualsCurrency,
  getDeposits,
  getOpeningCash,
  getPerpetualGrowthRate,
  holdingLiveValue,
  holdingPositionLabel,
  holdingValueAtYear,
  lastExplicitDepositYear,
  lastStatedProjectionYear,
  listActualYears,
  portfolioTotalUsdAtYear as portfolioBookTotalUsdAtYear,
  withResolvedDepositAmounts,
  yearEndActualUsd,
  type DepositResolveContext,
} from './portfolio'

export const OVERVIEW_CURRENCY = 'CHF' as const
export const OVERVIEW_DEFAULT_HORIZON_YEARS = 10
export const OVERVIEW_MAX_HORIZON_YEARS = 80

export type OverviewYearKind = 'actual' | 'projected' | 'now'

export type OverviewChartRow = {
  /**
   * Calendar year for year bars; for the Now bar, the as-of calendar year
   * (used for live lookups).
   */
  year: number
  /** Stable X-axis key: "now" or "2026" */
  xKey: string
  label: string
  kind: OverviewYearKind
  isNow: boolean
  total: number
  [seriesId: string]: number | string | boolean | null
}

export type OverviewBuildDeps = {
  portfolios: SavedPortfolio[]
  stockScenarios: SavedScenario[]
  savingsAccounts: SavingsAccount[]
  incomeCostLines: CashflowLine[]
  usdToChf: number | null
  asOf?: Date
  /**
   * Portfolio ids from enabled portfolio series on the Overview scenario being
   * evaluated. Empty / omitted → no-portfolio mode for income leftover.
   */
  overviewPortfolioIds?: string[]
  /**
   * Enabled series on the Overview scenario being evaluated (for leftover claims
   * by manual yearly contributions).
   */
  overviewSeries?: OverviewSeries[]
}

export type { OverviewYearBinding }

/** Sorted year bindings (migrates legacy single id). */
export function getYearBindings(series: OverviewSeries): OverviewYearBinding[] {
  const raw = series.yearBindings
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter(
        (b) =>
          b &&
          Number.isFinite(b.year) &&
          typeof b.incomeCostScenarioId === 'string' &&
          b.incomeCostScenarioId,
      )
      .map((b) => ({
        year: Math.floor(b.year),
        incomeCostScenarioId: b.incomeCostScenarioId,
        percent:
          b.percent != null && Number.isFinite(b.percent)
            ? Math.max(0, Math.min(100, b.percent))
            : undefined,
      }))
      .sort((a, b) => a.year - b.year)
  }
  // Legacy single scenario id
  if (series.incomeCostScenarioId) {
    const y = Math.floor(series.baseYear ?? new Date().getFullYear())
    return [{ year: y, incomeCostScenarioId: series.incomeCostScenarioId }]
  }
  return []
}

/** Permanent leftover series present on every Overview scenario. */
export function isPermanentLeftover(s: OverviewSeries): boolean {
  return s.type === 'incomeLeftover'
}

/**
 * Savings series that map to an existing savings account are permanent on the
 * Overview scenario (always listed; Cash cannot be disabled). Orphans (deleted
 * accounts) can still be removed.
 */
export function isPermanentSavingsSeries(
  s: OverviewSeries,
  accounts: SavingsAccount[],
): boolean {
  if (s.type !== 'savings' || !s.savingsAccountId) return false
  return accounts.some((a) => a.id === s.savingsAccountId)
}

/**
 * Ensure every savings account has a series on this Overview scenario.
 * Drops savings series whose account no longer exists.
 * Keeps existing savings sortOrder (Overview stack order). New accounts
 * append after the last existing savings sortOrder.
 */
export function ensurePermanentSavings(
  series: OverviewSeries[],
  accounts: SavingsAccount[],
): OverviewSeries[] {
  const accountIds = new Set(accounts.map((a) => a.id))
  const kept = series.filter(
    (s) => s.type !== 'savings' || (s.savingsAccountId != null && accountIds.has(s.savingsAccountId)),
  )
  const haveAccount = new Set(
    kept
      .filter((s) => s.type === 'savings' && s.savingsAccountId)
      .map((s) => s.savingsAccountId as string),
  )

  const existingSavings = kept.filter((s) => s.type === 'savings')
  let nextOrder =
    existingSavings.length > 0
      ? Math.max(...existingSavings.map((s) => s.sortOrder)) + 1
      : kept
          .filter((s) => s.type !== 'incomeLeftover')
          .reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1

  const added: OverviewSeries[] = []
  for (const acc of accounts) {
    if (haveAccount.has(acc.id)) continue
    const cash = isPermanentCashAccount(acc)
    added.push(
      newOverviewSeries(
        {
          type: 'savings',
          name: acc.name.trim() || (cash ? 'Cash' : 'Savings'),
          savingsAccountId: acc.id,
          enabled: true,
        },
        nextOrder++,
      ),
    )
  }

  const refreshed = kept.map((s) => {
    if (s.type !== 'savings' || !s.savingsAccountId) return s
    const acc = accounts.find((a) => a.id === s.savingsAccountId)
    if (!acc) return s
    const cash = isPermanentCashAccount(acc)
    const name = s.name.trim() || acc.name.trim() || (cash ? 'Cash' : 'Savings')
    if (name === s.name) return s
    return { ...s, name }
  })

  return ensurePermanentLeftover([...refreshed, ...added])
}

/** True when every account has a mapped savings series (enabled flags are free). */
export function savingsSeriesInSync(
  series: OverviewSeries[],
  accounts: SavingsAccount[],
): boolean {
  const mapped = series
    .filter((s) => s.type === 'savings')
    .map((s) => s.savingsAccountId)
    .filter(Boolean) as string[]
  if (mapped.length !== accounts.length) return false
  const set = new Set(mapped)
  for (const a of accounts) {
    if (!set.has(a.id)) return false
  }
  return true
}

export function newPermanentLeftoverSeries(
  sortOrder: number,
  asOf: Date = new Date(),
): OverviewSeries {
  return newOverviewSeries(
    {
      type: 'incomeLeftover',
      name: 'Leftover cash',
      baseChf: 0,
      annualRatePercent: 0,
      baseYear: asOf.getFullYear(),
      yearBindings: [],
      perpetualYearlyChf: 0,
    },
    sortOrder,
  )
}

/** Ensure exactly one leftover series exists (permanent, always enabled). */
export function ensurePermanentLeftover(
  series: OverviewSeries[],
  asOf: Date = new Date(),
): OverviewSeries[] {
  const leftovers = series.filter((s) => s.type === 'incomeLeftover')
  const others = series.filter((s) => s.type !== 'incomeLeftover')
  if (leftovers.length === 0) {
    const maxOrder = others.reduce((m, s) => Math.max(m, s.sortOrder), -1)
    return [...others, newPermanentLeftoverSeries(maxOrder + 1, asOf)]
  }
  // Keep first leftover, merge bindings from extras, drop duplicates
  const primary = { ...leftovers[0]!, enabled: true, name: leftovers[0]!.name || 'Leftover cash' }
  return [...others, primary]
}

export function bindingForYear(
  bindings: OverviewYearBinding[],
  year: number,
): OverviewYearBinding | null {
  return bindings.find((b) => b.year === year) ?? null
}

export function lastBindingYear(bindings: OverviewYearBinding[]): number | null {
  if (bindings.length === 0) return null
  return bindings[bindings.length - 1]!.year
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
    description: '',
    sortOrder,
    startYear: range.startYear,
    endYear: range.endYear,
    series: ensurePermanentLeftover(series, asOf),
    runway: {
      periods: [
        {
          startYear: asOf.getFullYear(),
          mode: 'manual',
          incomeCostScenarioId: null,
          manualIncomeChf: 0,
          drawMode: 'percent',
          drawPercent: 100,
          drawFixedChf: 0,
        },
      ],
    },
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
    ...partial,
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
    compoundUntilYear: partial.compoundUntilYear ?? null,
    contributeUntilYear: partial.contributeUntilYear ?? null,
    drawLockedUntilYear: partial.drawLockedUntilYear ?? null,
    drawTiming: partial.drawTiming ?? null,
    baseYear: partial.baseYear ?? new Date().getFullYear(),
    yearBindings: partial.yearBindings ?? [],
    perpetualYearlyChf: partial.perpetualYearlyChf ?? 0,
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

const LEFTOVER_SHADES = [
  '#f472b6',
  '#fb7185',
  '#e879f9',
  '#f9a8d4',
  '#c084fc',
  '#f0abfc',
  '#fda4af',
  '#d8b4fe',
]

export function shadesForType(type: OverviewSeriesType): string[] {
  if (type === 'portfolio') return PORTFOLIO_SHADES
  if (type === 'savings') return SAVINGS_SHADES
  if (type === 'incomeLeftover') return LEFTOVER_SHADES
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
    incomeLeftover: 0,
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

/**
 * CHF of Income/Cost surplus claimed by surplus-linked deposits on the given
 * portfolios (Overview-linked only) for a calendar year. Opening cash excluded.
 */
export function allocatedSurplusChf(
  portfolios: SavedPortfolio[],
  incomeCostScenarioId: string,
  year: number,
  surplusChf: number,
): number {
  if (!(surplusChf > 0) || !incomeCostScenarioId) return 0
  let allocated = 0
  for (const p of portfolios) {
    for (const d of getDeposits(p)) {
      if (d.isOpening) continue
      if (d.source !== 'surplus') continue
      if (d.surplusScenarioId !== incomeCostScenarioId) continue
      if (d.year !== year) continue
      const pct = Number.isFinite(d.surplusPercent) ? Math.max(0, d.surplusPercent!) : 0
      allocated += surplusChf * (pct / 100)
    }
    const perpetual = p.perpetualYearlyDeposit
    if (
      perpetual &&
      perpetual.source === 'surplus' &&
      perpetual.surplusScenarioId === incomeCostScenarioId
    ) {
      const last = lastExplicitDepositYear(p, year)
      if (year > last) {
        const pct = Number.isFinite(perpetual.surplusPercent)
          ? Math.max(0, perpetual.surplusPercent!)
          : 0
        allocated += surplusChf * (pct / 100)
      }
    }
  }
  return allocated
}

/**
 * Yearly residual: IC net minus surplus deposits from the given portfolios only.
 */
export function residualSurplusChf(
  lines: CashflowLine[],
  incomeCostScenarioId: string,
  portfolios: SavedPortfolio[],
  year: number,
): number {
  if (!incomeCostScenarioId) return 0
  const surplusChf = Math.max(0, scenarioTotals(lines, incomeCostScenarioId).netYearly)
  const allocated = allocatedSurplusChf(portfolios, incomeCostScenarioId, year, surplusChf)
  return Math.max(0, surplusChf - allocated)
}

/**
 * Available IC cash for a scenario in calendar year Y (CHF).
 * With overview portfolios: residual after surplus deposits.
 * Without: full IC net.
 */
export function availableIcCashChf(
  incomeCostScenarioId: string,
  year: number,
  deps: OverviewBuildDeps,
): number {
  if (!incomeCostScenarioId) return 0
  const portfolioIds = deps.overviewPortfolioIds ?? []
  if (portfolioIds.length > 0) {
    const portfolios = deps.portfolios.filter((p) => portfolioIds.includes(p.id))
    return residualSurplusChf(deps.incomeCostLines, incomeCostScenarioId, portfolios, year)
  }
  return Math.max(0, scenarioTotals(deps.incomeCostLines, incomeCostScenarioId).netYearly)
}

/** All year bindings from enabled manuals + leftover on this overview scenario. */
export function allOverviewBindings(deps: OverviewBuildDeps): OverviewYearBinding[] {
  const out: OverviewYearBinding[] = []
  for (const s of deps.overviewSeries ?? []) {
    if (!s.enabled) continue
    if (s.type !== 'manual' && s.type !== 'incomeLeftover') continue
    out.push(...getYearBindings(s))
  }
  return out.sort((a, b) => a.year - b.year)
}

export function lastOverviewBindingYear(deps: OverviewBuildDeps): number | null {
  const all = allOverviewBindings(deps)
  return lastBindingYear(all)
}

/**
 * Gross pool for leftover in year Y = sum of available IC cash for every
 * distinct IC scenario bound that year (by manuals or leftover).
 */
export function grossIcPoolAtYear(year: number, deps: OverviewBuildDeps): number {
  const scenarioIds = new Set<string>()
  for (const b of allOverviewBindings(deps)) {
    if (b.year === year) scenarioIds.add(b.incomeCostScenarioId)
  }
  let sum = 0
  for (const id of scenarioIds) {
    sum += availableIcCashChf(id, year, deps)
  }
  return sum
}

/**
 * Manual claim for year Y from year-scenario-% bindings.
 * If multiple manuals bind the same IC scenario, percents are applied in sortOrder
 * and capped so total claim ≤ available.
 */
export function manualYearlyAddition(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): number {
  if (series.type !== 'manual' || !series.enabled) return 0
  const baseYear = Math.floor(series.baseYear ?? year)
  if (year < baseYear) return 0

  const allMine = getYearBindings(series)
  const myBindings = allMine.filter((b) => b.year === year)
  if (myBindings.length > 0) {
    // Group all manual claims for this year by IC scenario for fair capping
    const manuals = (deps.overviewSeries ?? [])
      .filter((s) => s.enabled && s.type === 'manual')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))

    // Per-scenario remaining available
    const remainingBySc = new Map<string, number>()
    for (const b of allOverviewBindings(deps)) {
      if (b.year !== year) continue
      if (!remainingBySc.has(b.incomeCostScenarioId)) {
        remainingBySc.set(
          b.incomeCostScenarioId,
          availableIcCashChf(b.incomeCostScenarioId, year, deps),
        )
      }
    }

    let myTotal = 0
    for (const m of manuals) {
      const binds = getYearBindings(m).filter((b) => b.year === year)
      for (const b of binds) {
        const pct = b.percent != null && Number.isFinite(b.percent) ? Math.max(0, b.percent) : 0
        if (!(pct > 0)) continue
        const avail = remainingBySc.get(b.incomeCostScenarioId) ?? 0
        const full = availableIcCashChf(b.incomeCostScenarioId, year, deps)
        const want = full * (pct / 100)
        const got = Math.min(want, avail)
        remainingBySc.set(b.incomeCostScenarioId, Math.max(0, avail - got))
        if (m.id === series.id) myTotal += got
      }
    }
    return myTotal
  }

  // No binding this year → flat perpetual after this series' last stated year
  // (or every year from baseYear when this series has no year bindings).
  const lastY = lastBindingYear(allMine)
  if (lastY == null || year > lastY) {
    const p = series.perpetualYearlyChf
    return Number.isFinite(p) && p! > 0 ? p! : 0
  }
  return 0
}

/**
 * Leftover yearly addition = unclaimed IC cash for the year (after manual %),
 * or perpetual after the last binding year across the overview scenario.
 */
export function leftoverNetYearlyAddition(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): number {
  if (series.type !== 'incomeLeftover') return 0

  const bindsThisYear = allOverviewBindings(deps).filter((b) => b.year === year)
  if (bindsThisYear.length > 0) {
    const scenarioIds = [...new Set(bindsThisYear.map((b) => b.incomeCostScenarioId))]
    const manuals = (deps.overviewSeries ?? [])
      .filter((s) => s.enabled && s.type === 'manual')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))

    let leftover = 0
    for (const scId of scenarioIds) {
      const full = availableIcCashChf(scId, year, deps)
      let remaining = full
      for (const m of manuals) {
        for (const b of getYearBindings(m)) {
          if (b.year !== year || b.incomeCostScenarioId !== scId) continue
          const pct = b.percent != null && Number.isFinite(b.percent) ? Math.max(0, b.percent) : 0
          if (!(pct > 0)) continue
          const want = full * (pct / 100)
          const got = Math.min(want, remaining)
          remaining -= got
        }
      }
      leftover += Math.max(0, remaining)
    }
    return leftover
  }

  // No bindings this year → perpetual after last binding year.
  // If the scenario has no IC bindings at all, perpetual applies every year
  // (from baseYear onward via residualCashValueAtYear).
  const lastY = lastOverviewBindingYear(deps)
  if (lastY == null || year > lastY) {
    const p = series.perpetualYearlyChf
    return Number.isFinite(p) && p! > 0 ? p! : 0
  }
  return 0
}

/** @deprecated use leftoverNetYearlyAddition */
export function leftoverYearlyAddition(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): number {
  return leftoverNetYearlyAddition(series, year, deps)
}

/**
 * Accumulating cash pile for permanent leftover.
 */
export function residualCashValueAtYear(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): number {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()
  const baseYear = Math.floor(series.baseYear ?? currentYear)
  const base = Math.max(0, series.baseChf ?? 0)
  const rate = Number.isFinite(series.annualRatePercent) ? series.annualRatePercent! : 0
  if (year < baseYear) return 0

  const until = series.compoundUntilYear
  const contribUntil = series.contributeUntilYear
  let bal = base
  for (let y = baseYear; y <= year; y++) {
    if (y > baseYear && (until == null || y <= until)) bal = bal * (1 + rate / 100)
    if (contribUntil == null || y <= contribUntil) bal += leftoverNetYearlyAddition(series, y, deps)
  }
  return bal
}

/**
 * Manual series: base at baseYear, then each year compounds and adds
 * year-binding % of IC available cash, then flat perpetual after the last
 * stated year for this series.
 */
export function manualAccumulatedValueAtYear(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): number {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()
  const baseYear = Math.floor(series.baseYear ?? currentYear)
  const base = Math.max(0, series.baseChf ?? 0)
  const rate = Number.isFinite(series.annualRatePercent) ? series.annualRatePercent! : 0
  if (year < baseYear) return 0

  const until = series.compoundUntilYear
  const contribUntil = series.contributeUntilYear
  let bal = base
  for (let y = baseYear; y <= year; y++) {
    if (y > baseYear && (until == null || y <= until)) bal = bal * (1 + rate / 100)
    if (contribUntil == null || y <= contribUntil) bal += manualYearlyAddition(series, y, deps)
  }
  return bal
}

export type PortfolioBreakdownLine = {
  label: string
  kind: 'equity' | 'cash'
  valueChf: number
}

/**
 * Holdings + cash for a portfolio series at calendar year Y (CHF), for tooltips.
 * Pass `live: true` for the Now bar (opening cash + live marks).
 */
export function portfolioBreakdownChfAtYear(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
  options?: { live?: boolean },
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
  const last = lastStatedProjectionYear(resolved, deps.stockScenarios, currentYear)
  const until = series.compoundUntilYear
  const contribUntil = series.contributeUntilYear

  if (options?.live) {
    // Now bar: positions as held (ignore planned buy/sell actions)
    const lines: PortfolioBreakdownLine[] = []
    for (const h of resolved.holdings) {
      const scenario =
        h.scenarioId && !h.manualOnly
          ? (deps.stockScenarios.find((s) => s.id === h.scenarioId) ?? null)
          : null
      const usd = holdingLiveValue(h, scenario, [], currentYear) ?? 0
      if (!Number.isFinite(usd) || usd === 0) continue
      lines.push({
        label: holdingPositionLabel(h, scenario),
        kind: 'equity',
        valueChf: toDisplay(usd, 'CHF', deps.usdToChf),
      })
    }
    const cashUsd = getOpeningCash(resolved)
    if (Number.isFinite(cashUsd) && cashUsd !== 0) {
      lines.push({
        label: 'Cash',
        kind: 'cash',
        valueChf: toDisplay(cashUsd, 'CHF', deps.usdToChf),
      })
    }
    return lines
  }

  // Past years: year-end actual (if recorded) as a single stack segment
  if (year < currentYear) {
    const actualUsd = yearEndActualUsd(resolved, year, deps.usdToChf)
    if (actualUsd != null) {
      return [
        {
          label: 'Actual (year-end)',
          kind: 'equity',
          valueChf: toDisplay(actualUsd, 'CHF', deps.usdToChf),
        },
      ]
    }
  }

  if (until != null && Number.isFinite(until) && year > until) {
    const lines = portfolioBreakdownChfAtYear(
      { ...series, compoundUntilYear: null },
      until,
      deps,
      options,
    )
    const addThrough =
      contribUntil != null && Number.isFinite(contribUntil) ? Math.min(year, contribUntil) : year
    const addUsd = extraCashFromDepositsAfter(resolved, until, addThrough, currentYear)
    if (addUsd > 0) {
      lines.push({
        label: `Deposits after ${until}`,
        kind: 'cash',
        valueChf: toDisplay(addUsd, 'CHF', deps.usdToChf),
      })
    }
    return lines
  }

  const rate = getPerpetualGrowthRate(resolved)

  // After last stated year with growth: single compounded total (matches series bar)
  if (year > last && rate !== 0) {
    const grown = overviewPortfolioSeriesUsd(
      resolved,
      year,
      until,
      contribUntil,
      deps.stockScenarios,
      currentYear,
    )
    return [
      {
        label: `Growth ${rate}%/yr from ${last}`,
        kind: 'equity',
        valueChf: toDisplay(grown, 'CHF', deps.usdToChf),
      },
    ]
  }

  const lines: PortfolioBreakdownLine[] = []

  // Match portfolio grid: carry-forward within stated years; no equity after last stated
  if (year <= last) {
    for (const h of resolved.holdings) {
      const scenario = h.scenarioId
        ? (deps.stockScenarios.find((s) => s.id === h.scenarioId) ?? null)
        : null
      const usd = holdingValueAtYear(h, scenario, actions, year, currentYear)
      if (usd == null || !Number.isFinite(usd) || usd === 0) continue
      lines.push({
        label: holdingPositionLabel(h, scenario),
        kind: 'equity',
        valueChf: toDisplay(usd, 'CHF', deps.usdToChf),
      })
    }
  }

  // After last stated without growth: cash only (same as portfolio grid)
  if (year <= last || rate === 0) {
    let cashUsd = cashAtYear(resolved, year, deps.stockScenarios, currentYear)
    if (contribUntil != null && Number.isFinite(contribUntil) && year > contribUntil) {
      cashUsd -= extraCashFromDepositsAfter(resolved, contribUntil, year, currentYear)
    }
    if (Number.isFinite(cashUsd) && cashUsd !== 0) {
      lines.push({
        label: 'Cash',
        kind: 'cash',
        valueChf: toDisplay(cashUsd, 'CHF', deps.usdToChf),
      })
    }
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
  // Swap if inverted (don't collapse to a single year)
  if (end < start) {
    const t = start
    start = end
    end = t
  }
  return { startYear: start, endYear: end }
}

export function yearsInRange(
  startYear: number,
  endYear: number,
  asOf: Date = new Date(),
): number[] {
  const { startYear: s, endYear: e } = clampOverviewRange(startYear, endYear, asOf)
  const out: number[] = []
  for (let y = s; y <= e; y++) out.push(y)
  return out
}

export function yearKind(year: number, asOf: Date = new Date()): OverviewYearKind {
  // Current calendar year is still a year-end style projection on the axis;
  // live values live on the separate Now bar.
  return year < asOf.getFullYear() ? 'actual' : 'projected'
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
  // Not on the chart before the stated base year
  if (year < by) return 0
  const steps = year - by
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
 * Delegates to portfolio.ts so Overview matches the Portfolio tab exactly.
 */
export function portfolioTotalUsdAtYear(
  portfolio: SavedPortfolio,
  stockScenarios: SavedScenario[],
  year: number,
  depositCtx: DepositResolveContext | null,
  currentYear = new Date().getFullYear(),
): number {
  const resolved = withResolvedDepositAmounts(portfolio, depositCtx)
  return portfolioBookTotalUsdAtYear(resolved, stockScenarios, year, currentYear)
}

/** Deposits scheduled after `afterYear` through `asOfYear` (USD book). */
function extraCashFromDepositsAfter(
  portfolio: SavedPortfolio,
  afterYear: number,
  asOfYear: number,
  currentYear: number,
): number {
  if (asOfYear <= afterYear) return 0
  return (
    cashFromDeposits(portfolio, asOfYear, currentYear) -
    cashFromDeposits(portfolio, afterYear, currentYear)
  )
}

/**
 * Overview portfolio book USD: compound-until freezes growth (later deposits
 * still land); contribute-until stops those additions. Does not change the
 * Portfolio tab — only this series’ Overview / Runway value.
 */
function overviewPortfolioSeriesUsd(
  portfolio: SavedPortfolio,
  year: number,
  compoundUntil: number | null | undefined,
  contributeUntil: number | null | undefined,
  scenarios: SavedScenario[],
  currentYear: number,
): number {
  const until = compoundUntil != null && Number.isFinite(compoundUntil) ? compoundUntil : null
  const contribUntil =
    contributeUntil != null && Number.isFinite(contributeUntil) ? contributeUntil : null

  if (until != null && year > until) {
    const frozen = overviewPortfolioSeriesUsd(
      portfolio,
      until,
      null,
      contribUntil,
      scenarios,
      currentYear,
    )
    const addThrough = contribUntil == null ? year : Math.min(year, contribUntil)
    return (
      frozen +
      Math.max(0, extraCashFromDepositsAfter(portfolio, until, addThrough, currentYear))
    )
  }

  if (contribUntil == null || year <= contribUntil) {
    return portfolioBookTotalUsdAtYear(portfolio, scenarios, year, currentYear)
  }

  const last = lastStatedProjectionYear(portfolio, scenarios, currentYear)
  const rate = getPerpetualGrowthRate(portfolio)
  const extraThrough = (y: number) =>
    extraCashFromDepositsAfter(portfolio, contribUntil, y, currentYear)

  if (year <= last || rate === 0) {
    return portfolioBookTotalUsdAtYear(portfolio, scenarios, year, currentYear) - extraThrough(year)
  }

  // After last stated: keep growth, drop deposits after contribute-until
  // (cannot subtract nominal later deposits — they would have been compounded).
  if (contribUntil >= last) {
    let v = portfolioBookTotalUsdAtYear(portfolio, scenarios, contribUntil, currentYear)
    const r = 1 + rate / 100
    for (let y = contribUntil + 1; y <= year; y++) v *= r
    return v
  }

  let v =
    portfolioBookTotalUsdAtYear(portfolio, scenarios, last, currentYear) - extraThrough(last)
  const r = 1 + rate / 100
  for (let y = last + 1; y <= year; y++) v *= r
  return v
}

/** Live portfolio total in CHF (opening cash + live holdings), matching Portfolio Now. */
export function portfolioLiveTotalChf(
  portfolio: SavedPortfolio,
  deps: OverviewBuildDeps,
): number {
  if (deps.usdToChf == null || deps.usdToChf <= 0) return 0
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()
  const depositCtx: DepositResolveContext = {
    incomeCostLines: deps.incomeCostLines,
    usdToChf: deps.usdToChf,
  }
  const resolved = withResolvedDepositAmounts(portfolio, depositCtx)
  // Now ignores buy/sell actions — only current holdings × marks
  let usd = getOpeningCash(resolved)
  for (const h of resolved.holdings) {
    const scenario =
      h.scenarioId && !h.manualOnly
        ? (deps.stockScenarios.find((s) => s.id === h.scenarioId) ?? null)
        : null
    usd += holdingLiveValue(h, scenario, [], currentYear) ?? 0
  }
  return toDisplay(usd, 'CHF', deps.usdToChf)
}

function savingsHasActualOnOrBefore(account: SavingsAccount, asOfKey: string): boolean {
  for (const [k, v] of Object.entries(account.actuals ?? {})) {
    if (!Number.isFinite(v)) continue
    if (comparePeriodKeys(k, asOfKey) <= 0) return true
  }
  return false
}

/**
 * Year-end recorded CHF for enabled portfolio + savings series only.
 * Same actuals Overview uses on past bars: last month in the year for
 * portfolios (via yearEndActualUsd → CHF), latest actual ≤ Dec Y for savings
 * (carry-forward). Manual / leftover are modeled, not recorded.
 * Past calendar years only — current year is a projection on this chart.
 */
export function recordedOverviewByYear(
  series: OverviewSeries[],
  deps: OverviewBuildDeps,
): Map<number, number> {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()

  const portfolios: SavedPortfolio[] = []
  const seenP = new Set<string>()
  const accounts: SavingsAccount[] = []
  const seenA = new Set<string>()

  for (const s of series) {
    if (!s.enabled) continue
    if (s.type === 'portfolio' && s.portfolioId && !seenP.has(s.portfolioId)) {
      const p = deps.portfolios.find((x) => x.id === s.portfolioId)
      if (p) {
        seenP.add(p.id)
        portfolios.push(p)
      }
    } else if (s.type === 'savings' && s.savingsAccountId && !seenA.has(s.savingsAccountId)) {
      const a = deps.savingsAccounts.find((x) => x.id === s.savingsAccountId)
      if (a) {
        seenA.add(a.id)
        accounts.push(a)
      }
    }
  }

  let minY = currentYear
  for (const p of portfolios) {
    for (const y of listActualYears(p)) {
      if (y < minY) minY = y
    }
  }
  for (const a of accounts) {
    for (const key of Object.keys(a.actuals ?? {})) {
      const parsed = parsePeriodKey(key)
      if (parsed && parsed.year < minY) minY = parsed.year
    }
  }

  const out = new Map<number, number>()
  if (minY >= currentYear) return out

  for (let year = minY; year < currentYear; year++) {
    let sum = 0
    let any = false
    for (const p of portfolios) {
      const usd = yearEndActualUsd(p, year, deps.usdToChf)
      if (usd == null) continue
      if (getActualsCurrency(p) === 'USD' && (deps.usdToChf == null || deps.usdToChf <= 0)) {
        continue
      }
      sum += toDisplay(usd, 'CHF', deps.usdToChf)
      any = true
    }
    const decKey = makePeriodKey(year, 12)
    for (const a of accounts) {
      if (!savingsHasActualOnOrBefore(a, decKey)) continue
      sum += latestActual(a, decKey)
      any = true
    }
    if (any) out.set(year, sum)
  }
  return out
}

export function seriesValueChf(
  series: OverviewSeries,
  year: number,
  deps: OverviewBuildDeps,
): number {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()

  if (series.type === 'manual') {
    return manualAccumulatedValueAtYear(series, year, deps)
  }

  if (series.type === 'savings') {
    const acc = deps.savingsAccounts.find((a) => a.id === series.savingsAccountId)
    if (!acc) return 0
    const until = series.compoundUntilYear ?? acc.compoundUntilYear ?? null
    const contribUntil = series.contributeUntilYear ?? acc.contributeUntilYear ?? null
    return savingsValueAtYear(
      { ...acc, compoundUntilYear: until, contributeUntilYear: contribUntil },
      year,
      asOf,
    )
  }

  if (series.type === 'portfolio') {
    const p = deps.portfolios.find((x) => x.id === series.portfolioId)
    if (!p) return 0
    if (deps.usdToChf == null || deps.usdToChf <= 0) return 0

    // Past years: stack year-end actual when present (matches Portfolio chart)
    if (year < currentYear) {
      const actualUsd = yearEndActualUsd(p, year, deps.usdToChf)
      if (actualUsd != null) {
        return toDisplay(actualUsd, 'CHF', deps.usdToChf)
      }
    }

    const depositCtx: DepositResolveContext = {
      incomeCostLines: deps.incomeCostLines,
      usdToChf: deps.usdToChf,
    }
    const resolved = withResolvedDepositAmounts(p, depositCtx)
    const usd = overviewPortfolioSeriesUsd(
      resolved,
      year,
      series.compoundUntilYear,
      series.contributeUntilYear,
      deps.stockScenarios,
      currentYear,
    )
    return toDisplay(usd, 'CHF', deps.usdToChf)
  }

  if (series.type === 'incomeLeftover') {
    return residualCashValueAtYear(series, year, deps)
  }

  return 0
}

/** Live “Now” value for a series (current balances, not year-end projection). */
export function seriesValueChfNow(series: OverviewSeries, deps: OverviewBuildDeps): number {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()

  if (series.type === 'manual') {
    // Now = base pile only (yearly additions land on calendar year bars)
    return manualValueAtYear(
      series.baseChf ?? 0,
      series.annualRatePercent ?? 0,
      series.baseYear ?? currentYear,
      currentYear,
    )
  }

  if (series.type === 'savings') {
    const acc = deps.savingsAccounts.find((a) => a.id === series.savingsAccountId)
    if (!acc) return 0
    return balanceNow(acc, asOf)
  }

  if (series.type === 'portfolio') {
    const p = deps.portfolios.find((x) => x.id === series.portfolioId)
    if (!p) return 0
    return portfolioLiveTotalChf(p, deps)
  }

  // Unallocated cash pile as held today (only once base year is reached)
  if (series.type === 'incomeLeftover') {
    const baseYear = Math.floor(series.baseYear ?? currentYear)
    if (currentYear < baseYear) return 0
    return Math.max(0, series.baseChf ?? 0)
  }

  return 0
}

export function enabledSeries(series: OverviewSeries[]): OverviewSeries[] {
  return [...series]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

function overviewPortfolioIdsFromSeries(series: OverviewSeries[]): string[] {
  const ids: string[] = []
  for (const s of series) {
    if (s.enabled && s.type === 'portfolio' && s.portfolioId) ids.push(s.portfolioId)
  }
  return ids
}

export function withOverviewContext(
  deps: OverviewBuildDeps,
  series: OverviewSeries[],
): OverviewBuildDeps {
  return {
    ...deps,
    overviewPortfolioIds: overviewPortfolioIdsFromSeries(series),
    overviewSeries: series.filter((s) => s.enabled),
  }
}

function fillSeriesRow(
  row: OverviewChartRow,
  active: OverviewSeries[],
  valueFn: (s: OverviewSeries) => number,
): OverviewChartRow {
  let total = 0
  for (const s of active) {
    const v = valueFn(s)
    const safe = Number.isFinite(v) && v > 0 ? v : 0
    row[s.id] = safe
    total += safe
  }
  row.total = total
  return row
}

/**
 * Stacked bar rows: past years → **Now** (live) → current / future years.
 * Now sits between the last past year and the current calendar year.
 */
export function buildOverviewChartRows(
  state: { startYear: number; endYear: number; series: OverviewSeries[] },
  deps: OverviewBuildDeps,
): OverviewChartRow[] {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()
  const years = yearsInRange(state.startYear, state.endYear, asOf)
  const active = enabledSeries(state.series)
  const scoped = withOverviewContext(deps, state.series)

  const nowRow = (): OverviewChartRow =>
    fillSeriesRow(
      {
        year: currentYear,
        xKey: 'now',
        label: 'Now',
        kind: 'now',
        isNow: true,
        total: 0,
      },
      active,
      (s) => seriesValueChfNow(s, scoped),
    )

  const yearRow = (year: number): OverviewChartRow =>
    fillSeriesRow(
      {
        year,
        xKey: String(year),
        label: String(year),
        kind: yearKind(year, asOf),
        isNow: false,
        total: 0,
      },
      active,
      (s) => seriesValueChf(s, year, scoped),
    )

  const rows: OverviewChartRow[] = []
  let nowInserted = false
  for (const year of years) {
    if (!nowInserted && year >= currentYear) {
      rows.push(nowRow())
      nowInserted = true
    }
    rows.push(yearRow(year))
  }
  // Range is entirely in the past: append Now after last past year
  if (!nowInserted) {
    rows.push(nowRow())
  }
  return rows
}

/** Total net worth (enabled series only) for one scenario at year Y. */
export function scenarioTotalAtYear(
  scenario: OverviewScenario,
  year: number,
  deps: OverviewBuildDeps,
): number {
  const scoped = withOverviewContext(deps, scenario.series)
  let total = 0
  for (const s of enabledSeries(scenario.series)) {
    const v = seriesValueChf(s, year, scoped)
    if (Number.isFinite(v) && v > 0) total += v
  }
  return total
}

/** Live Now total for a scenario (enabled series, positions as held). */
export function scenarioTotalNow(
  scenario: OverviewScenario,
  deps: OverviewBuildDeps,
): number {
  const scoped = withOverviewContext(deps, scenario.series)
  let total = 0
  for (const s of enabledSeries(scenario.series)) {
    const v = seriesValueChfNow(s, scoped)
    if (Number.isFinite(v) && v > 0) total += v
  }
  return total
}

export type OverviewCompareRow = {
  year: number
  /** Stable X-axis key: "now" or "2026" */
  xKey: string
  label: string
  kind: OverviewYearKind
  isNow: boolean
  /** Per-scenario totals keyed by scenario id */
  [scenarioId: string]: number | string | boolean | null
}

/**
 * Line-chart rows for comparing named overview scenarios.
 * Shared axis: past years → **Now** (live) → current / future years.
 */
export function buildOverviewCompareRows(
  scenarios: OverviewScenario[],
  deps: OverviewBuildDeps,
  range?: { startYear: number; endYear: number },
): OverviewCompareRow[] {
  if (scenarios.length === 0) return []
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()
  let start: number
  let end: number
  if (range) {
    start = range.startYear
    end = range.endYear
  } else {
    start = Math.min(...scenarios.map((s) => s.startYear))
    end = Math.max(...scenarios.map((s) => s.endYear))
  }
  const years = yearsInRange(start, end, asOf)

  const nowRow = (): OverviewCompareRow => {
    const row: OverviewCompareRow = {
      year: currentYear,
      xKey: 'now',
      label: 'Now',
      kind: 'now',
      isNow: true,
    }
    for (const sc of scenarios) {
      row[sc.id] = scenarioTotalNow(sc, deps)
    }
    return row
  }

  const yearRow = (year: number): OverviewCompareRow => {
    const row: OverviewCompareRow = {
      year,
      xKey: String(year),
      label: String(year),
      kind: yearKind(year, asOf),
      isNow: false,
    }
    for (const sc of scenarios) {
      row[sc.id] = scenarioTotalAtYear(sc, year, deps)
    }
    return row
  }

  const rows: OverviewCompareRow[] = []
  let nowInserted = false
  for (const year of years) {
    if (!nowInserted && year >= currentYear) {
      rows.push(nowRow())
      nowInserted = true
    }
    rows.push(yearRow(year))
  }
  if (!nowInserted) {
    rows.push(nowRow())
  }
  return rows
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
  if (type === 'incomeLeftover') return 'Leftover'
  return 'Manual'
}

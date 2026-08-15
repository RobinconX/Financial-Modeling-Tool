import type {
  CashflowLine,
  OverviewRunwayConfig,
  OverviewRunwayPeriod,
  OverviewSeries,
  RunwayPeriodMode,
  SavingsAccount,
} from '../types'
import { scenarioTotals } from './incomeCost'
import {
  enabledSeries,
  seriesValueChf,
  seriesValueChfNow,
  withOverviewContext,
  yearKind,
  yearsInRange,
  type OverviewBuildDeps,
  type OverviewChartRow,
} from './overview'
import { isPermanentCashAccount } from './savings'

export function defaultRunwayPeriod(startYear: number): OverviewRunwayPeriod {
  return {
    startYear,
    mode: 'manual',
    incomeCostScenarioId: null,
    manualIncomeChf: 0,
    drawMode: 'percent',
    drawPercent: 100,
    drawFixedChf: 0,
  }
}

export function defaultRunwayConfig(asOf: Date = new Date()): OverviewRunwayConfig {
  return { periods: [defaultRunwayPeriod(asOf.getFullYear())] }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseMode(v: unknown): RunwayPeriodMode {
  if (v === 'ic-keep' || v === 'ic-income' || v === 'manual') return v
  if (v === 'scenario') return 'ic-income'
  return 'manual'
}

function normalizePeriod(raw: unknown, fallbackYear: number): OverviewRunwayPeriod | null {
  if (!isRecord(raw)) return null
  const startYear = Math.floor(Number(raw.startYear))
  const y = Number.isFinite(startYear) && startYear >= 1900 && startYear <= 2200 ? startYear : fallbackYear
  const drawMode = raw.drawMode === 'fixed' ? 'fixed' : 'percent'
  const pct = Number(raw.drawPercent)
  const fixed = Number(raw.drawFixedChf)
  const manual = Number(raw.manualIncomeChf)
  return {
    startYear: y,
    mode: parseMode(raw.mode ?? raw.incomeSource),
    incomeCostScenarioId:
      typeof raw.incomeCostScenarioId === 'string' && raw.incomeCostScenarioId
        ? raw.incomeCostScenarioId
        : null,
    manualIncomeChf: Number.isFinite(manual) && manual > 0 ? manual : 0,
    drawMode,
    drawPercent: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 100,
    drawFixedChf: Number.isFinite(fixed) && fixed > 0 ? fixed : 0,
  }
}

export function normalizeRunwayConfig(raw: unknown): OverviewRunwayConfig {
  const cy = new Date().getFullYear()
  if (isRecord(raw) && Array.isArray(raw.periods)) {
    const periods = raw.periods
      .map((p) => normalizePeriod(p, cy))
      .filter((p): p is OverviewRunwayPeriod => p != null)
      .sort((a, b) => a.startYear - b.startYear)
    return { periods: periods.length > 0 ? periods : defaultRunwayConfig().periods }
  }
  // Legacy single-block config
  if (isRecord(raw) && (raw.incomeSource != null || raw.drawMode != null || raw.manualIncomeChf != null)) {
    const p = normalizePeriod({ ...raw, startYear: cy, mode: raw.incomeSource }, cy)
    return { periods: p ? [p] : defaultRunwayConfig().periods }
  }
  return defaultRunwayConfig()
}

export function periodForYear(
  config: OverviewRunwayConfig,
  year: number,
): OverviewRunwayPeriod {
  const sorted = [...(config.periods ?? [])].sort((a, b) => a.startYear - b.startYear)
  let hit: OverviewRunwayPeriod | null = null
  for (const p of sorted) {
    if (p.startYear <= year) hit = p
    else break
  }
  // Years before the first period have no I/C assumptions yet.
  return hit ?? defaultRunwayPeriod(year)
}

export function runwayIncomeDrawForYear(
  config: OverviewRunwayConfig,
  year: number,
  lines: CashflowLine[],
): { income: number; draw: number } {
  const p = periodForYear(config, year)
  if (p.mode === 'ic-keep' && p.incomeCostScenarioId) {
    const t = scenarioTotals(lines, p.incomeCostScenarioId)
    return {
      income: t.incomeYearly > 0 ? t.incomeYearly : 0,
      draw: t.costYearly > 0 ? t.costYearly : 0,
    }
  }
  const income =
    p.mode === 'ic-income' && p.incomeCostScenarioId
      ? Math.max(0, scenarioTotals(lines, p.incomeCostScenarioId).incomeYearly)
      : p.manualIncomeChf > 0
        ? p.manualIncomeChf
        : 0
  const draw =
    p.drawMode === 'fixed'
      ? p.drawFixedChf > 0
        ? p.drawFixedChf
        : 0
      : income * (p.drawPercent / 100)
  return { income, draw }
}

/** @deprecated use runwayIncomeDrawForYear */
export function runwayIncomeChf(
  config: OverviewRunwayConfig,
  lines: CashflowLine[],
  year: number = new Date().getFullYear(),
): number {
  return runwayIncomeDrawForYear(config, year, lines).income
}

/** @deprecated use runwayIncomeDrawForYear */
export function runwayDrawChf(
  config: OverviewRunwayConfig,
  income: number,
  year?: number,
  lines?: CashflowLine[],
): number {
  if (year != null && lines) return runwayIncomeDrawForYear(config, year, lines).draw
  return income * 1
}

function drawRank(s: OverviewSeries, accounts: SavingsAccount[]): number {
  if (s.type === 'incomeLeftover') return 0
  if (s.type === 'savings') {
    const acc = accounts.find((a) => a.id === s.savingsAccountId)
    if (acc && isPermanentCashAccount(acc)) return 1
    return 2
  }
  if (s.type === 'portfolio') return 3
  if (s.type === 'manual') return 4
  return 9
}

/** Take `gap` from balances: leftover, cash, other savings, portfolios, manuals. */
export function takeFromAssets(
  balances: Map<string, number>,
  series: OverviewSeries[],
  accounts: SavingsAccount[],
  gap: number,
): number {
  if (!(gap > 0)) return 0
  const order = [...series].sort(
    (a, b) =>
      drawRank(a, accounts) - drawRank(b, accounts) ||
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id),
  )
  let left = gap
  for (const s of order) {
    if (!(left > 0)) break
    const have = balances.get(s.id) ?? 0
    const take = Math.min(have, left)
    balances.set(s.id, have - take)
    left -= take
  }
  return gap - left
}

/** Add unspent income onto the leftover-cash series. */
export function addSurplusToLeftover(
  balances: Map<string, number>,
  series: OverviewSeries[],
  surplus: number,
): number {
  if (!(surplus > 0)) return 0
  const leftover = series.find((s) => s.type === 'incomeLeftover')
  if (!leftover) return 0
  const have = balances.get(leftover.id) ?? 0
  balances.set(leftover.id, have + surplus)
  return surplus
}

/** I/C periods add leftover surplus; manual periods do not. */
export function periodAddsICsurplus(mode: OverviewRunwayPeriod['mode']): boolean {
  return mode === 'ic-keep' || mode === 'ic-income'
}

/** Grow leftover by its rate only. */
export function growLeftoverByRate(
  balance: number,
  leftover: OverviewSeries,
  from: 'now' | number,
  toYear: number,
  currentYear: number,
): number {
  const rate = Number.isFinite(leftover.annualRatePercent) ? leftover.annualRatePercent! : 0
  const until = leftover.compoundUntilYear
  const fromY = from === 'now' ? currentYear - 1 : from
  let bal = balance
  for (let y = fromY + 1; y <= toYear; y++) {
    if (until == null || y <= until) bal *= 1 + rate / 100
  }
  return Math.max(0, bal)
}

function leftoverOverviewAt(
  leftover: OverviewSeries,
  at: 'now' | number,
  deps: OverviewBuildDeps,
): number {
  return at === 'now' ? seriesValueChfNow(leftover, deps) : seriesValueChf(leftover, at, deps)
}

/**
 * Runway leftover pile: copy Overview leftover’s year-to-year change onto the
 * separate pile (surplus / draws already on the pile stay).
 */
export function stepRunwayLeftoverPile(
  pile: number,
  leftover: OverviewSeries,
  from: 'now' | number,
  toYear: number,
  deps: OverviewBuildDeps,
): number {
  const prev = leftoverOverviewAt(leftover, from, deps)
  const next = seriesValueChf(leftover, toYear, deps)
  return Math.max(0, pile + (next - prev))
}

function growBalances(
  balances: Map<string, number>,
  series: OverviewSeries[],
  from: 'now' | number,
  toYear: number,
  deps: OverviewBuildDeps,
): void {
  for (const s of series) {
    if (s.type === 'incomeLeftover') continue
    const cur = balances.get(s.id) ?? 0
    const prev = from === 'now' ? seriesValueChfNow(s, deps) : seriesValueChf(s, from, deps)
    const next = seriesValueChf(s, toYear, deps)
    if (prev > 0 && Number.isFinite(next / prev)) {
      balances.set(s.id, Math.max(0, cur * (next / prev)))
    } else if (next > 0 && cur === 0) {
      balances.set(s.id, next)
    }
  }
}

function rowFromBalances(
  year: number,
  xKey: string,
  label: string,
  kind: OverviewChartRow['kind'],
  isNow: boolean,
  series: OverviewSeries[],
  balances: Map<string, number>,
  extra?: { income?: number; draw?: number; fromAssets?: number; surplus?: number },
): OverviewChartRow {
  const row: OverviewChartRow = {
    year,
    xKey,
    label,
    kind,
    isNow,
    total: 0,
  }
  let total = 0
  for (const s of series) {
    const v = balances.get(s.id) ?? 0
    const safe = Number.isFinite(v) && v > 0 ? v : 0
    row[s.id] = safe
    total += safe
  }
  row.total = total
  if (extra?.income != null) row.__income = extra.income
  if (extra?.draw != null) row.__draw = extra.draw
  if (extra?.fromAssets != null) row.__fromAssets = extra.fromAssets
  if (extra?.surplus != null) row.__surplus = extra.surplus
  return row
}

const RUNWAY_ASSET_TYPES = new Set(['incomeLeftover', 'portfolio', 'savings', 'manual'])

export function runwayAssetSeries(series: OverviewSeries[]): OverviewSeries[] {
  return enabledSeries(series).filter((s) => RUNWAY_ASSET_TYPES.has(s.type))
}

/**
 * Past years = modeled stack including leftover.
 * Now = live including leftover.
 * Current/future = grow from Now, then spend (income first; gap from assets).
 */
export function buildRunwayChartRows(
  state: { startYear: number; endYear: number; series: OverviewSeries[] },
  deps: OverviewBuildDeps,
  config: OverviewRunwayConfig,
): OverviewChartRow[] {
  const asOf = deps.asOf ?? new Date()
  const currentYear = asOf.getFullYear()
  const years = yearsInRange(state.startYear, state.endYear, asOf)
  const active = runwayAssetSeries(state.series)
  const scoped = withOverviewContext(deps, state.series)

  const balances = new Map<string, number>()
  for (const s of active) {
    balances.set(s.id, seriesValueChfNow(s, scoped))
  }

  const nowRow = (): OverviewChartRow =>
    rowFromBalances(currentYear, 'now', 'Now', 'now', true, active, new Map(balances))

  const pastRow = (year: number): OverviewChartRow => {
    const snap = new Map<string, number>()
    for (const s of active) snap.set(s.id, seriesValueChf(s, year, scoped))
    return rowFromBalances(year, String(year), String(year), yearKind(year, asOf), false, active, snap)
  }

  const leftoverSeries =
    active.find((s) => s.type === 'incomeLeftover') ??
    state.series.find((s) => s.type === 'incomeLeftover') ??
    null
  if (leftoverSeries && !balances.has(leftoverSeries.id)) {
    balances.set(leftoverSeries.id, seriesValueChfNow(leftoverSeries, scoped))
    if (!active.some((s) => s.id === leftoverSeries.id)) active.push(leftoverSeries)
  }

  const rows: OverviewChartRow[] = []
  let nowInserted = false
  let prevGrow: 'now' | number = 'now'
  let leftoverCopy = leftoverSeries ? (balances.get(leftoverSeries.id) ?? 0) : 0
  let leftoverSurplus = 0

  for (const year of years) {
    if (!nowInserted && year >= currentYear) {
      rows.push(nowRow())
      nowInserted = true
    }
    if (year < currentYear) {
      rows.push(pastRow(year))
      continue
    }
    growBalances(balances, active, prevGrow, year, scoped)
    const { income, draw } = runwayIncomeDrawForYear(config, year, scoped.incomeCostLines)
    const gap = Math.max(0, draw - income)
    const yearSurplus = Math.max(0, income - draw)

    let leftoverTake = 0
    if (leftoverSeries) {
      leftoverCopy = stepRunwayLeftoverPile(leftoverCopy, leftoverSeries, prevGrow, year, scoped)
      leftoverTake = Math.min(leftoverCopy, gap)
      leftoverCopy = Math.max(0, leftoverCopy - leftoverTake)
      leftoverSurplus += yearSurplus
      balances.set(leftoverSeries.id, leftoverCopy + leftoverSurplus)
    }

    const rest = active.filter((s) => s.type !== 'incomeLeftover')
    const fromAssets =
      leftoverTake + takeFromAssets(balances, rest, deps.savingsAccounts, gap - leftoverTake)
    rows.push(
      rowFromBalances(year, String(year), String(year), yearKind(year, asOf), false, active, balances, {
        income,
        draw,
        fromAssets,
        surplus: yearSurplus,
      }),
    )
    prevGrow = year
  }
  if (!nowInserted) {
    rows.push(nowRow())
  }
  return rows
}

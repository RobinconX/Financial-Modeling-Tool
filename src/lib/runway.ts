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
  return { periods: [defaultRunwayPeriod(asOf.getFullYear())], drawOrder: [] }
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

function parseDrawOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of raw) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function normalizeRunwayConfig(raw: unknown): OverviewRunwayConfig {
  const cy = new Date().getFullYear()
  const drawOrder = isRecord(raw) ? parseDrawOrder(raw.drawOrder) : []
  if (isRecord(raw) && Array.isArray(raw.periods)) {
    const periods = raw.periods
      .map((p) => normalizePeriod(p, cy))
      .filter((p): p is OverviewRunwayPeriod => p != null)
      .sort((a, b) => a.startYear - b.startYear)
    return {
      periods: periods.length > 0 ? periods : defaultRunwayConfig().periods,
      drawOrder,
    }
  }
  // Legacy single-block config
  if (isRecord(raw) && (raw.incomeSource != null || raw.drawMode != null || raw.manualIncomeChf != null)) {
    const p = normalizePeriod({ ...raw, startYear: cy, mode: raw.incomeSource }, cy)
    return { periods: p ? [p] : defaultRunwayConfig().periods, drawOrder }
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

export function defaultDrawRank(s: OverviewSeries, accounts: SavingsAccount[]): number {
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

/** Locked in years before `drawLockedUntilYear`. That year and after are drawable. */
export function seriesDrawLocked(s: OverviewSeries, year: number): boolean {
  const lock = s.drawLockedUntilYear
  return lock != null && Number.isFinite(lock) && year < lock
}

/** Conservative: pay from last year’s leftover, then compound what remains. */
export function seriesDrawsBeforeGrowth(s: OverviewSeries): boolean {
  return s.drawTiming === 'drawFirst'
}

/** Draw order: configured ids first, then remaining by leftover → cash → savings → portfolios → manuals. */
export function resolveRunwayDrawOrder(
  series: OverviewSeries[],
  config: OverviewRunwayConfig,
  accounts: SavingsAccount[],
): OverviewSeries[] {
  const byId = new Map(series.map((s) => [s.id, s]))
  const out: OverviewSeries[] = []
  const seen = new Set<string>()
  for (const id of config.drawOrder ?? []) {
    const s = byId.get(id)
    if (!s || seen.has(s.id)) continue
    out.push(s)
    seen.add(s.id)
  }
  const rest = series
    .filter((s) => !seen.has(s.id))
    .sort(
      (a, b) =>
        defaultDrawRank(a, accounts) - defaultDrawRank(b, accounts) ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id),
    )
  return [...out, ...rest]
}

/** Take `gap` from balances: leftover, cash, other savings, portfolios, manuals. */
export function takeFromAssets(
  balances: Map<string, number>,
  series: OverviewSeries[],
  accounts: SavingsAccount[],
  gap: number,
): number {
  if (!(gap > 0)) return 0
  const order = resolveRunwayDrawOrder(series, { periods: [], drawOrder: [] }, accounts)
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

/** Last year that still receives additions on the growth-only path (toYear inflows are separate). */
function growStopAddsYear(
  series: OverviewSeries,
  from: 'now' | number,
  toYear: number,
): number {
  const fromStop = from === 'now' ? toYear - 1 : from
  const existing = series.contributeUntilYear
  if (existing != null && Number.isFinite(existing)) return Math.min(existing, fromStop)
  return fromStop
}

export type RunwaySeriesFlow = {
  id: string
  name: string
  type: OverviewSeries['type']
  start: number
  growth: number
  inflow: number
  surplus: number
  drawn: number
  end: number
  /** drawFirst = taken before this year’s growth; growFirst = after. */
  drawTiming: 'growFirst' | 'drawFirst'
}

export type RunwayYearFlow = {
  year: number
  from: 'now' | number
  income: number
  draw: number
  fromAssets: number
  surplus: number
  series: RunwaySeriesFlow[]
}

function applySeriesGrow(
  s: OverviewSeries,
  cur: number,
  from: 'now' | number,
  toYear: number,
  deps: OverviewBuildDeps,
): { next: number; growth: number; inflow: number } {
  const prev = from === 'now' ? seriesValueChfNow(s, deps) : seriesValueChf(s, from, deps)
  const nextOv = seriesValueChf(s, toYear, deps)
  const growthOnly = seriesValueChf(
    { ...s, contributeUntilYear: growStopAddsYear(s, from, toYear) },
    toYear,
    deps,
  )
  const inflow = Math.max(0, nextOv - growthOnly)
  if (prev > 0 && Number.isFinite(growthOnly / prev)) {
    const next = Math.max(0, cur * (growthOnly / prev) + inflow)
    return { next, growth: next - cur - inflow, inflow }
  }
  if (nextOv > 0 && cur === 0) {
    return { next: nextOv, growth: 0, inflow: nextOv }
  }
  return { next: cur, growth: 0, inflow: 0 }
}

function leftoverStepSplit(
  leftover: OverviewSeries,
  pile: number,
  from: 'now' | number,
  toYear: number,
  deps: OverviewBuildDeps,
): { next: number; growth: number; inflow: number } {
  const next = stepRunwayLeftoverPile(pile, leftover, from, toYear, deps)
  const applied = next - pile
  const nextOv = seriesValueChf(leftover, toYear, deps)
  const growthOnly = seriesValueChf(
    { ...leftover, contributeUntilYear: growStopAddsYear(leftover, from, toYear) },
    toYear,
    deps,
  )
  const inflow = Math.max(0, nextOv - growthOnly)
  return { next, growth: applied - inflow, inflow }
}

export const RUNWAY_DRAWN_PREFIX = '__d_'

export function runwayDrawnFromRow(
  row: OverviewChartRow,
): { id: string; amount: number }[] {
  const out: { id: string; amount: number }[] = []
  for (const [k, v] of Object.entries(row)) {
    if (!k.startsWith(RUNWAY_DRAWN_PREFIX) || typeof v !== 'number' || !(v > 0)) continue
    out.push({ id: k.slice(RUNWAY_DRAWN_PREFIX.length), amount: v })
  }
  return out
}

function rowFromBalances(
  year: number,
  xKey: string,
  label: string,
  kind: OverviewChartRow['kind'],
  isNow: boolean,
  series: OverviewSeries[],
  balances: Map<string, number>,
  extra?: {
    income?: number
    draw?: number
    fromAssets?: number
    surplus?: number
    drawn?: Record<string, number>
  },
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
  if (extra?.drawn) {
    for (const [id, amt] of Object.entries(extra.drawn)) {
      if (amt > 0) row[`${RUNWAY_DRAWN_PREFIX}${id}`] = amt
    }
  }
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
 * Deficit walks draw order. Before/after growth only changes when that pile is tapped.
 */
export function buildRunwayModel(
  state: { startYear: number; endYear: number; series: OverviewSeries[] },
  deps: OverviewBuildDeps,
  config: OverviewRunwayConfig,
): { rows: OverviewChartRow[]; flows: Map<number, RunwayYearFlow> } {
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
  const flows = new Map<number, RunwayYearFlow>()
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

    const startById = new Map(balances)
    const leftoverStartCopy = leftoverCopy
    const leftoverStartSurplus = leftoverSurplus
    const { income, draw } = runwayIncomeDrawForYear(config, year, scoped.incomeCostLines)
    const gap = Math.max(0, draw - income)
    const yearSurplus = Math.max(0, income - draw)
    const order = resolveRunwayDrawOrder(active, config, deps.savingsAccounts)
    const grownFromStart = new Map<string, { next: number; growth: number; inflow: number }>()
    for (const s of active) {
      if (s.type === 'incomeLeftover') continue
      grownFromStart.set(
        s.id,
        applySeriesGrow(s, startById.get(s.id) ?? 0, prevGrow, year, scoped),
      )
    }
    let leftoverGrown = leftoverStartCopy
    let leftoverGrowth = 0
    let leftoverInflow = 0
    if (leftoverSeries) {
      const stepped = leftoverStepSplit(
        leftoverSeries,
        leftoverStartCopy,
        prevGrow,
        year,
        scoped,
      )
      leftoverGrown = stepped.next
      leftoverGrowth = stepped.growth
      leftoverInflow = stepped.inflow
    }
    const leftoverDrawFirst = leftoverSeries ? seriesDrawsBeforeGrowth(leftoverSeries) : false
    let leftoverPile = leftoverDrawFirst ? leftoverStartCopy : leftoverGrown

    const drawn: Record<string, number> = {}
    let left = gap
    for (const s of order) {
      if (!(left > 0)) break
      if (seriesDrawLocked(s, year)) continue
      if (s.type === 'incomeLeftover') {
        const take = Math.min(leftoverPile, left)
        leftoverPile -= take
        left -= take
        if (take > 0) drawn[s.id] = take
        continue
      }
      const have = seriesDrawsBeforeGrowth(s)
        ? (startById.get(s.id) ?? 0)
        : (grownFromStart.get(s.id)?.next ?? 0)
      const take = Math.min(have, left)
      left -= take
      if (take > 0) drawn[s.id] = take
    }

    const deltas = new Map<string, { growth: number; inflow: number }>()
    for (const s of active) {
      if (s.type === 'incomeLeftover') continue
      const take = drawn[s.id] ?? 0
      if (seriesDrawsBeforeGrowth(s)) {
        const remaining = Math.max(0, (startById.get(s.id) ?? 0) - take)
        const g = applySeriesGrow(s, remaining, prevGrow, year, scoped)
        balances.set(s.id, g.next)
        deltas.set(s.id, { growth: g.growth, inflow: g.inflow })
      } else {
        const g = grownFromStart.get(s.id) ?? { next: 0, growth: 0, inflow: 0 }
        balances.set(s.id, Math.max(0, g.next - take))
        deltas.set(s.id, { growth: g.growth, inflow: g.inflow })
      }
    }

    if (leftoverSeries) {
      if (leftoverDrawFirst) {
        const stepped = leftoverStepSplit(leftoverSeries, leftoverPile, prevGrow, year, scoped)
        leftoverCopy = stepped.next
        leftoverGrowth = stepped.growth
        leftoverInflow = stepped.inflow
      } else {
        leftoverCopy = leftoverPile
      }
      leftoverSurplus += yearSurplus
      balances.set(leftoverSeries.id, leftoverCopy + leftoverSurplus)
    }
    const fromAssets = gap - left
    rows.push(
      rowFromBalances(year, String(year), String(year), yearKind(year, asOf), false, active, balances, {
        income,
        draw,
        fromAssets,
        surplus: yearSurplus,
        drawn,
      }),
    )

    const seriesFlows: RunwaySeriesFlow[] = []
    for (const s of order) {
      if (s.type === 'incomeLeftover') {
        const start = leftoverStartCopy + leftoverStartSurplus
        const end = leftoverCopy + leftoverSurplus
        const take = drawn[s.id] ?? 0
        if (start === 0 && leftoverGrowth === 0 && leftoverInflow === 0 && yearSurplus === 0 && take === 0 && end === 0) {
          continue
        }
        seriesFlows.push({
          id: s.id,
          name: s.name.trim() || 'Leftover',
          type: s.type,
          start,
          growth: leftoverGrowth,
          inflow: leftoverInflow,
          surplus: yearSurplus,
          drawn: take,
          end,
          drawTiming: seriesDrawsBeforeGrowth(s) ? 'drawFirst' : 'growFirst',
        })
        continue
      }
      const start = startById.get(s.id) ?? 0
      const d = deltas.get(s.id) ?? { growth: 0, inflow: 0 }
      const take = drawn[s.id] ?? 0
      const end = balances.get(s.id) ?? 0
      if (start === 0 && d.growth === 0 && d.inflow === 0 && take === 0 && end === 0) continue
      seriesFlows.push({
        id: s.id,
        name: s.name.trim() || s.id,
        type: s.type,
        start,
        growth: d.growth,
        inflow: d.inflow,
        surplus: 0,
        drawn: take,
        end,
        drawTiming: seriesDrawsBeforeGrowth(s) ? 'drawFirst' : 'growFirst',
      })
    }
    flows.set(year, {
      year,
      from: prevGrow,
      income,
      draw,
      fromAssets,
      surplus: yearSurplus,
      series: seriesFlows,
    })
    prevGrow = year
  }
  if (!nowInserted) {
    rows.push(nowRow())
  }
  return { rows, flows }
}

export function buildRunwayChartRows(
  state: { startYear: number; endYear: number; series: OverviewSeries[] },
  deps: OverviewBuildDeps,
  config: OverviewRunwayConfig,
): OverviewChartRow[] {
  return buildRunwayModel(state, deps, config).rows
}

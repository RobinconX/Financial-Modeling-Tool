import type { ComparableBasis, ComparableEntry, SavedScenario } from '../types'
import {
  availableBases,
  currentMcapForScenario,
  pruneComparableEntries,
  priceNowForScenario,
  sharesForScenario,
} from './comparables'
import { impliedSharePrice } from './sharePrice'
import {
  buildAdvancedProjections,
  cagr,
  yearsUntilProjectionEnd,
} from './valuation'

export const PREFERRED_GOAL_YEAR = 2030

export type GoalGapRow = {
  scenarioId: string
  symbol: string
  scenarioName: string
  label: string
  currency: string
  basis: ComparableBasis
  spot: number | null
  /** Horizon used for this row; null when this basis has no projection at `goalYear`. */
  goalYear: number | null
  goalPrice: number | null
  upside: number | null
  cagr: number | null
}

export type GoalPathMetric = 'upside' | 'cagr'

export type PriceClose = {
  date: string
  close: number
}

export type UpsidePoint = {
  date: string
  upside: number
}

export function statedEasyYears(sc: SavedScenario): number[] {
  const years: number[] = []
  for (const r of sc.easyRows ?? []) {
    if (r.projectedMarketCap != null && r.projectedMarketCap > 0 && Number.isFinite(r.year)) {
      years.push(Math.floor(r.year))
    }
  }
  return [...new Set(years)].sort((a, b) => a - b)
}

/** 2030 if present, else the latest stated Easy year. */
export function defaultGoalYear(
  years: number[],
  prefer = PREFERRED_GOAL_YEAR,
): number | null {
  if (years.length === 0) return null
  if (years.includes(prefer)) return prefer
  return years[years.length - 1]!
}

export function easyGoalPrice(sc: SavedScenario, year: number): number | null {
  const row = (sc.easyRows ?? []).find((r) => r.year === year)
  if (row?.projectedMarketCap == null || !(row.projectedMarketCap > 0)) return null
  return impliedSharePrice(row.projectedMarketCap, sharesForScenario(sc))
}

export function statedYearsForBasis(
  sc: SavedScenario,
  basis: ComparableBasis,
  asOf: Date | number = new Date(),
): number[] {
  if (basis === 'easy') return statedEasyYears(sc)
  const mcap = currentMcapForScenario(sc)
  if (mcap == null || mcap <= 0) return []
  const years = buildAdvancedProjections(mcap, sc.advancedRows, asOf)
    .filter((r) => r.basis === basis)
    .map((r) => r.year)
  return [...new Set(years)].sort((a, b) => a - b)
}

/** Share-price goal for the selected basis at a stated year (Easy or PS/PFCF/PE). */
export function goalPriceForBasis(
  sc: SavedScenario,
  basis: ComparableBasis,
  year: number,
  asOf: Date | number = new Date(),
): number | null {
  if (basis === 'easy') return easyGoalPrice(sc, year)
  const mcap = currentMcapForScenario(sc)
  if (mcap == null || mcap <= 0) return null
  const row = buildAdvancedProjections(mcap, sc.advancedRows, asOf).find(
    (r) => r.basis === basis && r.year === year,
  )
  if (!row || !(row.equityValue > 0)) return null
  return impliedSharePrice(row.equityValue, sharesForScenario(sc))
}

export function remainingUpside(goal: number, spot: number): number | null {
  if (!(goal > 0) || !(spot > 0) || !Number.isFinite(goal) || !Number.isFinite(spot)) {
    return null
  }
  return goal / spot - 1
}

export function unionEasyYears(
  entries: ComparableEntry[],
  scenarios: SavedScenario[],
): number[] {
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const set = new Set<number>()
  for (const e of pruneComparableEntries(entries, scenarios)) {
    const sc = byId.get(e.scenarioId)
    if (!sc) continue
    const avail = availableBases(sc)
    const basis = avail.includes(e.basis) ? e.basis : (avail[0] ?? e.basis)
    for (const y of statedYearsForBasis(sc, basis)) set.add(y)
  }
  return [...set].sort((a, b) => a - b)
}

export function resolveGoalYear(
  stored: number | null | undefined,
  years: number[],
): number | null {
  if (stored != null && years.includes(stored)) return stored
  return defaultGoalYear(years)
}

export function buildGoalGapTable(
  entries: ComparableEntry[],
  scenarios: SavedScenario[],
  goalYear: number | null,
  asOf: Date | number = new Date(),
): GoalGapRow[] {
  const asOfDate = typeof asOf === 'number' ? new Date(asOf, 0, 1) : asOf
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const rows: GoalGapRow[] = []

  for (const e of pruneComparableEntries(entries, scenarios)) {
    const sc = byId.get(e.scenarioId)
    if (!sc) continue
    const avail = availableBases(sc, asOfDate.getFullYear())
    const basis = avail.includes(e.basis) ? e.basis : (avail[0] ?? e.basis)
    const spot = priceNowForScenario(sc)
    const hasYear =
      goalYear != null && statedYearsForBasis(sc, basis, asOfDate).includes(goalYear)
    const year = hasYear ? goalYear : null
    const goalPrice = year != null ? goalPriceForBasis(sc, basis, year, asOfDate) : null
    const upside =
      goalPrice != null && spot != null ? remainingUpside(goalPrice, spot) : null
    let cagrVal: number | null = null
    if (year != null && goalPrice != null && spot != null && spot > 0 && goalPrice > 0) {
      const yrs = yearsUntilProjectionEnd(year, asOfDate)
      const r = cagr(spot, goalPrice, yrs)
      cagrVal = Number.isFinite(r) ? r : null
    }
    rows.push({
      scenarioId: sc.id,
      symbol: sc.symbol,
      scenarioName: sc.name,
      label: `${sc.symbol} / ${sc.name}`,
      currency: sc.currency || 'USD',
      basis,
      spot,
      goalYear: year,
      goalPrice,
      upside,
      cagr: cagrVal,
    })
  }
  return rows
}

export type GoalGapSortKey = 'upside' | 'cagr'

export function sortGoalGapRows(
  rows: GoalGapRow[],
  sortKey: GoalGapSortKey,
  sortDir: 'desc' | 'asc',
): GoalGapRow[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortKey === 'cagr' ? a.cagr : a.upside
    const bv = sortKey === 'cagr' ? b.cagr : b.upside
    const aOk = av != null && Number.isFinite(av)
    const bOk = bv != null && Number.isFinite(bv)
    if (aOk && bOk && av !== bv) return av < bv ? -dir : dir
    if (aOk !== bOk) return aOk ? -1 : 1
    return a.symbol.localeCompare(b.symbol) || a.scenarioName.localeCompare(b.scenarioName)
  })
}

function parseCloseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

/** Local calendar YYYY-MM-DD (same clock as table CAGR). */
export function localIsoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pointAtPrice(
  goal: number,
  price: number,
  date: string,
  metric: GoalPathMetric,
  goalYear: number,
): UpsidePoint | null {
  if (!(price > 0) || !Number.isFinite(price)) return null
  if (metric === 'upside') {
    const u = remainingUpside(goal, price)
    return u == null ? null : { date, upside: u }
  }
  const yrs = yearsUntilProjectionEnd(goalYear, parseCloseDate(date))
  const r = cagr(price, goal, yrs)
  if (!Number.isFinite(r)) return null
  return { date, upside: r }
}

export function upsideSeries(goal: number, closes: PriceClose[]): UpsidePoint[] {
  return pathSeries(goal, closes, 'upside', 2030)
}

/**
 * Remaining upside or CAGR from each close to a fixed goal at year-end.
 * `current` replaces any close on that date so the last point matches the table.
 */
export function pathSeries(
  goal: number,
  closes: PriceClose[],
  metric: GoalPathMetric,
  goalYear: number,
  current?: { date: string; price: number } | null,
): UpsidePoint[] {
  if (!(goal > 0) || !Number.isFinite(goal)) return []
  const skipDate = current?.date
  const out: UpsidePoint[] = []
  for (const p of closes) {
    if (skipDate && p.date === skipDate) continue
    const pt = pointAtPrice(goal, p.close, p.date, metric, goalYear)
    if (pt) out.push(pt)
  }
  if (current != null) {
    const nowPt = pointAtPrice(goal, current.price, current.date, metric, goalYear)
    if (nowPt) out.push(nowPt)
  }
  return out
}

export type NamedUpsideSeries = {
  key: string
  name: string
  points: UpsidePoint[]
}

export type MergedUpsideRow = {
  date: string
  [key: string]: string | number | null
}

/** Union of dates; missing series values are null (chart connectNulls). */
export function mergeUpsideSeries(series: NamedUpsideSeries[]): MergedUpsideRow[] {
  const dates = new Set<string>()
  const maps = series.map((s) => {
    const m = new Map<string, number>()
    for (const p of s.points) {
      dates.add(p.date)
      m.set(p.date, p.upside)
    }
    return m
  })
  const sorted = [...dates].sort()
  return sorted.map((date) => {
    const row: MergedUpsideRow = { date }
    series.forEach((s, i) => {
      row[s.key] = maps[i]!.get(date) ?? null
    })
    return row
  })
}

import type { ComparableEntry, SavedScenario } from '../types'
import { pruneComparableEntries, priceNowForScenario, sharesForScenario } from './comparables'
import { impliedSharePrice } from './sharePrice'
import { cagr, yearsUntilProjectionEnd } from './valuation'

export const PREFERRED_GOAL_YEAR = 2030

export type GoalGapRow = {
  scenarioId: string
  symbol: string
  scenarioName: string
  label: string
  currency: string
  spot: number | null
  /** Horizon used for this row; null when the scenario has no Easy at `goalYear`. */
  goalYear: number | null
  goalPrice: number | null
  upside: number | null
  cagr: number | null
}

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
    for (const y of statedEasyYears(sc)) set.add(y)
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
    const spot = priceNowForScenario(sc)
    const hasYear = goalYear != null && statedEasyYears(sc).includes(goalYear)
    const year = hasYear ? goalYear : null
    const goalPrice = year != null ? easyGoalPrice(sc, year) : null
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

export function upsideSeries(goal: number, closes: PriceClose[]): UpsidePoint[] {
  if (!(goal > 0) || !Number.isFinite(goal)) return []
  const out: UpsidePoint[] = []
  for (const p of closes) {
    if (!(p.close > 0) || !Number.isFinite(p.close)) continue
    out.push({ date: p.date, upside: goal / p.close - 1 })
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

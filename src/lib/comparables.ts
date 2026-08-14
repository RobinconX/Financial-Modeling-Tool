import type {
  ComparableBasis,
  ComparableEntry,
  SavedComparable,
  SavedScenario,
} from '../types'
import {
  impliedSharePrice,
  resolveSharesOutstanding,
  effectiveMarketCap,
} from './sharePrice'
import {
  buildAdvancedProjections,
  buildEasyProjections,
} from './valuation'

export type ComparableYearCell = {
  year: number
  price: number | null
  roi: number | null
  /** Annualized return from today to year-end of this projection year. */
  cagr: number | null
}

export type ComparableTableRow = {
  scenarioId: string
  symbol: string
  scenarioName: string
  label: string
  currency: string
  basis: ComparableBasis
  priceNow: number | null
  shares: number | null
  byYear: Record<number, ComparableYearCell>
}

export type ComparableTable = {
  years: number[]
  rows: ComparableTableRow[]
}

export function isComparableBasis(v: unknown): v is ComparableBasis {
  return v === 'easy' || v === 'ps' || v === 'pfcf' || v === 'pe'
}

export function newComparable(name: string, sortOrderHint = 0): SavedComparable {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: name.trim() || `Comparable ${sortOrderHint + 1}`,
    entries: [],
    sortYear: null,
    sortDir: 'desc',
    filterYears: [],
    createdAt: now,
    updatedAt: now,
  }
}

export { yearsUntilProjectionEnd } from './valuation'

function asOfDate(asOf: Date | number): Date {
  return typeof asOf === 'number' ? new Date(asOf, 0, 1) : asOf
}

/** Years in [from, to] that exist in `allYears`. */
export function yearsInPeriod(
  allYears: number[],
  from: number | null,
  to: number | null,
): number[] {
  const lo = from != null && Number.isFinite(from) ? from : -Infinity
  const hi = to != null && Number.isFinite(to) ? to : Infinity
  return allYears.filter((y) => y >= lo && y <= hi)
}

/**
 * Visible year columns. Empty / null = none — user opts in.
 * Unknown years are dropped.
 */
export function visibleComparableYears(
  allYears: number[],
  filterYears: number[] | null | undefined,
): number[] {
  if (!filterYears || filterYears.length === 0) return []
  const want = new Set(filterYears.filter((y) => Number.isFinite(y)))
  return allYears.filter((y) => want.has(y))
}

/** Sorted unique years that exist on the table. Empty is a valid “show none”. */
export function normalizeFilterYears(
  years: number[],
  allYears: number[],
): number[] {
  return [...new Set(years.filter((y) => Number.isFinite(y)).map((y) => Math.floor(y)))]
    .filter((y) => allYears.includes(y))
    .sort((a, b) => a - b)
}

export function currentMcapForScenario(sc: SavedScenario): number | null {
  return effectiveMarketCap(sc.mcapOverride, sc.currentMarketCap)
}

export function sharesForScenario(sc: SavedScenario): number | null {
  return resolveSharesOutstanding({
    sharesOutstanding: sc.sharesOutstanding,
    marketCap: sc.currentMarketCap,
    price: sc.currentPrice,
    mcapOverride: sc.mcapOverride,
  })
}

export function priceNowForScenario(sc: SavedScenario): number | null {
  // Live quote wins unless the user overrode mcap (implied from override).
  if (sc.mcapOverride != null && sc.mcapOverride > 0) {
    return impliedSharePrice(sc.mcapOverride, sharesForScenario(sc))
  }
  if (sc.currentPrice != null && sc.currentPrice > 0) return sc.currentPrice
  return impliedSharePrice(currentMcapForScenario(sc), sharesForScenario(sc))
}

export function availableBases(
  sc: SavedScenario,
  asOfYear = new Date().getFullYear(),
): ComparableBasis[] {
  const mcap = currentMcapForScenario(sc)
  if (mcap == null || mcap <= 0) return []
  const out: ComparableBasis[] = []
  if (buildEasyProjections(mcap, sc.easyRows, asOfYear).length > 0) out.push('easy')
  const adv = buildAdvancedProjections(mcap, sc.advancedRows, asOfYear)
  for (const b of ['ps', 'pfcf', 'pe'] as const) {
    if (adv.some((r) => r.basis === b)) out.push(b)
  }
  return out
}

export function defaultBasisForScenario(
  sc: SavedScenario,
  asOfYear = new Date().getFullYear(),
): ComparableBasis {
  const avail = availableBases(sc, asOfYear)
  return avail[0] ?? 'easy'
}

export function pruneComparableEntries(
  entries: ComparableEntry[],
  scenarios: SavedScenario[],
): ComparableEntry[] {
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const seen = new Set<string>()
  const out: ComparableEntry[] = []
  for (const e of entries) {
    if (!e.scenarioId || seen.has(e.scenarioId)) continue
    if (!byId.has(e.scenarioId)) continue
    seen.add(e.scenarioId)
    out.push({
      scenarioId: e.scenarioId,
      basis: isComparableBasis(e.basis) ? e.basis : 'easy',
    })
  }
  return out
}

function cellsForBasis(
  sc: SavedScenario,
  basis: ComparableBasis,
  shares: number | null,
  asOf: Date,
): Record<number, ComparableYearCell> {
  const mcap = currentMcapForScenario(sc)
  if (mcap == null || mcap <= 0) return {}
  const rows =
    basis === 'easy'
      ? buildEasyProjections(mcap, sc.easyRows, asOf)
      : buildAdvancedProjections(mcap, sc.advancedRows, asOf).filter((r) => r.basis === basis)
  const byYear: Record<number, ComparableYearCell> = {}
  for (const r of rows) {
    const roi = Number.isFinite(r.totalReturn) ? r.totalReturn : null
    byYear[r.year] = {
      year: r.year,
      price: impliedSharePrice(r.equityValue, shares),
      roi,
      cagr: Number.isFinite(r.cagr) ? r.cagr : null,
    }
  }
  return byYear
}

export function buildComparableTable(
  entries: ComparableEntry[],
  scenarios: SavedScenario[],
  asOf: Date | number = new Date(),
): ComparableTable {
  const asOfD = asOfDate(asOf)
  const asOfYear = asOfD.getFullYear()
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const rows: ComparableTableRow[] = []
  const yearSet = new Set<number>()

  for (const e of pruneComparableEntries(entries, scenarios)) {
    const sc = byId.get(e.scenarioId)
    if (!sc) continue
    const avail = availableBases(sc, asOfYear)
    const basis = avail.includes(e.basis) ? e.basis : (avail[0] ?? e.basis)
    const shares = sharesForScenario(sc)
    const byYear = cellsForBasis(sc, basis, shares, asOfD)
    for (const y of Object.keys(byYear)) yearSet.add(Number(y))
    rows.push({
      scenarioId: sc.id,
      symbol: sc.symbol,
      scenarioName: sc.name,
      label: `${sc.symbol} / ${sc.name}`,
      currency: sc.currency || 'USD',
      basis,
      priceNow: priceNowForScenario(sc),
      shares,
      byYear,
    })
  }

  const years = [...yearSet].sort((a, b) => a - b)
  return { years, rows }
}

export function sortComparableRows(
  rows: ComparableTableRow[],
  sortYear: number | null,
  sortDir: 'desc' | 'asc',
): ComparableTableRow[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sortYear != null) {
      const av = a.byYear[sortYear]?.roi
      const bv = b.byYear[sortYear]?.roi
      const aOk = av != null && Number.isFinite(av)
      const bOk = bv != null && Number.isFinite(bv)
      if (aOk && bOk && av !== bv) return av < bv ? -dir : dir
      if (aOk !== bOk) return aOk ? -1 : 1
    }
    return a.symbol.localeCompare(b.symbol) || a.scenarioName.localeCompare(b.scenarioName)
  })
}

export function formatShareCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(2)}K`
  return abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
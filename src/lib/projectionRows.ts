import type { ProjectionRow, ValuationBasis } from '../types'
import { normalizeFilterYears, yearsInPeriod } from './comparables'

export type ProjectionSortKey = 'year' | 'basis' | 'roi'
export type ProjectionSortDir = 'asc' | 'desc'

const BASIS_ORDER: Record<ValuationBasis | 'easy', number> = {
  easy: 0,
  ps: 1,
  pfcf: 2,
  pe: 3,
}

export function uniqueProjectionYears(rows: ProjectionRow[]): number[] {
  return [...new Set(rows.map((r) => r.year).filter((y) => Number.isFinite(y)))].sort(
    (a, b) => a - b,
  )
}

/**
 * Years to show. `null` = all (default). Empty array = none.
 * Unknown years are dropped. If every selected year disappeared, fall back to all.
 */
export function visibleProjectionYears(
  allYears: number[],
  filterYears: number[] | null,
): number[] {
  if (filterYears == null) return allYears
  const next = normalizeFilterYears(filterYears, allYears)
  if (filterYears.length > 0 && next.length === 0) return allYears
  return next
}

export function pruneProjectionFilterYears(
  filterYears: number[] | null,
  allYears: number[],
): number[] | null {
  if (filterYears == null) return null
  const next = normalizeFilterYears(filterYears, allYears)
  if (filterYears.length > 0 && next.length === 0) return null
  return next
}

export function projectionYearsInPeriod(
  allYears: number[],
  from: number,
  to: number,
): number[] {
  return yearsInPeriod(allYears, Math.min(from, to), Math.max(from, to))
}

export function sortProjectionRows(
  rows: ProjectionRow[],
  sortKey: ProjectionSortKey,
  sortDir: ProjectionSortDir,
): ProjectionRow[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let primary = 0
    if (sortKey === 'roi') {
      const aOk = Number.isFinite(a.cagr)
      const bOk = Number.isFinite(b.cagr)
      if (aOk && bOk && a.cagr !== b.cagr) primary = a.cagr < b.cagr ? -1 : 1
      else if (aOk !== bOk) return aOk ? -1 : 1
    } else if (sortKey === 'basis') {
      primary = (BASIS_ORDER[a.basis] ?? 99) - (BASIS_ORDER[b.basis] ?? 99)
    } else {
      primary = a.year - b.year
    }
    if (primary !== 0) return primary * dir
    if (a.year !== b.year) return a.year - b.year
    return (BASIS_ORDER[a.basis] ?? 99) - (BASIS_ORDER[b.basis] ?? 99)
  })
}

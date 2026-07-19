import type {
  EasyProjection,
  ProjectionRow,
  SeriesPoint,
  ValuationBasis,
  YearProjection,
} from '../types'

export function yearsUntil(targetYear: number, fromYear = new Date().getFullYear()): number {
  return targetYear - fromYear
}

/** CAGR: (future / present) ^ (1/years) - 1 */
export function cagr(present: number, future: number, years: number): number {
  if (present <= 0 || future <= 0 || years <= 0) return NaN
  return Math.pow(future / present, 1 / years) - 1
}

export function totalReturn(present: number, future: number): number {
  if (present <= 0) return NaN
  return future / present - 1
}

/** Normalize dilution: default 1 (none); must be > 0 */
export function normalizeDilution(factor: number | null | undefined): number {
  if (factor == null || !Number.isFinite(factor) || factor <= 0) return 1
  return factor
}

/**
 * Shareholder claim on future mcap after dilution.
 * dilutionFactor = future shares / today shares (1.0 = none).
 */
export function equityValueAfterDilution(marketCap: number, dilutionFactor: number): number {
  return marketCap / normalizeDilution(dilutionFactor)
}

export function impliedFromPS(revenue: number, ps: number): number {
  return revenue * ps
}

export function impliedFromPFCF(fcf: number, pfcf: number): number {
  return fcf * pfcf
}

export function impliedFromPE(profit: number, pe: number): number {
  return profit * pe
}

function impliedForBasis(row: YearProjection, basis: ValuationBasis): number | null {
  if (basis === 'ps') {
    if (row.revenue != null && row.psMultiple != null && row.revenue > 0 && row.psMultiple > 0) {
      return impliedFromPS(row.revenue, row.psMultiple)
    }
    return null
  }
  if (basis === 'pfcf') {
    if (row.fcf != null && row.pfcfMultiple != null && row.fcf > 0 && row.pfcfMultiple > 0) {
      return impliedFromPFCF(row.fcf, row.pfcfMultiple)
    }
    return null
  }
  if (row.profit != null && row.peMultiple != null && row.profit > 0 && row.peMultiple > 0) {
    return impliedFromPE(row.profit, row.peMultiple)
  }
  return null
}

export function buildEasyProjections(
  currentMarketCap: number,
  easyRows: EasyProjection[],
  currentYear = new Date().getFullYear(),
): ProjectionRow[] {
  if (currentMarketCap <= 0) return []
  const results: ProjectionRow[] = []

  for (const easy of easyRows) {
    if (easy.projectedMarketCap == null || easy.projectedMarketCap <= 0) continue
    const years = yearsUntil(easy.year, currentYear)
    if (years <= 0) continue
    results.push({
      year: easy.year,
      basis: 'easy',
      marketCap: easy.projectedMarketCap,
      equityValue: easy.projectedMarketCap,
      dilutionFactor: 1,
      totalReturn: totalReturn(currentMarketCap, easy.projectedMarketCap),
      cagr: cagr(currentMarketCap, easy.projectedMarketCap, years),
      years,
    })
  }

  return results.sort((a, b) => a.year - b.year)
}

export function buildAdvancedProjections(
  currentMarketCap: number,
  rows: YearProjection[],
  currentYear = new Date().getFullYear(),
): ProjectionRow[] {
  if (currentMarketCap <= 0) return []
  const results: ProjectionRow[] = []
  const bases: ValuationBasis[] = ['ps', 'pfcf', 'pe']

  for (const row of rows) {
    const years = yearsUntil(row.year, currentYear)
    if (years <= 0) continue
    const dilution = normalizeDilution(row.dilutionFactor)
    for (const basis of bases) {
      const mcap = impliedForBasis(row, basis)
      if (mcap == null || mcap <= 0) continue
      // Shareholder return is diluted: mcap grows for the firm, but more shares outstanding
      const equityValue = equityValueAfterDilution(mcap, dilution)
      results.push({
        year: row.year,
        basis,
        marketCap: mcap,
        equityValue,
        dilutionFactor: dilution,
        totalReturn: totalReturn(currentMarketCap, equityValue),
        cagr: cagr(currentMarketCap, equityValue, years),
        years,
      })
    }
  }

  return results.sort((a, b) => a.year - b.year || a.basis.localeCompare(b.basis))
}

type ChartSeriesKey = 'easy' | 'ps' | 'pfcf' | 'pe'

function linearInterpolate(
  known: { year: number; value: number }[],
  year: number,
): number | null {
  if (known.length === 0) return null
  const sorted = [...known].sort((a, b) => a.year - b.year)
  if (year <= sorted[0].year) return sorted[0].value
  if (year >= sorted[sorted.length - 1].year) return sorted[sorted.length - 1].value
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (year >= a.year && year <= b.year) {
      if (b.year === a.year) return a.value
      const t = (year - a.year) / (b.year - a.year)
      return a.value + t * (b.value - a.value)
    }
  }
  return null
}

/**
 * Expand sparse year → value maps into a continuous year axis (inclusive),
 * linearly interpolating between known points so time spacing is correct.
 */
function expandContinuousSeries(
  sparse: Map<number, SeriesPoint>,
  keys: ChartSeriesKey[],
  fromYear: number,
  toYear: number,
): SeriesPoint[] {
  if (toYear < fromYear) return []

  const knownByKey = new Map<ChartSeriesKey, { year: number; value: number }[]>()
  for (const key of keys) {
    const pts: { year: number; value: number }[] = []
    for (const p of sparse.values()) {
      const v = p[key]
      if (v != null && Number.isFinite(v)) pts.push({ year: p.year, value: v })
    }
    knownByKey.set(key, pts.sort((a, b) => a.year - b.year))
  }

  const result: SeriesPoint[] = []
  for (let year = fromYear; year <= toYear; year++) {
    const point: SeriesPoint = { year, current: sparse.get(year)?.current }
    for (const key of keys) {
      const known = knownByKey.get(key) ?? []
      if (known.length === 0) continue
      const actual = sparse.get(year)?.[key]
      if (actual != null && Number.isFinite(actual)) {
        point[key] = actual
        if (key === 'easy') point.easyActual = true
        if (key === 'ps') point.psActual = true
        if (key === 'pfcf') point.pfcfActual = true
        if (key === 'pe') point.peActual = true
      } else {
        const interp = linearInterpolate(known, year)
        if (interp != null) point[key] = interp
      }
    }
    result.push(point)
  }
  return result
}

export function buildChartSeries(
  currentMarketCap: number,
  mode: 'easy' | 'advanced',
  easyRows: EasyProjection[],
  advancedRows: YearProjection[],
  currentYear = new Date().getFullYear(),
): SeriesPoint[] {
  if (currentMarketCap <= 0) return []

  const sparse = new Map<number, SeriesPoint>()
  sparse.set(currentYear, { year: currentYear, current: currentMarketCap })

  if (mode === 'easy') {
    let maxYear = currentYear
    for (const easy of easyRows) {
      if (
        easy.projectedMarketCap == null ||
        easy.projectedMarketCap <= 0 ||
        easy.year <= currentYear
      ) {
        continue
      }
      maxYear = Math.max(maxYear, easy.year)
      const point = sparse.get(easy.year) ?? { year: easy.year }
      point.easy = easy.projectedMarketCap
      point.easyActual = true
      sparse.set(easy.year, point)
    }
    if (maxYear <= currentYear) return [{ year: currentYear, current: currentMarketCap }]

    const start = sparse.get(currentYear)!
    start.easy = currentMarketCap
    start.easyActual = true

    return expandContinuousSeries(sparse, ['easy'], currentYear, maxYear)
  }

  const start = sparse.get(currentYear)!
  let maxYear = currentYear
  let hasPs = false
  let hasPfcf = false
  let hasPe = false

  for (const row of sortYearProjections(advancedRows)) {
    if (row.year <= currentYear) continue
    const ps = impliedForBasis(row, 'ps')
    const pfcf = impliedForBasis(row, 'pfcf')
    const pe = impliedForBasis(row, 'pe')
    if (ps == null && pfcf == null && pe == null) continue

    maxYear = Math.max(maxYear, row.year)
    const point = sparse.get(row.year) ?? { year: row.year }
    if (ps != null) {
      point.ps = ps
      point.psActual = true
      hasPs = true
    }
    if (pfcf != null) {
      point.pfcf = pfcf
      point.pfcfActual = true
      hasPfcf = true
    }
    if (pe != null) {
      point.pe = pe
      point.peActual = true
      hasPe = true
    }
    sparse.set(row.year, point)
  }

  if (maxYear <= currentYear) return [{ year: currentYear, current: currentMarketCap }]

  const keys: ChartSeriesKey[] = []
  if (hasPs) {
    start.ps = currentMarketCap
    start.psActual = true
    keys.push('ps')
  }
  if (hasPfcf) {
    start.pfcf = currentMarketCap
    start.pfcfActual = true
    keys.push('pfcf')
  }
  if (hasPe) {
    start.pe = currentMarketCap
    start.peActual = true
    keys.push('pe')
  }
  if (keys.length === 0) return [{ year: currentYear, current: currentMarketCap }]

  return expandContinuousSeries(sparse, keys, currentYear, maxYear)
}

/** Sort easy assumption rows by year ascending (stable for equal years). */
export function sortEasyProjections(rows: EasyProjection[]): EasyProjection[] {
  return [...rows].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id))
}

/** Sort advanced assumption rows by year ascending. */
export function sortYearProjections(rows: YearProjection[]): YearProjection[] {
  return [...rows].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id))
}

export function pickHeroRow(
  rows: ProjectionRow[],
  basis: ValuationBasis | 'easy',
): ProjectionRow | null {
  const filtered = rows.filter((r) => r.basis === basis)
  if (filtered.length === 0) return null
  return filtered.reduce((best, r) => (r.year >= best.year ? r : best))
}

export function newYearProjection(
  year?: number,
  dilutionFactor = 1,
): YearProjection {
  return {
    id: crypto.randomUUID(),
    year: year ?? new Date().getFullYear() + 5,
    dilutionFactor,
    revenue: null,
    psMultiple: null,
    fcf: null,
    pfcfMultiple: null,
    profit: null,
    peMultiple: null,
  }
}

export function newEasyProjection(
  year?: number,
  projectedMarketCap: number | null = null,
): EasyProjection {
  return {
    id: crypto.randomUUID(),
    year: year ?? new Date().getFullYear() + 5,
    projectedMarketCap,
  }
}

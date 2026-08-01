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

/**
 * Value at `year` on the compound path between two projected anchors.
 * Uses the implied CAGR over [fromYear, toYear]:
 *   V(y) = fromValue × (toValue / fromValue) ^ ((y − fromYear) / (toYear − fromYear))
 * Returns null when years/values are invalid or non-positive.
 */
export function interpolateByCagr(
  fromYear: number,
  fromValue: number,
  toYear: number,
  toValue: number,
  year: number,
): number | null {
  if (
    !Number.isFinite(fromYear) ||
    !Number.isFinite(toYear) ||
    !Number.isFinite(year) ||
    !Number.isFinite(fromValue) ||
    !Number.isFinite(toValue) ||
    fromValue <= 0 ||
    toValue <= 0
  ) {
    return null
  }
  if (toYear === fromYear) return year === fromYear ? fromValue : null
  if (year === fromYear) return fromValue
  if (year === toYear) return toValue

  const span = toYear - fromYear
  const t = (year - fromYear) / span
  // Allow mild out-of-range evaluation; callers clamp when needed
  return fromValue * Math.pow(toValue / fromValue, t)
}

/**
 * Look up a value on a sparse year series, filling gaps with CAGR between
 * consecutive known points. Clamps to the nearest endpoint outside the range.
 */
export function cagrInterpolate(
  known: { year: number; value: number }[],
  year: number,
): number | null {
  if (known.length === 0) return null
  const sorted = [...known]
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => a.year - b.year)
  if (sorted.length === 0) return null
  if (year <= sorted[0].year) return sorted[0].value
  if (year >= sorted[sorted.length - 1].year) return sorted[sorted.length - 1].value
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (year >= a.year && year <= b.year) {
      return interpolateByCagr(a.year, a.value, b.year, b.value, year)
    }
  }
  return null
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

/** Positive finite field pair → CAGR-interpolated value at `year`; else null. */
function interpPositiveField(
  fromYear: number,
  fromVal: number | null | undefined,
  toYear: number,
  toVal: number | null | undefined,
  year: number,
): number | null {
  if (fromVal == null || toVal == null) return null
  if (!(fromVal > 0) || !(toVal > 0)) return null
  return interpolateByCagr(fromYear, fromVal, toYear, toVal, year)
}

/**
 * Calendar years that sit in a gap between two easy anchors with mcap,
 * and are missing (or have no usable mcap). Used to enable the fill button.
 */
export function easyCagrGapYears(rows: EasyProjection[]): number[] {
  const anchors = sortEasyProjections(rows).filter(
    (r) => r.projectedMarketCap != null && r.projectedMarketCap > 0,
  )
  const existing = new Map(rows.map((r) => [r.year, r]))
  const gaps: number[] = []
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    for (let y = a.year + 1; y < b.year; y++) {
      const cur = existing.get(y)
      if (cur == null || cur.projectedMarketCap == null || !(cur.projectedMarketCap > 0)) {
        gaps.push(y)
      }
    }
  }
  return gaps
}

/**
 * Insert real easy projection rows for intermediate years between anchors,
 * using the implied CAGR on projected market cap. Does not overwrite years
 * that already have a positive mcap. Chart-only interpolation is unchanged.
 */
export function materializeEasyCagrYears(rows: EasyProjection[]): EasyProjection[] {
  const anchors = sortEasyProjections(rows).filter(
    (r) => r.projectedMarketCap != null && r.projectedMarketCap > 0,
  )
  if (anchors.length < 2) return sortEasyProjections(rows)

  const byYear = new Map<number, EasyProjection>()
  for (const r of rows) byYear.set(r.year, r)

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    for (let y = a.year + 1; y < b.year; y++) {
      const mcap = interpolateByCagr(
        a.year,
        a.projectedMarketCap!,
        b.year,
        b.projectedMarketCap!,
        y,
      )
      if (mcap == null) continue
      const existing = byYear.get(y)
      if (existing != null && existing.projectedMarketCap != null && existing.projectedMarketCap > 0) {
        continue
      }
      if (existing != null) {
        byYear.set(y, { ...existing, projectedMarketCap: mcap })
      } else {
        byYear.set(y, newEasyProjection(y, mcap))
      }
    }
  }

  return sortEasyProjections([...byYear.values()])
}

/**
 * Intermediate years missing between consecutive advanced rows (by calendar year).
 */
export function advancedCagrGapYears(rows: YearProjection[]): number[] {
  const sorted = sortYearProjections(rows)
  if (sorted.length < 2) return []
  const existing = new Set(sorted.map((r) => r.year))
  const gaps: number[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    for (let y = a.year + 1; y < b.year; y++) {
      if (!existing.has(y)) gaps.push(y)
    }
  }
  return gaps
}

/**
 * Insert real advanced year rows between consecutive stated years, interpolating
 * fundamentals / multiples / dilution by implied CAGR so portfolio projections
 * pick them up. Does not overwrite existing year rows.
 */
export function materializeAdvancedCagrYears(rows: YearProjection[]): YearProjection[] {
  const sorted = sortYearProjections(rows)
  if (sorted.length < 2) return sorted

  const byYear = new Map<number, YearProjection>()
  for (const r of sorted) byYear.set(r.year, r)

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    for (let y = a.year + 1; y < b.year; y++) {
      if (byYear.has(y)) continue
      const dilution =
        interpPositiveField(a.year, a.dilutionFactor, b.year, b.dilutionFactor, y) ??
        normalizeDilution(a.dilutionFactor)
      byYear.set(y, {
        id: crypto.randomUUID(),
        year: y,
        dilutionFactor: dilution > 0 ? dilution : 1,
        revenue: interpPositiveField(a.year, a.revenue, b.year, b.revenue, y),
        psMultiple: interpPositiveField(a.year, a.psMultiple, b.year, b.psMultiple, y),
        fcf: interpPositiveField(a.year, a.fcf, b.year, b.fcf, y),
        pfcfMultiple: interpPositiveField(a.year, a.pfcfMultiple, b.year, b.pfcfMultiple, y),
        profit: interpPositiveField(a.year, a.profit, b.year, b.profit, y),
        peMultiple: interpPositiveField(a.year, a.peMultiple, b.year, b.peMultiple, y),
      })
    }
  }

  return sortYearProjections([...byYear.values()])
}

type ChartSeriesKey = 'easy' | 'ps' | 'pfcf' | 'pe'

/**
 * Expand sparse year → value maps into a continuous year axis (inclusive),
 * filling gaps with implied CAGR between known points.
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
      if (v != null && Number.isFinite(v) && v > 0) pts.push({ year: p.year, value: v })
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
      if (actual != null && Number.isFinite(actual) && actual > 0) {
        point[key] = actual
        if (key === 'easy') point.easyActual = true
        if (key === 'ps') point.psActual = true
        if (key === 'pfcf') point.pfcfActual = true
        if (key === 'pe') point.peActual = true
      } else {
        const interp = cagrInterpolate(known, year)
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

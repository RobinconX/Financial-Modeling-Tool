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

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/**
 * Years from `asOf` (today) to 31 Dec of `targetYear`.
 * Stated projection years are year-end figures.
 */
export function yearsUntilProjectionEnd(targetYear: number, asOf: Date = new Date()): number {
  const start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()
  const end = new Date(targetYear, 11, 31).getTime()
  return (end - start) / MS_PER_YEAR
}

function resolveAsOf(asOf?: Date | number): Date {
  if (asOf instanceof Date) return asOf
  if (typeof asOf === 'number' && Number.isFinite(asOf)) return new Date(asOf, 0, 1)
  return new Date()
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
 * `dilutionFactor` here is cumulative shares vs today (1.0 = none).
 */
export function equityValueAfterDilution(marketCap: number, dilutionFactor: number): number {
  return marketCap / normalizeDilution(dilutionFactor)
}

/**
 * Product of yearly dilution rates up to each year.
 * Last row wins when two rows share a year. Years before `fromYear` are ignored
 * (today’s share count already includes the past).
 */
export function cumulativeDilutionByYear(
  rows: YearProjection[],
  fromYear?: number,
): Map<number, number> {
  const yearly = new Map<number, number>()
  for (const row of sortYearProjections(rows)) {
    if (fromYear != null && row.year < fromYear) continue
    yearly.set(row.year, normalizeDilution(row.dilutionFactor))
  }
  const out = new Map<number, number>()
  let cum = 1
  for (const year of [...yearly.keys()].sort((a, b) => a - b)) {
    cum *= yearly.get(year)!
    out.set(year, cum)
  }
  return out
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
  asOf: Date | number = new Date(),
): ProjectionRow[] {
  if (currentMarketCap <= 0) return []
  const asOfDate = resolveAsOf(asOf)
  const results: ProjectionRow[] = []

  for (const easy of easyRows) {
    if (easy.projectedMarketCap == null || easy.projectedMarketCap <= 0) continue
    const years = yearsUntilProjectionEnd(easy.year, asOfDate)
    // Year-end figures: skip only when that 31 Dec is already past
    if (years < 0) continue
    results.push({
      year: easy.year,
      basis: 'easy',
      marketCap: easy.projectedMarketCap,
      equityValue: easy.projectedMarketCap,
      dilutionFactor: 1,
      totalReturn: totalReturn(currentMarketCap, easy.projectedMarketCap),
      cagr: years > 0 ? cagr(currentMarketCap, easy.projectedMarketCap, years) : NaN,
      years,
    })
  }

  return results.sort((a, b) => a.year - b.year)
}

export function buildAdvancedProjections(
  currentMarketCap: number,
  rows: YearProjection[],
  asOf: Date | number = new Date(),
): ProjectionRow[] {
  if (currentMarketCap <= 0) return []
  const asOfDate = resolveAsOf(asOf)
  const results: ProjectionRow[] = []
  const bases: ValuationBasis[] = ['ps', 'pfcf', 'pe']
  const cumulative = cumulativeDilutionByYear(rows, asOfDate.getFullYear())

  for (const row of rows) {
    const years = yearsUntilProjectionEnd(row.year, asOfDate)
    if (years < 0) continue
    const dilution = cumulative.get(row.year) ?? normalizeDilution(row.dilutionFactor)
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
        cagr: years > 0 ? cagr(currentMarketCap, equityValue, years) : NaN,
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

type EasyMcapAnchor = { year: number; projectedMarketCap: number }

/**
 * Easy mcap anchors: optional today (current mcap) plus stated years with mcap.
 * Stated year-end for the current calendar year overwrites the live mcap anchor.
 */
function easyMcapAnchors(
  rows: EasyProjection[],
  currentMarketCap?: number | null,
  currentYear = new Date().getFullYear(),
): EasyMcapAnchor[] {
  const byYear = new Map<number, number>()
  if (currentMarketCap != null && currentMarketCap > 0) {
    byYear.set(currentYear, currentMarketCap)
  }
  for (const r of sortEasyProjections(rows)) {
    if (r.year < currentYear) continue
    if (r.projectedMarketCap == null || !(r.projectedMarketCap > 0)) continue
    byYear.set(r.year, r.projectedMarketCap)
  }
  return [...byYear.entries()]
    .map(([year, projectedMarketCap]) => ({ year, projectedMarketCap }))
    .sort((a, b) => a.year - b.year)
}

/**
 * Calendar years that sit in a gap between easy anchors (including today→first
 * projection when current mcap is known) and are missing a usable mcap.
 */
export function easyCagrGapYears(
  rows: EasyProjection[],
  currentMarketCap?: number | null,
  currentYear = new Date().getFullYear(),
): number[] {
  const anchors = easyMcapAnchors(rows, currentMarketCap, currentYear)
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
 * using the implied CAGR on projected market cap.
 * When `currentMarketCap` is set, also fills from today to the first stated year
 * (works with a single future projection). Does not overwrite years that already
 * have a positive mcap.
 */
export function materializeEasyCagrYears(
  rows: EasyProjection[],
  currentMarketCap?: number | null,
  currentYear = new Date().getFullYear(),
): EasyProjection[] {
  const anchors = easyMcapAnchors(rows, currentMarketCap, currentYear)
  if (anchors.length < 2) return sortEasyProjections(rows)

  const byYear = new Map<number, EasyProjection>()
  for (const r of rows) byYear.set(r.year, r)

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    for (let y = a.year + 1; y < b.year; y++) {
      const mcap = interpolateByCagr(
        a.year,
        a.projectedMarketCap,
        b.year,
        b.projectedMarketCap,
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
 * Synthetic "today" advanced row so CAGR can run from current mcap to the first
 * stated year: keep end multiples constant and back out metrics from current mcap.
 */
function syntheticAdvancedStartFromMcap(
  currentYear: number,
  currentMarketCap: number,
  first: YearProjection,
): YearProjection {
  let revenue: number | null = null
  let psMultiple: number | null = null
  let fcf: number | null = null
  let pfcfMultiple: number | null = null
  let profit: number | null = null
  let peMultiple: number | null = null

  if (
    first.revenue != null &&
    first.revenue > 0 &&
    first.psMultiple != null &&
    first.psMultiple > 0
  ) {
    psMultiple = first.psMultiple
    revenue = currentMarketCap / psMultiple
  }
  if (first.fcf != null && first.fcf > 0 && first.pfcfMultiple != null && first.pfcfMultiple > 0) {
    pfcfMultiple = first.pfcfMultiple
    fcf = currentMarketCap / pfcfMultiple
  }
  if (
    first.profit != null &&
    first.profit > 0 &&
    first.peMultiple != null &&
    first.peMultiple > 0
  ) {
    peMultiple = first.peMultiple
    profit = currentMarketCap / peMultiple
  }

  return {
    id: '__cagr_start__',
    year: currentYear,
    dilutionFactor: 1,
    revenue,
    psMultiple,
    fcf,
    pfcfMultiple,
    profit,
    peMultiple,
  }
}

function advancedHasFillableBasis(row: YearProjection): boolean {
  return (
    (row.revenue != null &&
      row.revenue > 0 &&
      row.psMultiple != null &&
      row.psMultiple > 0) ||
    (row.fcf != null && row.fcf > 0 && row.pfcfMultiple != null && row.pfcfMultiple > 0) ||
    (row.profit != null &&
      row.profit > 0 &&
      row.peMultiple != null &&
      row.peMultiple > 0)
  )
}

/**
 * Intermediate years missing between consecutive advanced rows, and (when
 * current mcap is known) between today and the first fillable projection year.
 */
export function advancedCagrGapYears(
  rows: YearProjection[],
  currentMarketCap?: number | null,
  currentYear = new Date().getFullYear(),
): number[] {
  const sorted = sortYearProjections(rows).filter((r) => r.year >= currentYear)
  const existing = new Set(sorted.map((r) => r.year))
  const gaps: number[] = []

  const firstFillable = sorted.find(advancedHasFillableBasis)
  if (
    currentMarketCap != null &&
    currentMarketCap > 0 &&
    firstFillable != null &&
    firstFillable.year > currentYear + 1
  ) {
    for (let y = currentYear + 1; y < firstFillable.year; y++) {
      if (!existing.has(y)) gaps.push(y)
    }
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    for (let y = a.year + 1; y < b.year; y++) {
      if (!existing.has(y) && !gaps.includes(y)) gaps.push(y)
    }
  }
  return gaps.sort((a, b) => a - b)
}

/**
 * Insert real advanced year rows between consecutive stated years, interpolating
 * fundamentals / multiples / yearly dilution by implied CAGR.
 * Dilution is a per-year rate: gap years between user-stated years interpolate
 * that rate; years filled from today stay at 1.0 (no assumed dilution).
 * With `currentMarketCap`, also fills from today to the first fillable year
 * (works with a single future projection). Does not overwrite existing years.
 */
export function materializeAdvancedCagrYears(
  rows: YearProjection[],
  currentMarketCap?: number | null,
  currentYear = new Date().getFullYear(),
): YearProjection[] {
  const sorted = sortYearProjections(rows).filter((r) => r.year >= currentYear)
  const anchors: YearProjection[] = []

  const firstFillable = sorted.find(advancedHasFillableBasis)
  if (
    currentMarketCap != null &&
    currentMarketCap > 0 &&
    firstFillable != null &&
    firstFillable.year > currentYear
  ) {
    // Only inject a synthetic start when the first fillable year is after today
    // and we do not already have a row at currentYear with fillable data.
    const atToday = sorted.find((r) => r.year === currentYear)
    if (atToday == null || !advancedHasFillableBasis(atToday)) {
      anchors.push(syntheticAdvancedStartFromMcap(currentYear, currentMarketCap, firstFillable))
    }
  }

  for (const r of sorted) anchors.push(r)
  // Dedupe by year (prefer last = stated)
  const byYearAnchors = new Map<number, YearProjection>()
  for (const a of anchors) byYearAnchors.set(a.year, a)
  const uniqueAnchors = [...byYearAnchors.values()].sort((a, b) => a.year - b.year)

  if (uniqueAnchors.length < 2) return sortYearProjections(rows)

  const byYear = new Map<number, YearProjection>()
  for (const r of rows) byYear.set(r.year, r)

  for (let i = 0; i < uniqueAnchors.length - 1; i++) {
    const a = uniqueAnchors[i]
    const b = uniqueAnchors[i + 1]
    for (let y = a.year + 1; y < b.year; y++) {
      if (byYear.has(y)) continue
      const dilution =
        a.id === '__cagr_start__'
          ? 1
          : interpPositiveField(a.year, a.dilutionFactor, b.year, b.dilutionFactor, y) ??
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
    let hasStated = false
    for (const easy of easyRows) {
      if (
        easy.projectedMarketCap == null ||
        easy.projectedMarketCap <= 0 ||
        easy.year < currentYear
      ) {
        continue
      }
      hasStated = true
      maxYear = Math.max(maxYear, easy.year)
      const point = sparse.get(easy.year) ?? { year: easy.year }
      point.easy = easy.projectedMarketCap
      point.easyActual = true
      sparse.set(easy.year, point)
    }
    if (!hasStated) return [{ year: currentYear, current: currentMarketCap }]

    const start = sparse.get(currentYear)!
    // Path starts at today's mcap unless a year-end projection was stated for this year
    if (start.easy == null) {
      start.easy = currentMarketCap
      start.easyActual = true
    }

    return expandContinuousSeries(sparse, ['easy'], currentYear, maxYear)
  }

  const start = sparse.get(currentYear)!
  let maxYear = currentYear
  let hasPs = false
  let hasPfcf = false
  let hasPe = false
  const cumulative = cumulativeDilutionByYear(advancedRows, currentYear)

  for (const row of sortYearProjections(advancedRows)) {
    if (row.year < currentYear) continue
    const ps = impliedForBasis(row, 'ps')
    const pfcf = impliedForBasis(row, 'pfcf')
    const pe = impliedForBasis(row, 'pe')
    if (ps == null && pfcf == null && pe == null) continue

    // Shareholder path: same equity claim used for ROI / table share price
    const dilution = cumulative.get(row.year) ?? normalizeDilution(row.dilutionFactor)
    maxYear = Math.max(maxYear, row.year)
    const point = sparse.get(row.year) ?? { year: row.year }
    if (ps != null) {
      point.ps = equityValueAfterDilution(ps, dilution)
      point.psActual = true
      hasPs = true
    }
    if (pfcf != null) {
      point.pfcf = equityValueAfterDilution(pfcf, dilution)
      point.pfcfActual = true
      hasPfcf = true
    }
    if (pe != null) {
      point.pe = equityValueAfterDilution(pe, dilution)
      point.peActual = true
      hasPe = true
    }
    sparse.set(row.year, point)
  }

  const keys: ChartSeriesKey[] = []
  if (hasPs) {
    if (start.ps == null) {
      start.ps = currentMarketCap
      start.psActual = true
    }
    keys.push('ps')
  }
  if (hasPfcf) {
    if (start.pfcf == null) {
      start.pfcf = currentMarketCap
      start.pfcfActual = true
    }
    keys.push('pfcf')
  }
  if (hasPe) {
    if (start.pe == null) {
      start.pe = currentMarketCap
      start.peActual = true
    }
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

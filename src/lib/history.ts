import type {
  OverviewSeries,
  PortfolioActualsState,
  SavedPortfolio,
  SavingsAccount,
} from '../types'
import {
  getActualsCurrency,
  getActualsMap,
  parseActualKey,
} from './portfolio'
import { hasActualMonths } from './portfolioActuals'
import { addMonthsToKey, currentPeriodKey, parsePeriodKey } from './savings'

export type HistoryKind = 'portfolio' | 'savings'
export type HistoryResolution = 'monthly' | 'yearly'

export type HistorySeriesPoint = {
  key: string
  year: number
  month: number
  value: number
}

export type HistorySeries = {
  id: string
  sourceId: string
  kind: HistoryKind
  name: string
  color: string
  /** True when values are CHF (native or converted). False = USD, excluded from CHF total. */
  inChf: boolean
  points: HistorySeriesPoint[]
}

export type HistoryChartRow = {
  xKey: string
  label: string
  total: number | null
  [seriesId: string]: string | number | null
}

const PORTFOLIO_SHADES = [
  '#34d399',
  '#10b981',
  '#059669',
  '#6ee7b7',
  '#a7f3d0',
  '#047857',
]
const SAVINGS_SHADES = [
  '#38bdf8',
  '#0ea5e9',
  '#0284c7',
  '#7dd3fc',
  '#bae6fd',
  '#0369a1',
]

/** Data key for recorded-actual overlay on Overview charts. */
export const RECORDED_ACTUAL_KEY = '__recorded'

export function historySeriesId(kind: HistoryKind, sourceId: string): string {
  return `${kind}:${sourceId}`
}

/** Shared investing actuals — one History series for all portfolio scenarios. */
export const SHARED_PORTFOLIO_SOURCE_ID = 'shared'

function monthlyPointsFromMap(map: Record<string, number>): HistorySeriesPoint[] {
  const out: HistorySeriesPoint[] = []
  for (const [key, raw] of Object.entries(map)) {
    const p = parseActualKey(key) ?? parsePeriodKey(key)
    if (!p) continue
    if (raw == null || !Number.isFinite(raw) || raw < 0) continue
    out.push({ key, year: p.year, month: p.month, value: raw })
  }
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

/** Last stored month in each calendar year (Dec if present). */
export function rollupYearly(points: HistorySeriesPoint[]): HistorySeriesPoint[] {
  const best = new Map<number, HistorySeriesPoint>()
  for (const p of points) {
    const prev = best.get(p.year)
    if (!prev || p.month >= prev.month) {
      best.set(p.year, { ...p, key: String(p.year) })
    }
  }
  return [...best.values()].sort((a, b) => a.year - b.year)
}

export function collectHistorySeries(
  _portfolios: SavedPortfolio[],
  accounts: SavingsAccount[],
  usdToChf: number | null,
  portfolioActuals?: PortfolioActualsState | null,
): HistorySeries[] {
  const out: HistorySeries[] = []
  let sShade = 0

  if (hasActualMonths(portfolioActuals)) {
    const map = getActualsMap(portfolioActuals)
    const raw = monthlyPointsFromMap(map)
    const cur = getActualsCurrency(portfolioActuals)
    const canChf = cur === 'CHF' || (usdToChf != null && usdToChf > 0)
    const points =
      cur === 'CHF'
        ? raw
        : canChf
          ? raw.map((pt) => ({ ...pt, value: pt.value * usdToChf! }))
          : raw
    out.push({
      id: historySeriesId('portfolio', SHARED_PORTFOLIO_SOURCE_ID),
      sourceId: SHARED_PORTFOLIO_SOURCE_ID,
      kind: 'portfolio',
      name: 'Portfolio',
      color: PORTFOLIO_SHADES[0]!,
      inChf: canChf,
      points,
    })
  }

  for (const a of accounts) {
    const raw = monthlyPointsFromMap(a.actuals ?? {})
    if (raw.length === 0) continue
    out.push({
      id: historySeriesId('savings', a.id),
      sourceId: a.id,
      kind: 'savings',
      name: a.name.trim() || 'Savings',
      color: SAVINGS_SHADES[sShade++ % SAVINGS_SHADES.length]!,
      inChf: true,
      points: raw,
    })
  }

  return out
}

export function yearsInSeries(series: HistorySeries[]): number[] {
  const set = new Set<number>()
  for (const s of series) {
    for (const p of s.points) set.add(p.year)
  }
  return [...set].sort((a, b) => a - b)
}

function inYearRange(year: number, fromYear: number, toYear: number): boolean {
  return year >= fromYear && year <= toYear
}

export function buildHistoryChart(
  series: HistorySeries[],
  resolution: HistoryResolution,
  fromYear: number,
  toYear: number,
): { keys: string[]; rows: HistoryChartRow[] } {
  const prepared = series.map((s) => ({
    ...s,
    pts: (resolution === 'yearly' ? rollupYearly(s.points) : s.points).filter((p) =>
      inYearRange(p.year, fromYear, toYear),
    ),
  }))

  const keySet = new Set<string>()
  for (const s of prepared) {
    for (const p of s.pts) keySet.add(p.key)
  }
  const keys = [...keySet].sort((a, b) => a.localeCompare(b))

  const rows: HistoryChartRow[] = keys.map((xKey) => {
    const row: HistoryChartRow = { xKey, label: xKey, total: null }
    let total = 0
    let any = false
    for (const s of prepared) {
      const hit = s.pts.find((p) => p.key === xKey)
      row[s.id] = hit ? hit.value : null
      if (hit && s.inChf) {
        total += hit.value
        any = true
      }
    }
    row.total = any ? total : null
    return row
  })

  return { keys, rows }
}

export type HistoryTableRow = {
  id: string
  name: string
  kind: HistoryKind
  color: string
  inChf: boolean
  byYear: Record<number, number | null>
  latest: number | null
  yoy: number | null
}

export function buildHistoryTable(
  series: HistorySeries[],
  fromYear: number,
  toYear: number,
): { years: number[]; rows: HistoryTableRow[] } {
  const years: number[] = []
  for (let y = fromYear; y <= toYear; y++) years.push(y)

  const rows: HistoryTableRow[] = series.map((s) => {
    const yearly = rollupYearly(s.points)
    const byYear: Record<number, number | null> = {}
    for (const y of years) {
      byYear[y] = yearly.find((p) => p.year === y)?.value ?? null
    }
    const lastY = [...years].reverse().find((y) => byYear[y] != null)
    const prevY = lastY != null ? lastY - 1 : null
    const latest = lastY != null ? byYear[lastY] : null
    const prev = prevY != null ? byYear[prevY] : null
    const yoy =
      latest != null && prev != null && prev > 0 ? latest / prev - 1 : null
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      color: s.color,
      inChf: s.inChf,
      byYear,
      latest,
      yoy,
    }
  })

  return { years, rows }
}

export type HistorySnapshot = {
  total: number | null
  prevYearEnd: number | null
  yoy: number | null
  asOfLabel: string | null
  prevYear: number | null
}

/** Latest monthly (or yearly) total in range vs previous calendar year-end total. */
export function historySnapshot(
  series: HistorySeries[],
  fromYear: number,
  toYear: number,
): HistorySnapshot {
  const chf = series.filter((s) => s.inChf)
  const monthly = buildHistoryChart(chf, 'monthly', fromYear, toYear)
  const last = [...monthly.rows].reverse().find((r) => r.total != null)
  const yearly = buildHistoryChart(chf, 'yearly', fromYear, toYear)
  const lastYearly = [...yearly.rows].reverse().find((r) => r.total != null)
  const prevYear =
    lastYearly != null ? Number(lastYearly.xKey) - 1 : null
  const prevRow =
    prevYear != null ? yearly.rows.find((r) => r.xKey === String(prevYear)) : null
  const total = last?.total ?? null
  const prevYearEnd = prevRow?.total ?? null
  const yoy =
    total != null && prevYearEnd != null && prevYearEnd > 0
      ? total / prevYearEnd - 1
      : null
  return {
    total,
    prevYearEnd,
    yoy,
    asOfLabel: last?.label ?? null,
    prevYear,
  }
}

export type HistoryCompleteness = {
  lastKey: string | null
  monthsBehind: number
  stale: boolean
  gapCount: number
  yearlyOnly: boolean
}

function monthsBetweenKeys(from: string, to: string): number {
  const a = parsePeriodKey(from)
  const b = parsePeriodKey(to)
  if (!a || !b) return 0
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/** True when the series is basically year-ends (Dec) plus maybe a current month. */
export function seriesLooksYearly(points: HistorySeriesPoint[]): boolean {
  if (points.length <= 1) return true
  const nonDec = points.filter((p) => p.month !== 12)
  return nonDec.length <= 1
}

export function seriesCompleteness(
  series: HistorySeries,
  asOf: Date = new Date(),
  fromYear?: number,
  toYear?: number,
): HistoryCompleteness {
  const nowKey = currentPeriodKey(asOf)
  const now = parsePeriodKey(nowKey) ?? { year: asOf.getFullYear(), month: asOf.getMonth() + 1 }
  const y0 = fromYear ?? 1
  const y1 = toYear ?? 9999
  const windowStart = `${y0}-01`
  const windowEnd = [ `${y1}-12`, nowKey ].sort()[0]!

  const pts = [...series.points]
    .filter((p) => p.key >= windowStart && p.key <= windowEnd)
    .sort((a, b) => a.key.localeCompare(b.key))

  const allPts = [...series.points].sort((a, b) => a.key.localeCompare(b.key))
  const yearlyOnly = seriesLooksYearly(allPts)

  if (pts.length === 0) {
    return { lastKey: null, monthsBehind: 0, stale: false, gapCount: 0, yearlyOnly }
  }

  const last = pts[pts.length - 1]!
  const monthsBehind = Math.max(0, monthsBetweenKeys(last.key, windowEnd))

  let stale = false
  if (yearlyOnly) {
    const lastCompletedYear = now.month === 12 ? now.year : now.year - 1
    const needYear = Math.min(y1, lastCompletedYear)
    if (needYear >= y0) {
      const haveYear = pts.some((p) => p.year === needYear)
      stale = !haveYear
    }
  } else if (windowEnd === nowKey) {
    stale = monthsBehind >= 2
  }

  let gapCount = 0
  if (yearlyOnly) {
    const lastExpectedYear = now.month === 12 ? Math.min(y1, now.year) : Math.min(y1, now.year - 1)
    const have = new Set(pts.map((p) => p.year))
    for (let y = y0; y <= lastExpectedYear; y++) {
      if (!have.has(y)) gapCount += 1
    }
  } else {
    const have = new Set(pts.map((p) => p.key))
    let k = windowStart
    while (k < windowEnd) {
      if (!have.has(k)) gapCount += 1
      k = addMonthsToKey(k, 1)
    }
    if (!have.has(windowEnd)) gapCount += 1
  }

  return { lastKey: last.key, monthsBehind, stale, gapCount, yearlyOnly }
}

/** Human-readable stale / gap hint (matches History Include list). */
export function formatCompletenessHint(c: HistoryCompleteness | undefined): string | null {
  if (!c) return null
  const bits: string[] = []
  if (c.stale && c.lastKey) bits.push(`stale · ${c.lastKey}`)
  if (c.gapCount > 0) bits.push(`${c.gapCount} gap${c.gapCount === 1 ? '' : 's'}`)
  return bits.length ? bits.join(' · ') : null
}

/** First missing calendar period inside the completeness window (month key or year-end month). */
export function firstMissingPeriodKey(
  series: HistorySeries,
  asOf: Date = new Date(),
  fromYear?: number,
  toYear?: number,
): string | null {
  const nowKey = currentPeriodKey(asOf)
  const now = parsePeriodKey(nowKey) ?? { year: asOf.getFullYear(), month: asOf.getMonth() + 1 }
  const y0 = fromYear ?? 1
  const y1 = toYear ?? 9999
  const windowStart = `${y0}-01`
  const windowEnd = [`${y1}-12`, nowKey].sort()[0]!

  const pts = [...series.points]
    .filter((p) => p.key >= windowStart && p.key <= windowEnd)
    .sort((a, b) => a.key.localeCompare(b.key))
  if (pts.length === 0) return null

  const allPts = [...series.points].sort((a, b) => a.key.localeCompare(b.key))
  const yearlyOnly = seriesLooksYearly(allPts)

  if (yearlyOnly) {
    const lastExpectedYear =
      now.month === 12 ? Math.min(y1, now.year) : Math.min(y1, now.year - 1)
    const have = new Set(pts.map((p) => p.year))
    for (let y = y0; y <= lastExpectedYear; y++) {
      if (!have.has(y)) return `${y}-12`
    }
    return null
  }

  const have = new Set(pts.map((p) => p.key))
  let k = windowStart
  while (k < windowEnd) {
    if (!have.has(k)) return k
    k = addMonthsToKey(k, 1)
  }
  if (!have.has(windowEnd)) return windowEnd
  return null
}

/** Period to open when repairing stale data or the first gap in range. */
export function historyAttentionPeriodKey(
  series: HistorySeries,
  asOf: Date = new Date(),
  fromYear?: number,
  toYear?: number,
): string | null {
  const c = seriesCompleteness(series, asOf, fromYear, toYear)
  if (!c.stale && c.gapCount === 0) return null
  const gap = firstMissingPeriodKey(series, asOf, fromYear, toYear)
  if (gap) return gap
  if (c.stale) {
    const nowKey = currentPeriodKey(asOf)
    if (c.yearlyOnly) {
      const now = parsePeriodKey(nowKey)!
      const lastCompletedYear = now.month === 12 ? now.year : now.year - 1
      const needYear = Math.min(toYear ?? 9999, lastCompletedYear)
      return `${needYear}-12`
    }
    return nowKey
  }
  return null
}

export type ActualsRepairTarget = {
  tab: 'portfolio' | 'savings'
  savingsAccountId?: string
  periodKey: string
}

export type HistoryAttentionItem = {
  seriesId: string
  name: string
  hint: string
  periodKey: string
  repair: ActualsRepairTarget
}

export function repairTargetForHistorySeries(
  series: HistorySeries,
  periodKey: string,
): ActualsRepairTarget | null {
  if (series.kind === 'portfolio') {
    return { tab: 'portfolio', periodKey }
  }
  if (series.kind === 'savings') {
    return { tab: 'savings', savingsAccountId: series.sourceId, periodKey }
  }
  return null
}

/** History series linked to enabled Overview portfolio / savings layers. */
export function historyIdsForOverviewSeries(
  overviewSeries: OverviewSeries[],
  savingsAccounts: SavingsAccount[],
  portfolioActuals?: PortfolioActualsState | null,
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const s of overviewSeries) {
    if (!s.enabled) continue
    if (s.type === 'portfolio' && hasActualMonths(portfolioActuals)) {
      const id = historySeriesId('portfolio', SHARED_PORTFOLIO_SOURCE_ID)
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    if (s.type === 'savings' && s.savingsAccountId) {
      const acct = savingsAccounts.find((a) => a.id === s.savingsAccountId)
      const hasActuals = acct && Object.keys(acct.actuals ?? {}).some((k) => {
        const v = acct.actuals![k]
        return v != null && Number.isFinite(v)
      })
      if (hasActuals) {
        const id = historySeriesId('savings', s.savingsAccountId)
        if (!seen.has(id)) {
          seen.add(id)
          ids.push(id)
        }
      }
    }
  }
  return ids
}

export function listHistoryAttention(
  allSeries: HistorySeries[],
  overviewSeries: OverviewSeries[],
  savingsAccounts: SavingsAccount[],
  portfolioActuals: PortfolioActualsState | null | undefined,
  asOf: Date,
  fromYear: number,
  toYear: number,
): HistoryAttentionItem[] {
  const want = new Set(
    historyIdsForOverviewSeries(overviewSeries, savingsAccounts, portfolioActuals),
  )
  const out: HistoryAttentionItem[] = []
  for (const s of allSeries) {
    if (!want.has(s.id)) continue
    const c = seriesCompleteness(s, asOf, fromYear, toYear)
    const hint = formatCompletenessHint(c)
    if (!hint) continue
    const periodKey = historyAttentionPeriodKey(s, asOf, fromYear, toYear)
    if (!periodKey) continue
    const repair = repairTargetForHistorySeries(s, periodKey)
    if (!repair) continue
    out.push({ seriesId: s.id, name: s.name, hint, periodKey, repair })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

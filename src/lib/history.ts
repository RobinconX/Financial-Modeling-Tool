import type { SavedPortfolio, SavingsAccount } from '../types'
import {
  getActualsCurrency,
  getActualsMap,
  parseActualKey,
} from './portfolio'
import { parsePeriodKey } from './savings'

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

export function historySeriesId(kind: HistoryKind, sourceId: string): string {
  return `${kind}:${sourceId}`
}

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
  portfolios: SavedPortfolio[],
  accounts: SavingsAccount[],
  usdToChf: number | null,
): HistorySeries[] {
  const out: HistorySeries[] = []
  let pShade = 0
  let sShade = 0

  for (const p of portfolios) {
    const map = getActualsMap(p)
    const raw = monthlyPointsFromMap(map)
    if (raw.length === 0) continue
    const cur = getActualsCurrency(p)
    const canChf = cur === 'CHF' || (usdToChf != null && usdToChf > 0)
    const points =
      cur === 'CHF'
        ? raw
        : canChf
          ? raw.map((pt) => ({ ...pt, value: pt.value * usdToChf! }))
          : raw
    out.push({
      id: historySeriesId('portfolio', p.id),
      sourceId: p.id,
      kind: 'portfolio',
      name: p.name.trim() || 'Portfolio',
      color: PORTFOLIO_SHADES[pShade++ % PORTFOLIO_SHADES.length]!,
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

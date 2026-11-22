import type { PortfolioTrade } from '../types'
import type { GoalPathMetric, MergedUpsideRow, UpsidePoint } from './goalGap'
import { tradeEvent, tradeInstrument, tradeUnderlying } from './portfolioTradeLedger'

export type ComparablesChartSeriesRef = {
  key: string
  symbol: string
  points: UpsidePoint[]
}

export type ComparablesTradeMarker = {
  id: string
  tradeDate: string
  /** Category x on the chart (history date anchoring the dot). */
  chartDate: string
  seriesKey: string
  symbol: string
  side: PortfolioTrade['side']
  shares: number
  price: number
  fees: number
  currency: PortfolioTrade['currency']
  y: number
  instrument: 'equity' | 'option'
  event: PortfolioTrade['event']
  occSymbol?: string
}

/** Last series point on or before `tradeDate`, else first on/after. */
export function chartDateForTrade(
  tradeDate: string,
  points: UpsidePoint[],
): string | null {
  if (points.length === 0) return null
  const exact = points.find((p) => p.date === tradeDate)
  if (exact) return exact.date
  const prior = points.filter((p) => p.date <= tradeDate)
  if (prior.length > 0) return prior[prior.length - 1]!.date
  return points.find((p) => p.date >= tradeDate)?.date ?? null
}

export function chartValueAtDate(
  points: UpsidePoint[],
  chartDate: string,
): number | null {
  const pt = points.find((p) => p.date === chartDate)
  if (!pt) return null
  return Number.isFinite(pt.upside) ? pt.upside : null
}

export function buildComparablesTradeMarkers(
  trades: PortfolioTrade[],
  overlaySymbols: ReadonlySet<string>,
  series: ComparablesChartSeriesRef[],
): ComparablesTradeMarker[] {
  if (trades.length === 0 || series.length === 0) return []
  const out: ComparablesTradeMarker[] = []
  for (const t of trades) {
    const isOption = tradeInstrument(t) === 'option'
    const chartSym = isOption
      ? (tradeUnderlying(t) ?? '').toUpperCase()
      : t.symbol.toUpperCase()
    if (!chartSym || !overlaySymbols.has(chartSym)) continue
  for (const s of series) {
      if (s.symbol.toUpperCase() !== chartSym) continue
      const chartDate = chartDateForTrade(t.tradeDate, s.points)
      if (!chartDate) continue
      const y = chartValueAtDate(s.points, chartDate)
      if (y == null) continue
      out.push({
        id: `${t.id}:${s.key}`,
        tradeDate: t.tradeDate,
        chartDate,
        seriesKey: s.key,
        symbol: chartSym,
        side: t.side,
        shares: t.shares,
        price: t.price,
        fees: t.fees ?? 0,
        currency: t.currency ?? 'USD',
        y,
        instrument: isOption ? 'option' : 'equity',
        event: tradeEvent(t),
        occSymbol: isOption ? t.symbol : undefined,
      })
    }
  }
  out.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  return out
}

export function chartRowNearestToDate(
  rows: readonly MergedUpsideRow[],
  label: string | number | undefined,
): MergedUpsideRow | undefined {
  if (!rows.length || label == null) return undefined
  const date = String(label)
  const exact = rows.find((r) => r.date === date)
  if (exact) return exact
  let best: MergedUpsideRow | undefined
  let bestDist = Infinity
  for (const row of rows) {
    const d = Math.abs(Date.parse(row.date) - Date.parse(date))
    if (d < bestDist) {
      bestDist = d
      best = row
    }
  }
  return best
}

export function tradesForComparablesTooltip(
  label: string | number | undefined,
  markers: ComparablesTradeMarker[],
): ComparablesTradeMarker[] {
  if (label == null || markers.length === 0) return []
  const day = String(label)
  return markers.filter((m) => m.chartDate === day)
}

export function comparablesTradeMetricLabel(metric: GoalPathMetric): string {
  return metric === 'cagr' ? 'CAGR' : 'Remaining upside'
}
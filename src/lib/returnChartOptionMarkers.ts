import type { DisplayCurrency, PortfolioTrade } from '../types'
import { optionLabel, parseOccSymbol } from './optionContract'
import { tradeEvent, tradeInstrument, tradeUnderlying } from './portfolioTradeLedger'
import type { ReturnProgressionPoint } from './portfolioPerformanceStats'
import type { ReturnChartOptionMarker } from './returnChartMarkers'
import { progressionYOnDate } from './returnChartMarkerY'

export function buildReturnChartOptionMarkers(
  trades: PortfolioTrade[],
  points: ReturnProgressionPoint[],
  mode: 'twr' | 'value',
  displayCurrency: DisplayCurrency = 'USD',
  usdToChf: number | null = null,
): ReturnChartOptionMarker[] {
  const out: ReturnChartOptionMarker[] = []
  for (const t of trades) {
    if (tradeInstrument(t) !== 'option') continue
    const y = progressionYOnDate(t.tradeDate, points, mode, displayCurrency, usdToChf)
    if (y == null || !Number.isFinite(y)) continue
    const occ = t.symbol
    const parsed = parseOccSymbol(occ)
    const underlying = tradeUnderlying(t) ?? parsed?.underlying ?? ''
    const label = parsed ? optionLabel(parsed) : occ
    out.push({
      id: t.id,
      tradeDate: t.tradeDate,
      time: Date.parse(`${t.tradeDate}T12:00:00Z`),
      side: t.side,
      symbol: underlying || occ,
      shares: t.shares,
      price: t.price,
      fees: t.fees ?? 0,
      currency: t.currency ?? 'USD',
      feesCurrency: t.feesCurrency,
      y,
      instrument: 'option',
      event: tradeEvent(t),
      occSymbol: occ,
      underlying,
      label,
    })
  }
  out.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  return out
}
import type { DisplayCurrency } from '../types'
import type { ReturnProgressionPoint } from './portfolioPerformanceStats'
import type { ReturnChartMode } from '../components/portfolio/PortfolioReturnChart'

function progressionMoneyValue(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

/** Y on the equity return progression curve for a calendar date. */
export function progressionYOnDate(
  date: string,
  points: ReturnProgressionPoint[],
  mode: ReturnChartMode,
  _displayCurrency: DisplayCurrency,
  _usdToChf: number | null,
): number | null {
  const yFromPoint = (p: ReturnProgressionPoint): number | null => {
    if (mode === 'value') {
      return progressionMoneyValue(p.positionsNav ?? p.totalPnl)
    }
    if (mode === 'twr') return p.twrPct != null ? p.twrPct * 100 : null
    return null
  }
  const byDate = new Map(points.map((p) => [p.date, p]))
  const empty: ReturnProgressionPoint = {
    date,
    positionsNav: null,
    netInvested: null,
    totalPnl: null,
    returnPct: null,
    twrPct: null,
    mwrCumPct: null,
  }
  const onDay = yFromPoint(byDate.get(date) ?? empty)
  if (onDay != null && Number.isFinite(onDay)) return onDay
  const prior = [...points]
    .filter((p) => p.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date))
  for (let i = prior.length - 1; i >= 0; i--) {
    const y = yFromPoint(prior[i]!)
    if (y != null && Number.isFinite(y)) return y
  }
  return null
}
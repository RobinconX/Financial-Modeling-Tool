export const COMPARABLES_CHART_TRADES_DEFAULT_KEY =
  'grok-lab.comparables-chart-trades-default.v1'

export function readComparablesChartTradesDefault(): boolean {
  try {
    return localStorage.getItem(COMPARABLES_CHART_TRADES_DEFAULT_KEY) === '1'
  } catch {
    return false
  }
}

export function writeComparablesChartTradesDefault(on: boolean): void {
  try {
    if (on) localStorage.setItem(COMPARABLES_CHART_TRADES_DEFAULT_KEY, '1')
    else localStorage.removeItem(COMPARABLES_CHART_TRADES_DEFAULT_KEY)
  } catch {
    /* ignore */
  }
}
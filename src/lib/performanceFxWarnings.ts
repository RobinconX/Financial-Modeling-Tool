import type { PerformanceMetricId } from './portfolioPerformanceBreakdown'

const SPOT_FALLBACK_RE =
  /ECB daily FX unavailable for (\d+) trade date\(s\); used live USD\/CHF spot/

/** Metrics whose cash-flow math uses ECB trade-date USD/CHF (not live marks only). */
export const PERFORMANCE_METRICS_WITH_TRADE_DATE_FX: ReadonlySet<PerformanceMetricId> =
  new Set([
    'peakNetInvested',
    'peakPortfolioValue',
    'netCapital',
    'mwr',
    'twr',
    'realized',
    'snapshotReturn',
  ])

export function hasPerformanceFxWarnings(warnings: string[] | undefined): boolean {
  return (warnings?.length ?? 0) > 0
}

export function spotFallbackTradeDateCount(warnings: string[]): number {
  for (const w of warnings) {
    const m = w.match(SPOT_FALLBACK_RE)
    if (m) return Number.parseInt(m[1]!, 10)
  }
  return 0
}

/** One-line summary for the Performance tab banner (empty when no warnings). */
export function performanceFxWarningSummary(warnings: string[]): string {
  if (warnings.length === 0) return ''
  const spotN = spotFallbackTradeDateCount(warnings)
  if (spotN > 0) {
    const dates = spotN === 1 ? 'trade date' : 'trade dates'
    return `${spotN} ${dates} used live USD/CHF spot because ECB daily FX was unavailable.`
  }
  if (warnings.some((w) => w.includes('Historical FX fetch paused'))) {
    return 'Historical FX fetch is paused; some trade cash flows use live spot.'
  }
  const missingDates = warnings.filter((w) => w.startsWith('No USD/CHF rate for'))
  if (missingDates.length > 0) {
    return `${missingDates.length} trade date(s) missing USD/CHF — cash flows may be incomplete.`
  }
  return 'Some trade cash flows used approximate FX rates.'
}

export function metricUsesTradeDateFx(metricId: PerformanceMetricId): boolean {
  return PERFORMANCE_METRICS_WITH_TRADE_DATE_FX.has(metricId)
}
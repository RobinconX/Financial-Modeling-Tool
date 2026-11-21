export type OverviewPageTab = 'networth' | 'runway'
export type OverviewChartMode = 'bars' | 'area' | 'compare'

/** Compare is only available on Net worth; coerce for rendering on Runway. */
export function effectiveOverviewChartMode(
  pageTab: OverviewPageTab,
  chartMode: OverviewChartMode,
): OverviewChartMode {
  return pageTab === 'runway' && chartMode === 'compare' ? 'bars' : chartMode
}

/** Persisted chart mode after switching Overview page tab (clears stale compare on Runway). */
export function overviewChartModeAfterPageTabChange(
  pageTab: OverviewPageTab,
  chartMode: OverviewChartMode,
): OverviewChartMode {
  return effectiveOverviewChartMode(pageTab, chartMode)
}
import type { PortfolioGridRow } from '../types'

export type PortfolioChartNavigateTarget =
  | { panel: 'positions'; holdingId: string }
  | { panel: 'cash'; focus: 'opening-cash' }
  | { panel: 'growth'; focus: 'growth-rate' }

/** Position names in the Chart value table that open another workspace tab. */
export function isPortfolioChartRowNavigable(row: PortfolioGridRow): boolean {
  return portfolioChartNavigateTarget(row) != null
}

export function portfolioChartNavigateTarget(
  row: PortfolioGridRow,
): PortfolioChartNavigateTarget | null {
  if (row.kind === 'equity') {
    const id = row.holdingId ?? row.key
    if (!id) return null
    return { panel: 'positions', holdingId: id }
  }
  if (row.kind === 'cash') {
    return { panel: 'cash', focus: 'opening-cash' }
  }
  if (row.kind === 'growth') {
    return { panel: 'growth', focus: 'growth-rate' }
  }
  return null
}
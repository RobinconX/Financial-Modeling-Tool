import { describe, expect, it } from 'vitest'
import {
  isPortfolioChartRowNavigable,
  portfolioChartNavigateTarget,
} from '../../src/lib/portfolioFocus'
import type { PortfolioGridRow } from '../../src/types'

function row(partial: Partial<PortfolioGridRow> & Pick<PortfolioGridRow, 'kind' | 'key' | 'label'>): PortfolioGridRow {
  return {
    values: [],
    ...partial,
  }
}

describe('portfolioChartNavigateTarget', () => {
  it('maps equity rows to Positions with holding id', () => {
    const target = portfolioChartNavigateTarget(
      row({
        kind: 'equity',
        key: 'h1',
        label: 'AAPL',
        holdingId: 'h1',
      }),
    )
    expect(target).toEqual({ panel: 'positions', holdingId: 'h1' })
    expect(isPortfolioChartRowNavigable(row({ kind: 'equity', key: 'h1', label: 'X' }))).toBe(true)
  })

  it('maps cash and growth rows to their tabs', () => {
    expect(
      portfolioChartNavigateTarget(row({ kind: 'cash', key: 'cash', label: 'Cash' })),
    ).toEqual({ panel: 'cash', focus: 'opening-cash' })
    expect(
      portfolioChartNavigateTarget(
        row({ kind: 'growth', key: 'perpetual-growth', label: 'Growth 5%/yr' }),
      ),
    ).toEqual({ panel: 'growth', focus: 'growth-rate' })
  })

  it('does not navigate total rows', () => {
    const total = row({ kind: 'total', key: 'total', label: 'Total' })
    expect(portfolioChartNavigateTarget(total)).toBeNull()
    expect(isPortfolioChartRowNavigable(total)).toBe(false)
  })
})
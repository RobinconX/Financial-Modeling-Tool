import { describe, expect, it } from 'vitest'
import {
  effectiveOverviewChartMode,
  overviewChartModeAfterPageTabChange,
} from '../../src/lib/overviewChartMode'

describe('overviewChartMode', () => {
  it('coerces compare to bars on runway for display and persisted state', () => {
    expect(effectiveOverviewChartMode('runway', 'compare')).toBe('bars')
    expect(overviewChartModeAfterPageTabChange('runway', 'compare')).toBe('bars')
  })

  it('keeps compare on net worth and non-compare modes on runway', () => {
    expect(effectiveOverviewChartMode('networth', 'compare')).toBe('compare')
    expect(effectiveOverviewChartMode('runway', 'area')).toBe('area')
    expect(overviewChartModeAfterPageTabChange('networth', 'area')).toBe('area')
    expect(overviewChartModeAfterPageTabChange('runway', 'bars')).toBe('bars')
  })
})
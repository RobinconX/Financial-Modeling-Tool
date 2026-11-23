import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PerformanceFxWarningsBanner } from '../../src/components/portfolio/PerformanceFxWarningsBanner'
import {
  metricUsesTradeDateFx,
  performanceFxWarningSummary,
  spotFallbackTradeDateCount,
} from '../../src/lib/performanceFxWarnings'

describe('performanceFxWarningSummary', () => {
  it('summarizes spot fallback count from ECB warning line', () => {
    const warnings = [
      'ECB daily FX unavailable for 3 trade date(s); used live USD/CHF spot for those cash flows.',
    ]
    expect(spotFallbackTradeDateCount(warnings)).toBe(3)
    expect(performanceFxWarningSummary(warnings)).toContain('3 trade dates')
    expect(performanceFxWarningSummary(warnings)).toContain('live USD/CHF spot')
  })

  it('handles paused fetch warning', () => {
    const warnings = [
      'Historical FX fetch paused after a recent failure; using spot where needed (retry in ~30 minutes).',
    ]
    expect(performanceFxWarningSummary(warnings)).toContain('paused')
  })

  it('returns empty summary for no warnings', () => {
    expect(performanceFxWarningSummary([])).toBe('')
  })
})

describe('metricUsesTradeDateFx', () => {
  it('flags capital and return metrics that use trade-date FX', () => {
    expect(metricUsesTradeDateFx('mwr')).toBe(true)
    expect(metricUsesTradeDateFx('twr')).toBe(true)
    expect(metricUsesTradeDateFx('realized')).toBe(true)
    expect(metricUsesTradeDateFx('unrealized')).toBe(false)
  })
})

describe('PerformanceFxWarningsBanner', () => {
  it('renders summary and hides details until expanded', () => {
    const warnings = [
      'ECB daily FX unavailable for 2 trade date(s); used live USD/CHF spot for those cash flows.',
    ]
    const html = renderToStaticMarkup(
      createElement(PerformanceFxWarningsBanner, { warnings }),
    )
    expect(html).toContain('data-testid="performance-fx-warnings-banner"')
    expect(html).toContain('2 trade dates')
    expect(html).not.toContain('<ul')
  })
})
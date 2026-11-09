import { describe, expect, it } from 'vitest'
import {
  formatLastQuoteRefreshAt,
  NO_QUOTE_REFRESH_YET,
  quoteRefreshErrorMessage,
  quoteRefreshLooksFailed,
  shouldShowQuoteRefreshFailure,
} from '../../src/lib/quoteRefreshHint'

describe('quoteRefreshHint', () => {
  it('quoteRefreshErrorMessage prefers Error.message', () => {
    expect(quoteRefreshErrorMessage(new Error('Network error fetching quote for AAPL'))).toBe(
      'Network error fetching quote for AAPL',
    )
    expect(quoteRefreshErrorMessage('nope')).toBe('Quote refresh failed')
  })

  it('formatLastQuoteRefreshAt handles never-success and relative ages', () => {
    expect(formatLastQuoteRefreshAt(null)).toBe(NO_QUOTE_REFRESH_YET)
    const now = 1_700_000_000_000
    expect(formatLastQuoteRefreshAt(now - 30_000, now)).toBe('Just now')
    expect(formatLastQuoteRefreshAt(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(formatLastQuoteRefreshAt(now - 2 * 60 * 60_000, now)).toBe('2 hours ago')
  })

  it('quoteRefreshLooksFailed when all symbols miss', () => {
    expect(quoteRefreshLooksFailed(3, 0)).toBe(true)
    expect(quoteRefreshLooksFailed(3, 1)).toBe(false)
    expect(quoteRefreshLooksFailed(0, 0)).toBe(false)
  })

  it('shouldShowQuoteRefreshFailure hides while loading or dismissed', () => {
    expect(shouldShowQuoteRefreshFailure('API down', false, false)).toBe(true)
    expect(shouldShowQuoteRefreshFailure('API down', true, false)).toBe(false)
    expect(shouldShowQuoteRefreshFailure('API down', false, true)).toBe(false)
    expect(shouldShowQuoteRefreshFailure(null, false, false)).toBe(false)
  })
})

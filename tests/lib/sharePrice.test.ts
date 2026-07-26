import { describe, expect, it } from 'vitest'
import {
  effectiveMarketCap,
  impliedSharePrice,
  marketCapFromSharePrice,
  resolveSharesOutstanding,
} from '../../src/lib/sharePrice'

describe('impliedSharePrice', () => {
  it('divides equity by shares and cleans price', () => {
    expect(impliedSharePrice(1_000_000_000, 10_000_000)).toBe(100)
  })

  it('returns null for missing or invalid inputs', () => {
    expect(impliedSharePrice(null, 1e6)).toBeNull()
    expect(impliedSharePrice(1e9, null)).toBeNull()
    expect(impliedSharePrice(0, 1e6)).toBeNull()
    expect(impliedSharePrice(1e9, 0)).toBeNull()
  })
})

describe('marketCapFromSharePrice', () => {
  it('multiplies and rounds to whole dollars', () => {
    expect(marketCapFromSharePrice(33.33, 3_000_000)).toBe(99_990_000)
  })

  it('returns null when invalid', () => {
    expect(marketCapFromSharePrice(null, 1e6)).toBeNull()
    expect(marketCapFromSharePrice(10, 0)).toBeNull()
  })
})

describe('effectiveMarketCap', () => {
  it('prefers override over live mcap', () => {
    expect(effectiveMarketCap(50, 100)).toBe(50)
    expect(effectiveMarketCap(null, 100)).toBe(100)
    expect(effectiveMarketCap(null, null)).toBeNull()
    expect(effectiveMarketCap(0, 100)).toBe(100)
  })
})

describe('resolveSharesOutstanding', () => {
  it('prefers explicit shares', () => {
    expect(
      resolveSharesOutstanding({
        sharesOutstanding: 5e6,
        marketCap: 1e9,
        price: 100,
      }),
    ).toBe(5e6)
  })

  it('falls back to mcap / price', () => {
    expect(
      resolveSharesOutstanding({
        sharesOutstanding: null,
        marketCap: 1e9,
        price: 50,
      }),
    ).toBe(20_000_000)
  })

  it('uses mcap override when deriving shares', () => {
    expect(
      resolveSharesOutstanding({
        marketCap: 1e9,
        mcapOverride: 2e9,
        price: 100,
      }),
    ).toBe(20_000_000)
  })

  it('returns null when cannot derive', () => {
    expect(resolveSharesOutstanding({})).toBeNull()
  })
})

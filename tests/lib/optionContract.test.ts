import { describe, expect, it } from 'vitest'
import {
  buildOccSymbol,
  holdingMultiplier,
  optionIsExpired,
  optionLabel,
  parseExpiryGroupLabel,
  parseOccSymbol,
} from '../../src/lib/optionContract'
import { holdingLiveValue, newManualHolding, newOptionHolding } from '../../src/lib/portfolio'

describe('OCC symbols', () => {
  it('builds and parses AAPL 21 Aug 2026 150 call', () => {
    const occ = buildOccSymbol('AAPL', '2026-08-21', 'C', 150)
    expect(occ).toBe('AAPL260821C00150000')
    const parsed = parseOccSymbol(occ)!
    expect(parsed.underlying).toBe('AAPL')
    expect(parsed.expiration).toBe('2026-08-21')
    expect(parsed.right).toBe('C')
    expect(parsed.strike).toBe(150)
  })

  it('parses Nasdaq expiry group labels', () => {
    expect(parseExpiryGroupLabel('August 24, 2026')).toBe('2026-08-24')
    expect(parseExpiryGroupLabel('January 2, 2027')).toBe('2027-01-02')
  })

  it('labels a contract', () => {
    expect(
      optionLabel({
        underlying: 'AAPL',
        expiration: '2026-08-21',
        right: 'C',
        strike: 150,
        multiplier: 100,
        occSymbol: 'AAPL260821C00150000',
      }),
    ).toBe('AAPL 21 Aug 26 150C')
  })

  it('treats expiry day as still live', () => {
    expect(optionIsExpired('2026-08-23', new Date(2026, 7, 23))).toBe(false)
    expect(optionIsExpired('2026-08-22', new Date(2026, 7, 23))).toBe(true)
  })
})

describe('option Now value', () => {
  it('uses contracts × premium × 100', () => {
    const c = parseOccSymbol('AAPL260821C00150000')!
    const h = newOptionHolding(c, 3.5, 2)
    expect(holdingMultiplier(h)).toBe(100)
    expect(holdingLiveValue(h, null, [])).toBeCloseTo(700)
  })

  it('does not apply ×100 to plain manuals', () => {
    const h = { ...newManualHolding('X'), sharesHeld: 2, manualCurrentPrice: 3.5 }
    expect(holdingMultiplier(h)).toBe(1)
    expect(holdingLiveValue(h, null, [])).toBeCloseTo(7)
  })

  it('year override wins over live premium', () => {
    const c = parseOccSymbol('AAPL260821C00150000')!
    const year = new Date().getFullYear()
    const h = {
      ...newOptionHolding(c, 3.5, 2),
      yearOverrides: [{ year, valueDollars: 50 }],
    }
    expect(holdingLiveValue(h, null, [], year)).toBe(50)
  })
})

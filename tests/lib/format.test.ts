import { describe, expect, it } from 'vitest'
import {
  cleanMoneyAmount,
  formatMoney,
  formatMultiple,
  formatPercent,
  parseMoney,
} from '../../src/lib/format'

describe('parseMoney', () => {
  it('parses plain numbers and commas/currency symbols', () => {
    expect(parseMoney('1000')).toBe(1000)
    expect(parseMoney('$1,250')).toBe(1250)
    expect(parseMoney('  42.5  ')).toBe(42.5)
  })

  it('parses K/M/B/T suffixes as integers', () => {
    expect(parseMoney('50K')).toBe(50_000)
    expect(parseMoney('1.5M')).toBe(1_500_000)
    expect(parseMoney('2B')).toBe(2_000_000_000)
    expect(parseMoney('1.2T')).toBe(1_200_000_000_000)
  })

  it('returns null for empty or invalid input', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('   ')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('12X')).toBeNull()
  })

  it('parses negative amounts', () => {
    expect(parseMoney('-100')).toBe(-100)
    expect(parseMoney('-$1.5K')).toBe(-1500)
  })
})

describe('cleanMoneyAmount', () => {
  it('returns null for non-finite', () => {
    expect(cleanMoneyAmount(null)).toBeNull()
    expect(cleanMoneyAmount(undefined)).toBeNull()
    expect(cleanMoneyAmount(Number.NaN)).toBeNull()
  })

  it('rounds near-integer dollars', () => {
    expect(cleanMoneyAmount(99.999)).toBe(100)
    expect(cleanMoneyAmount(10.004)).toBe(10)
  })

  it('keeps two-decimal cents when not near integer', () => {
    expect(cleanMoneyAmount(10.456)).toBe(10.46)
  })
})

describe('formatMoney', () => {
  it('formats with scale suffixes', () => {
    expect(formatMoney(2_500_000_000)).toBe('$2.50B')
    expect(formatMoney(3_000_000)).toBe('$3.00M')
    expect(formatMoney(1500)).toBe('$1.50K')
    expect(formatMoney(12.3)).toBe('$12.30')
  })

  it('supports CHF prefix and negatives', () => {
    expect(formatMoney(1000, 'CHF')).toBe('CHF 1.00K')
    expect(formatMoney(-2e9)).toBe('-$2.00B')
  })

  it('returns em dash for null/invalid', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(Number.NaN)).toBe('—')
  })
})

describe('formatPercent / formatMultiple', () => {
  it('formats ratios', () => {
    expect(formatPercent(0.1487)).toBe('14.9%')
    expect(formatPercent(0.1, 0)).toBe('10%')
    expect(formatMultiple(12.34)).toBe('12.3x')
  })

  it('handles missing values', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatMultiple(undefined)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})

import { describe, expect, it } from 'vitest'
import {
  equityShareCountLabel,
  isIndexSymbol,
  nasdaqAssetClassOrder,
  usesUnitLabel,
} from '../../src/lib/instrumentType'

describe('instrumentType', () => {
  it('detects index symbols', () => {
    expect(isIndexSymbol('^GSPC')).toBe(true)
    expect(isIndexSymbol('SPY')).toBe(false)
  })

  it('uses unit label for ETF and index', () => {
    expect(equityShareCountLabel('ETF', 'SPY')).toBe('Units')
    expect(equityShareCountLabel('EQUITY', 'AAPL')).toBe('Shares')
    expect(equityShareCountLabel(null, '^GSPC')).toBe('Units')
  })

  it('orders Nasdaq etf before stocks for ETFs', () => {
    expect(nasdaqAssetClassOrder('ETF', 'SPY')).toEqual(['etf', 'stocks'])
    expect(nasdaqAssetClassOrder('EQUITY', 'AAPL')).toEqual(['stocks', 'etf'])
  })

  it('uses unit modeling for mutual funds', () => {
    expect(usesUnitLabel('MUTUALFUND', 'VFIAX')).toBe(true)
  })
})

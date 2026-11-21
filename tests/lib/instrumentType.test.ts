import { describe, expect, it } from 'vitest'
import {
  equityPricePerUnitSuffix,
  equityShareCountAbbrev,
  equityShareCountLabel,
  instrumentTypeForHolding,
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

  it('resolves holding instrument type from linked scenario or symbol saves', () => {
    expect(
      instrumentTypeForHolding({ instrumentType: 'ETF' }, [{ instrumentType: 'EQUITY' }]),
    ).toBe('ETF')
    expect(instrumentTypeForHolding(null, [{ instrumentType: 'MUTUALFUND' }])).toBe('MUTUALFUND')
    expect(instrumentTypeForHolding(null, [])).toBeNull()
  })

  it('formats portfolio quantity and price suffixes from instrument type', () => {
    expect(equityShareCountAbbrev('ETF', 'SPY')).toBe('units')
    expect(equityShareCountAbbrev('EQUITY', 'AAPL')).toBe('sh')
    expect(equityPricePerUnitSuffix('INDEX', '^GSPC')).toBe('unit')
    expect(equityPricePerUnitSuffix('EQUITY', 'AAPL')).toBe('sh')
    expect(`${equityShareCountLabel('ETF', 'SPY')} held`).toBe('Units held')
  })
})

import { describe, expect, it } from 'vitest'
import type { SavedPortfolio, SavedScenario } from '../../src/types'
import {
  gatherAutoRefreshSymbols,
  normalizeQuoteSymbol,
} from '../../src/lib/quoteSymbol'

describe('normalizeQuoteSymbol', () => {
  it('accepts class shares, exchange suffixes, and indices', () => {
    expect(normalizeQuoteSymbol('brk.b')).toBe('BRK.B')
    expect(normalizeQuoteSymbol('NESN.SW')).toBe('NESN.SW')
    expect(normalizeQuoteSymbol('^GSPC')).toBe('^GSPC')
  })

  it('matches listed-option picker underlyings (no duplicate letter-only regex)', () => {
    for (const raw of ['BRK.B', 'BF.B', 'NESN.SW', 'AAPL']) {
      expect(normalizeQuoteSymbol(raw)).toBe(raw.toUpperCase())
    }
    expect(normalizeQuoteSymbol('A'.repeat(22))).toBeNull()
  })

  it('accepts OCC option symbols', () => {
    expect(normalizeQuoteSymbol('aapl260821c00150000')).toBe(
      'AAPL260821C00150000',
    )
  })

  it('rejects empty and invalid characters', () => {
    expect(normalizeQuoteSymbol('')).toBeNull()
    expect(normalizeQuoteSymbol('   ')).toBeNull()
    expect(normalizeQuoteSymbol('!!!')).toBeNull()
  })
})

function minimalScenario(symbol: string): SavedScenario {
  return {
    id: 's1',
    symbol,
    name: 'x',
    companyName: null,
    currency: 'USD',
    currentPrice: 1,
    currentMarketCap: null,
    sharesOutstanding: null,
    instrumentType: null,
    mcapOverride: null,
    easyRows: [],
    advancedRows: [],
    createdAt: '',
    updatedAt: '',
  }
}

describe('gatherAutoRefreshSymbols', () => {
  it('includes non–1–5-letter tickers that manual fetch supports', () => {
    const symbols = gatherAutoRefreshSymbols(
      [minimalScenario('BRK.B'), minimalScenario('nesn.sw')],
      [],
    )
    expect(symbols).toContain('BRK.B')
    expect(symbols).toContain('NESN.SW')
    expect(symbols).not.toContain('AAPL')
  })

  it('includes live OCC premiums and skips manual-only equity', () => {
    const now = new Date().toISOString()
    const portfolios: SavedPortfolio[] = [
      {
        id: 'p1',
        name: 'Test',
        currentCash: 0,
        deposits: [],
        actions: [],
        createdAt: now,
        updatedAt: now,
        holdings: [
          {
            id: 'h1',
            symbol: 'BRK.B',
            sharesHeld: 1,
            scenarioId: null,
            basis: 'easy',
            yearOverrides: [],
            manualCurrentPrice: null,
            manualOnly: false,
            option: {
              underlying: 'AAPL',
              expiration: '2030-12-19',
              right: 'C',
              strike: 150,
              multiplier: 100,
              occSymbol: 'AAPL301219C00150000',
            },
          },
          {
            id: 'h2',
            symbol: 'CASH',
            sharesHeld: 1,
            scenarioId: null,
            basis: 'easy',
            yearOverrides: [],
            manualCurrentPrice: 1,
            manualOnly: true,
          },
        ],
      },
    ]
    const symbols = gatherAutoRefreshSymbols([], portfolios)
    expect(symbols).toContain('AAPL301219C00150000')
    expect(symbols).not.toContain('CASH')
  })
})

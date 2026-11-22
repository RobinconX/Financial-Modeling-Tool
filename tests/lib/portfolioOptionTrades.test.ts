import { describe, expect, it } from 'vitest'
import { parseIbOptionDescription } from '../../src/lib/portfolioOptionTradeParse'
import { computeSymbolPerformance, normalizePortfolioTrade } from '../../src/lib/portfolioTrades'
import { buildComparablesTradeMarkers } from '../../src/lib/comparablesTradeChart'

const PORT_ID = '11111111-1111-4111-8111-111111111111'

describe('portfolio option trades', () => {
  it('parses IB-style option descriptions to OCC', () => {
    const c = parseIbOptionDescription('HIMS 16OCT26 25 P')
    expect(c?.occSymbol).toBe('HIMS261016P00025000')
    expect(c?.underlying).toBe('HIMS')
  })

  it('marks open short unrealized positive when OTM', () => {
    const open = normalizePortfolioTrade({
      portfolioId: PORT_ID,
      instrument: 'option',
      symbol: 'LMND271219P00045000',
      side: 'sell',
      tradeDate: '2026-01-30',
      shares: 1,
      price: 3,
      currency: 'USD',
    })
    const perf = computeSymbolPerformance(
      [open!],
      { price: 1.5, currency: 'USD', source: 'quote', asOfDate: null },
      '2026-06-01',
    )
    expect(perf?.ledgerShares).toBe(-1)
    expect(perf?.unrealizedPnl).toBeGreaterThan(0)
  })

  it('opens short premium and closes with return on premium received', () => {
    const open = normalizePortfolioTrade({
      portfolioId: PORT_ID,
      instrument: 'option',
      symbol: 'HIMS261016P00025000',
      side: 'sell',
      tradeDate: '2026-01-30',
      shares: 1,
      price: 5.43,
      currency: 'USD',
      fees: 2,
      feesCurrency: 'CHF',
    })
    const close = normalizePortfolioTrade({
      portfolioId: PORT_ID,
      instrument: 'option',
      symbol: 'HIMS261016P00025000',
      side: 'buy',
      tradeDate: '2026-02-01',
      shares: 1,
      price: 1.2,
      currency: 'USD',
    })
    expect(open).not.toBeNull()
    expect(close).not.toBeNull()
    const perf = computeSymbolPerformance(
      [open!, close!],
      { price: 0.5, currency: 'USD', source: 'quote', asOfDate: null },
      '2026-02-15',
    )
    expect(perf?.ledgerShares).toBe(0)
    expect(perf?.grossBuys).toBe(0)
    expect(perf?.grossPremiumReceived).toBeGreaterThan(0)
    expect(perf?.realizedPnl).toBeGreaterThan(0)
    expect(perf?.returnPct).toBeGreaterThan(0)
  })

  it('maps option trades to underlying comparables markers', () => {
    const t = normalizePortfolioTrade({
      portfolioId: PORT_ID,
      instrument: 'option',
      description: 'PLTR 19SEP25 47 C',
      side: 'sell',
      tradeDate: '2024-12-11',
      shares: 2,
      price: 29.33,
      currency: 'USD',
    })
    expect(t?.symbol).toContain('PLTR')
    const markers = buildComparablesTradeMarkers(
      [t!],
      new Set(['PLTR']),
      [
        {
          key: 'sc',
          symbol: 'PLTR',
          points: [
            { date: '2024-12-10', upside: 0.2 },
            { date: '2024-12-11', upside: 0.25 },
          ],
        },
      ],
    )
    expect(markers).toHaveLength(1)
    expect(markers[0]?.instrument).toBe('option')
    expect(markers[0]?.occSymbol).toBeTruthy()
  })
})
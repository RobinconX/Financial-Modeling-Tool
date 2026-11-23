import { describe, expect, it } from 'vitest'
import {
  computePortfolioPerformance,
  computeSymbolPerformance,
  normalizePortfolioTrade,
  normalizePortfolioTrades,
  equityHoldingForTradePrefill,
  holdingEquityTradeSymbol,
  positionPrefillFromHolding,
  resolveSymbolMark,
  tradedSymbolsFromTrades,
  tradesMatchingSymbol,
  upsertTrade,
} from '../../src/lib/portfolioTrades'
import type { SavedPortfolio } from '../../src/types'
import { parseAppDataSnapshot } from '../../src/lib/appDataSnapshot'
import { APP_DATA_SNAPSHOT_VERSION } from '../../src/lib/appDataSnapshot'

const PORT_ID = '11111111-1111-4111-8111-111111111111'

const holdingEquity = {
  id: 'h-eq',
  symbol: 'AAPL',
  sharesHeld: 12,
  scenarioId: null,
  basis: 'easy' as const,
  yearOverrides: [],
  manualCurrentPrice: 200,
  manualOnly: true,
}

const holdingOption = {
  ...holdingEquity,
  id: 'h-opt',
  symbol: 'AAPL',
  option: { occSymbol: 'AAPL260618C00180000', expiration: '2026-06-18', strike: 180, type: 'call' as const },
}

describe('portfolioTrades', () => {
  it('matches equity holdings for trade prefill by id or symbol, not options', () => {
    const book: SavedPortfolio = {
      id: PORT_ID,
      name: 'T',
      currentCash: 0,
      deposits: [],
      holdings: [holdingEquity, holdingOption],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(
      equityHoldingForTradePrefill(book, [], { holdingId: 'h-eq' })?.id,
    ).toBe('h-eq')
    expect(equityHoldingForTradePrefill(book, [], { holdingId: 'h-opt' })).toBeNull()
    expect(
      equityHoldingForTradePrefill(book, [], { symbol: 'aapl' })?.sharesHeld,
    ).toBe(12)
    const prefill = positionPrefillFromHolding(holdingEquity, {
      price: 210,
      currency: 'USD',
      source: 'manual',
      asOfDate: null,
    })
    expect(prefill).toEqual({ shares: 12, price: 210, holdingId: 'h-eq' })
  })

  it('matches holding when ticker comes from linked scenario symbol', () => {
    const book: SavedPortfolio = {
      id: PORT_ID,
      name: 'T',
      currentCash: 0,
      deposits: [],
      holdings: [
        {
          ...holdingEquity,
          id: 'h-scenario',
          symbol: '',
          scenarioId: 'sc-nvda',
          manualOnly: false,
        },
      ],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const scenarios = [
      {
        id: 'sc-nvda',
        symbol: 'NVDA',
        name: 'Nvidia',
        currentPrice: 500,
      } as import('../../src/types').SavedScenario,
    ]
    expect(holdingEquityTradeSymbol(book.holdings[0]!, scenarios)).toBe('NVDA')
    expect(
      equityHoldingForTradePrefill(book, scenarios, { symbol: 'nvda' })?.id,
    ).toBe('h-scenario')
  })

  it('normalizes agent-written rows with missing id and mixed-case symbol', () => {
    const t = normalizePortfolioTrade({
      portfolioId: PORT_ID,
      symbol: ' msft ',
      side: 'buy',
      tradeDate: '2024-06-01',
      shares: 5,
      price: 400,
    })
    expect(t).not.toBeNull()
    expect(t!.symbol).toBe('MSFT')
    expect(t!.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(t!.fees).toBe(0)
  })

  it('drops invalid trades on bulk normalize', () => {
    const state = normalizePortfolioTrades({
      version: 1,
      trades: [
        {
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'buy',
          tradeDate: '2024-01-01',
          shares: 1,
          price: 100,
        },
        { portfolioId: PORT_ID, symbol: 'BAD TICKER', side: 'buy', tradeDate: '2024-01-01', shares: 1, price: 1 },
        { portfolioId: '', symbol: 'X', side: 'nope', tradeDate: '2024-13-40', shares: -1, price: 0 },
      ],
    })
    expect(state.trades).toHaveLength(1)
    expect(state.trades[0]!.symbol).toBe('AAPL')
  })

  it('uses history close when no quote for symbol-only open position', () => {
    const emptyBook: SavedPortfolio = {
      id: PORT_ID,
      name: 'T',
      currentCash: 0,
      deposits: [],
      holdings: [],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const trades = normalizePortfolioTrades({
      version: 1,
      trades: [
        {
          id: '1',
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'buy',
          tradeDate: '2024-01-01',
          shares: 10,
          price: 100,
        },
      ],
    }).trades
    const asOf = '2024-06-20'
    const mark = resolveSymbolMark(
      'AAPL',
      emptyBook,
      [],
      [{ date: '2024-06-15', close: 150 }],
      asOf,
    )
    expect(mark).toMatchObject({ price: 150, source: 'history', asOfDate: '2024-06-15' })
    const whole = computePortfolioPerformance(
      trades,
      emptyBook,
      [],
      { AAPL: [{ date: '2024-06-15', close: 150 }] },
      asOf,
    )
    expect(whole.unrealizedPnl).toBeCloseTo(500, 4)
    expect(whole.totalPnl).toBeCloseTo(500, 4)
    expect(whole.returnPct).toBeCloseTo(0.5, 4)
  })

  it('ignores history points on OCC and marks intrinsic from underlying history', () => {
    const emptyBook: SavedPortfolio = {
      id: PORT_ID,
      name: 'T',
      currentCash: 0,
      deposits: [],
      holdings: [],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const occ = 'AAPL261119C00150000'
    const mark = resolveSymbolMark(
      occ,
      emptyBook,
      [],
      [{ date: '2024-06-15', close: 999 }],
      '2024-06-20',
      undefined,
      { AAPL: [{ date: '2024-06-15', close: 180 }] },
    )
    expect(mark).toMatchObject({ price: 30, source: 'history' })
  })

  it('defaults missing currency to USD on normalize', () => {
    const t = normalizePortfolioTrade({
      portfolioId: PORT_ID,
      symbol: 'AAPL',
      side: 'buy',
      tradeDate: '2024-01-01',
      shares: 1,
      price: 1,
    })
    expect(t?.currency).toBe('USD')
  })

  it('converts CHF buys against USD marks into display USD', () => {
    const trades = normalizePortfolioTrades({
      version: 1,
      trades: [
        {
          id: '1',
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'buy',
          tradeDate: '2024-01-01',
          shares: 10,
          price: 90,
          currency: 'CHF',
        },
      ],
    }).trades
    const emptyBook: SavedPortfolio = {
      id: PORT_ID,
      name: 'T',
      currentCash: 0,
      deposits: [],
      holdings: [],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const whole = computePortfolioPerformance(trades, emptyBook, [], {}, '2024-06-01', {
      displayCurrency: 'USD',
      usdToChf: 0.9,
      quoteCurrencyBySymbol: { AAPL: 'USD' },
    })
    expect(whole.grossBuys).toBeCloseTo(1000, 4)
  })

  it('computes average-cost realized and unrealized P&L', () => {
    const trades = normalizePortfolioTrades({
      version: 1,
      trades: [
        {
          id: '1',
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'buy',
          tradeDate: '2024-01-01',
          shares: 10,
          price: 100,
          fees: 10,
        },
        {
          id: '2',
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'sell',
          tradeDate: '2024-06-01',
          shares: 4,
          price: 120,
          fees: 2,
        },
      ],
    }).trades
    const perf = computeSymbolPerformance(trades, 130)!
    expect(perf.ledgerShares).toBe(6)
    expect(perf.realizedPnl).toBeCloseTo(4 * 120 - 2 - 4 * 101, 4)
    expect(perf.unrealizedPnl).toBeCloseTo(6 * 130 - 6 * 101, 4)
  })

  it('lists traded symbols including fully closed positions', () => {
    const trades = normalizePortfolioTrades({
      version: 1,
      trades: [
        {
          id: 'a',
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'buy',
          tradeDate: '2024-01-01',
          shares: 1,
          price: 1,
        },
        {
          id: 'b',
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'sell',
          tradeDate: '2024-02-01',
          shares: 1,
          price: 2,
        },
        {
          id: 'c',
          portfolioId: PORT_ID,
          symbol: 'XYZ',
          side: 'buy',
          tradeDate: '2024-01-01',
          shares: 1,
          price: 1,
        },
      ],
    }).trades
    expect(tradedSymbolsFromTrades(trades)).toEqual(['AAPL', 'XYZ'])
    const onlyAapl = tradesMatchingSymbol(trades, 'AAPL')
    expect(onlyAapl).toHaveLength(2)
    const emptyBook: SavedPortfolio = {
      id: PORT_ID,
      name: 'T',
      currentCash: 0,
      deposits: [],
      holdings: [],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const whole = computePortfolioPerformance(trades, emptyBook, [])
    expect(whole.symbols).toHaveLength(2)
    expect(whole.realizedPnl).toBeGreaterThan(0)
    const scoped = computePortfolioPerformance(onlyAapl, emptyBook, [])
    expect(scoped.symbols.map((s) => s.symbol)).toEqual(['AAPL'])
    expect(scoped.realizedPnl).toBe(whole.symbols.find((s) => s.symbol === 'AAPL')!.realizedPnl)
  })

  it('upsert replaces by id', () => {
    const base = normalizePortfolioTrades({
      version: 1,
      trades: [
        {
          id: 't1',
          portfolioId: PORT_ID,
          symbol: 'AAPL',
          side: 'buy',
          tradeDate: '2024-01-01',
          shares: 1,
          price: 1,
        },
      ],
    })
    const next = upsertTrade(base, {
      id: 't1',
      portfolioId: PORT_ID,
      symbol: 'AAPL',
      side: 'buy',
      tradeDate: '2024-01-01',
      shares: 2,
      price: 1,
    })
    expect(next.trades).toHaveLength(1)
    expect(next.trades[0]!.shares).toBe(2)
  })
})

describe('portfolioTrades snapshot import', () => {
  it('parses agent-written portfolioTrades from a save file', () => {
    const parsed = parseAppDataSnapshot({
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [
        {
          id: PORT_ID,
          name: 'Main',
          currentCash: 0,
          deposits: [],
          holdings: [],
          actions: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
      portfolioTrades: {
        version: 1,
        trades: [
          {
            portfolioId: PORT_ID,
            symbol: 'nvda',
            side: 'buy',
            tradeDate: '2025-05-20',
            shares: 3,
            price: 950,
          },
        ],
      },
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.portfolioTrades?.trades).toHaveLength(1)
    expect(parsed.portfolioTrades?.trades[0]).toMatchObject({
      symbol: 'NVDA',
      shares: 3,
      portfolioId: PORT_ID,
    })
    expect(parsed.portfolioTrades?.trades[0]!.id).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
import { describe, expect, it } from 'vitest'
import { emptyPortfolioContributions } from '../../src/lib/portfolioContributions'
import {
  breakdownTotalMatchesCard,
  buildPerformanceMetricBreakdown,
} from '../../src/lib/portfolioPerformanceBreakdown'
import {
  computeCapitalContributionStats,
  computePeakPortfolioValue,
} from '../../src/lib/portfolioReturnMetrics'
import { normalizePortfolioTrade, computePortfolioPerformance } from '../../src/lib/portfolioTrades'
import { computeOptionsPerformanceAggregate } from '../../src/lib/portfolioOptionsPerformance'
import { newPortfolio } from '../../src/lib/portfolio'
import type { PortfolioTrade, SavedPortfolio } from '../../src/types'
import { computeMoneyWeightedReturn, computePortfolioTerminalNav } from '../../src/lib/portfolioReturnMetrics'
import { cashTabBalanceDisplayAsOf } from '../../src/lib/portfolioCashTab'
import { computeEquityBookTimeWeightedReturn } from '../../src/lib/portfolioReturnMetrics'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'

const PORT_ID = '11111111-1111-4111-8111-111111111111'

function robinLikeTrades(): PortfolioTrade[] {
  const openLmnd = normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    symbol: 'LMND271219P00045000',
    side: 'sell',
    tradeDate: '2026-01-15',
    shares: 1,
    price: 3.2,
    currency: 'USD',
    fees: 1.5,
    feesCurrency: 'CHF',
  })!
  const pltrShort = normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    symbol: 'PLTR250919C00047000',
    side: 'sell',
    tradeDate: '2025-06-01',
    shares: 2,
    price: 4.5,
    currency: 'USD',
  })!
  const pltrAssign = normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    symbol: 'PLTR250919C00047000',
    side: 'buy',
    tradeDate: '2025-09-19',
    shares: 2,
    price: 0,
    event: 'assign',
    currency: 'USD',
  })!
  const pltrSell = normalizePortfolioTrade({
    portfolioId: PORT_ID,
    symbol: 'PLTR',
    side: 'sell',
    tradeDate: '2025-09-19',
    shares: 200,
    price: 47,
    currency: 'USD',
  })!
  const fuboBuy = normalizePortfolioTrade({
    portfolioId: PORT_ID,
    symbol: 'FUBO',
    side: 'buy',
    tradeDate: '2025-03-01',
    shares: 16.6667,
    price: 41.04,
    currency: 'USD',
  })!
  const expirePut = normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    symbol: 'HIMS261016P00025000',
    side: 'sell',
    tradeDate: '2026-02-01',
    shares: 1,
    price: 2.1,
    currency: 'USD',
  })!
  const expireEvent = normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    symbol: 'HIMS261016P00025000',
    side: 'buy',
    tradeDate: '2026-10-17',
    shares: 1,
    price: 0,
    event: 'expire',
    currency: 'USD',
  })!
  return [
    openLmnd,
    pltrShort,
    pltrAssign,
    pltrSell,
    fuboBuy,
    expirePut,
    expireEvent,
  ]
}

describe('portfolioPerformanceBreakdown', () => {
  it('open short option unrealized is positive when mark below premium', () => {
    const trades = robinLikeTrades().filter((t) => t.symbol === 'LMND271219P00045000')
    const book: SavedPortfolio = {
      ...newPortfolio('Robin-like'),
      id: PORT_ID,
      holdings: [
        {
          id: 'h-lmnd-put',
          symbol: 'LMND',
          sharesHeld: -1,
          scenarioId: null,
          basis: 'easy',
          yearOverrides: [],
          manualCurrentPrice: 1.5,
          manualOnly: true,
          option: {
            underlying: 'LMND',
            expiration: '2027-12-19',
            right: 'P',
            strike: 45,
            multiplier: 100,
            occSymbol: 'LMND271219P00045000',
          },
        },
      ],
    }
    const perf = computePortfolioPerformance(
      trades,
      book,
      [],
      {
        LMND: [{ date: '2026-06-01', close: 60 }],
      },
      '2026-06-01',
      {
        displayCurrency: 'USD',
        usdToChf: 0.9,
        quoteCurrencyBySymbol: { LMND: 'USD' },
      },
    )
    const lmnd = perf.symbols[0]!
    expect(lmnd.ledgerShares).toBeLessThan(0)
    expect(lmnd.unrealizedPnl).toBeGreaterThan(0)
  })

  it('breakdown totals match card values', () => {
    const trades = robinLikeTrades()
    const book: SavedPortfolio = {
      ...newPortfolio('Robin-like'),
      id: PORT_ID,
      deposits: [
        {
          id: 'o',
          year: 2026,
          amount: 25_000,
          isOpening: true,
        },
      ],
      holdings: [
        {
          id: 'h-fubo',
          symbol: 'FUBO',
          sharesHeld: 16.6667,
          scenarioId: null,
          basis: 'easy',
          yearOverrides: [],
          manualCurrentPrice: 5,
          manualOnly: true,
        },
        {
          id: 'h-pltr',
          symbol: 'PLTR',
          sharesHeld: 0,
          scenarioId: null,
          basis: 'easy',
          yearOverrides: [],
          manualCurrentPrice: 50,
          manualOnly: true,
        },
      ],
    }
    const perfCtx: PerfDisplayContext = {
      displayCurrency: 'USD',
      usdToChf: 0.9,
      quoteCurrencyBySymbol: {
        FUBO: 'USD',
        PLTR: 'USD',
        LMND271219P00045000: 'USD',
      },
    }
    const asOf = '2026-06-01'
    const summary = computePortfolioPerformance(trades, book, [], {}, asOf, perfCtx)
    const capitalStats = computeCapitalContributionStats(trades, asOf, perfCtx)
    const optionsAggregate = computeOptionsPerformanceAggregate(
      trades,
      book,
      [],
      {},
      asOf,
      perfCtx,
    )
    const peakPortfolio = computePeakPortfolioValue(
      trades,
      book,
      [],
      {},
      asOf,
      perfCtx,
      2026,
    )
    const cashMeta = cashTabBalanceDisplayAsOf(book, [], asOf, 'USD', 0.9, 2026)
    const terminalNav = computePortfolioTerminalNav(summary, cashMeta.amount)
    const snapshotMwr = computeMoneyWeightedReturn(trades, terminalNav, asOf, perfCtx)
    const snapshotTwr = computeEquityBookTimeWeightedReturn(
      new Map([
        ['FUBO', trades.filter((t) => t.symbol === 'FUBO')],
        ['PLTR', trades.filter((t) => t.symbol === 'PLTR')],
      ]),
      { FUBO: [{ date: '2026-06-01', close: 5 }], PLTR: [{ date: '2026-06-01', close: 50 }] },
      asOf,
      perfCtx,
    )
    const snapshotReturnPct =
      capitalStats.peakNet > 0 ? summary.totalPnl / capitalStats.peakNet : null
    const ctx = {
      trades,
      portfolio: book,
      scenarios: [],
      histories: {},
      asOfDate: asOf,
      perfCtx,
      currentYear: 2026,
      contributions: emptyPortfolioContributions('USD'),
      summary,
      capitalStats,
      peakPortfolio,
      optionsAggregate,
      scopeSymbol: null,
      snapshotReturnPct,
      snapshotTwr,
      snapshotMwr,
      equityTradesBySymbol: new Map([
        ['FUBO', trades.filter((t) => t.symbol === 'FUBO')],
        ['PLTR', trades.filter((t) => t.symbol === 'PLTR')],
      ]),
    }
    expect(
      breakdownTotalMatchesCard(
        buildPerformanceMetricBreakdown('realized', ctx),
        summary.realizedPnl,
      ),
    ).toBe(true)
    expect(
      breakdownTotalMatchesCard(
        buildPerformanceMetricBreakdown('unrealized', ctx),
        summary.unrealizedPnl,
      ),
    ).toBe(true)
    expect(
      breakdownTotalMatchesCard(
        buildPerformanceMetricBreakdown('totalPnl', ctx),
        summary.totalPnl,
      ),
    ).toBe(true)
    expect(
      breakdownTotalMatchesCard(
        buildPerformanceMetricBreakdown('netCapital', ctx),
        capitalStats.currentNet,
      ),
    ).toBe(true)
    expect(
      breakdownTotalMatchesCard(
        buildPerformanceMetricBreakdown('peakNetInvested', ctx),
        capitalStats.peakNet,
      ),
    ).toBe(true)
    if (optionsAggregate) {
      expect(
        breakdownTotalMatchesCard(
          buildPerformanceMetricBreakdown('optionsTotal', ctx),
          optionsAggregate.totalPnl,
        ),
      ).toBe(true)
    }
  })
})
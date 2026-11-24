import { describe, expect, it } from 'vitest'
import type { PortfolioExternalCashFlow, PortfolioTrade } from '../../src/types'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import {
  derivedCashBalanceThrough,
  stepDerivedCashBalance,
} from '../../src/lib/portfolioDerivedCash'
import { buildFullReturnProgression } from '../../src/lib/portfolioReturnProgression'
import { externalCfByDate } from '../../src/lib/portfolioExternalCash'
import { tradeDayNetCashFlow } from '../../src/lib/portfolioReturnMetrics'
import { withAutoExpireTrades } from '../../src/lib/portfolioTradeLedger'
import { newPortfolio } from '../../src/lib/portfolio'

const perfCtx: PerfDisplayContext = {
  displayCurrency: 'CHF',
  usdToChf: 0.9,
  quoteCurrencyBySymbol: {},
}

function addUtcDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`)
  const d = new Date(t + days * 86_400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function buy(id: string, date: string, shares: number, price: number): PortfolioTrade {
  return {
    id,
    portfolioId: 'p1',
    symbol: 'NESN',
    side: 'buy',
    tradeDate: date,
    shares,
    price,
    currency: 'CHF',
  }
}

function makeTrades(n: number): PortfolioTrade[] {
  const out: PortfolioTrade[] = []
  let d = '2024-01-04'
  for (let i = 0; i < n; i++) {
    out.push(buy(`t-${i}`, d, 1, 100))
    d = addUtcDays(d, 3)
  }
  return out
}

function makeDeposits(): PortfolioExternalCashFlow[] {
  const out: PortfolioExternalCashFlow[] = []
  let d = '2024-01-04'
  for (let i = 0; i < 18; i++) {
    out.push({
      id: `dep-${i}`,
      portfolioId: 'p1',
      flowDate: d,
      amount: 5000,
      direction: 'deposit',
      currency: 'CHF',
    })
    d = addUtcDays(d, 55)
  }
  return out
}

function incrementalCashThrough(
  trades: PortfolioTrade[],
  throughDate: string,
  externalByDate: Map<string, number>,
): number {
  let cash = 0
  let date = '2024-01-02'
  while (date <= throughDate) {
    const expanded = withAutoExpireTrades(trades, date)
    const dayTrades = expanded.filter((t) => t.tradeDate === date)
    const ext = externalByDate.get(date) ?? 0
    cash = stepDerivedCashBalance(cash, dayTrades, ext, perfCtx)
    date = addUtcDays(date, 1)
  }
  return cash
}

describe('derived cash incremental vs legacy', () => {
  const trades = makeTrades(120)
  const flows = makeDeposits()
  const externalByDate = externalCfByDate(flows, perfCtx)

  it('matches legacy balance on sample dates', () => {
    const dates = ['2024-06-01', '2025-01-15', '2026-11-05']
    for (const d of dates) {
      const legacy = derivedCashBalanceThrough(trades, d, externalByDate, perfCtx)
      const inc = incrementalCashThrough(trades, d, externalByDate)
      expect(inc).toBeCloseTo(legacy, 6)
    }
  })

  it('incremental cash walk beats legacy per-day balance', () => {
    const asOf = '2026-11-05'
    const t0 = performance.now()
    let date = '2024-01-04'
    while (date <= asOf) {
      derivedCashBalanceThrough(trades, date, externalByDate, perfCtx)
      date = addUtcDays(date, 1)
    }
    const legacyMs = performance.now() - t0

    let cash = 0
    const t1 = performance.now()
    date = '2024-01-04'
    while (date <= asOf) {
      const expanded = withAutoExpireTrades(trades, date)
      const dayTrades = expanded.filter((t) => t.tradeDate === date)
      cash = stepDerivedCashBalance(
        cash,
        dayTrades,
        externalByDate.get(date) ?? 0,
        perfCtx,
      )
      date = addUtcDays(date, 1)
    }
    const incrementalMs = performance.now() - t1
    expect(Number.isFinite(cash)).toBe(true)

    expect(legacyMs).toBeGreaterThan(incrementalMs * 3)
    expect(incrementalMs).toBeLessThan(500)
  })

  it('full progression over ~1000 days finishes quickly', () => {
    const asOf = '2026-11-05'
    const portfolio = { ...newPortfolio('Perf'), id: 'p1', currentCash: 0 }
    const histories = { NESN: [{ date: '2024-01-02', close: 100 }] }
    const t0 = performance.now()
    buildFullReturnProgression({
      trades,
      portfolio,
      scenarios: [],
      historiesBySymbol: histories,
      asOfDate: asOf,
      perfCtx,
      externalFlows: flows,
    })
    expect(performance.now() - t0).toBeLessThan(2500)
  })

  it('step matches manual sum of day flows', () => {
    const tradesSmall = [buy('one', '2024-01-04', 10, 50)]
    const ext = new Map<string, number>([['2024-01-04', 1000]])
    let cash = 0
    const expanded = withAutoExpireTrades(tradesSmall, '2024-01-04')
    const dayTrades = expanded.filter((t) => t.tradeDate === '2024-01-04')
    cash = stepDerivedCashBalance(cash, dayTrades, ext.get('2024-01-04')!, perfCtx)
    const manual =
      1000 - tradeDayNetCashFlow(dayTrades, perfCtx)
    expect(cash).toBeCloseTo(manual, 6)
  })
})
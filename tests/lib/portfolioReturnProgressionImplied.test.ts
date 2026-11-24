import { describe, expect, it } from 'vitest'
import { buildFullReturnProgression } from '../../src/lib/portfolioReturnProgression'
import type { PortfolioExternalCashFlow, PortfolioTrade, SavedScenario } from '../../src/types'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import { newPortfolio } from '../../src/lib/portfolio'

const portfolio = { ...newPortfolio('Book'), id: 'p1', currentCash: 0 }
const scenarios: SavedScenario[] = []
const perfCtx: PerfDisplayContext = {
  displayCurrency: 'USD',
  usdToChf: null,
  quoteCurrencyBySymbol: {},
}

function buy(date: string, shares: number, price: number): PortfolioTrade {
  return {
    id: `b-${date}`,
    portfolioId: 'p1',
    symbol: 'TEST',
    side: 'buy',
    tradeDate: date,
    shares,
    price,
    currency: 'USD',
  }
}

describe('trades before first wire (no implied adjustments)', () => {
  const histories = {
    TEST: [{ date: '2022-05-01', close: 100 }],
  }

  it('allows negative cash and does not pin TWR at -100%', () => {
    const trades = [buy('2022-05-09', 10, 100)]
    const wires: PortfolioExternalCashFlow[] = [
      {
        id: 'w1',
        portfolioId: 'p1',
        flowDate: '2024-01-04',
        amount: 10_000,
        direction: 'deposit',
        currency: 'USD',
      },
    ]
    const external = buildFullReturnProgression({
      trades,
      portfolio,
      scenarios,
      historiesBySymbol: histories,
      asOfDate: '2024-06-01',
      perfCtx,
      externalFlows: wires,
    })
    const lastExt = external.points.at(-1)!.twrPct
    expect(lastExt).not.toBeNull()
    expect(lastExt!).toBeGreaterThan(-0.5)
    expect(lastExt!).not.toBeCloseTo(-1, 1)
  })
})
import { describe, expect, it } from 'vitest'
import { buildFullReturnProgression } from '../../src/lib/portfolioReturnProgression'
import type { PortfolioExternalCashFlow, PortfolioTrade, SavedScenario } from '../../src/types'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import { newPortfolio } from '../../src/lib/portfolio'

/** Frozen at 0668561 (#84) behaviour — trades before first wire, short window. */
const TWR84_GOLDEN = [0, 0, 0, 0]

const portfolio = { ...newPortfolio('B'), id: 'p1', currentCash: 0 }
const scenarios: SavedScenario[] = []
const perfCtx: PerfDisplayContext = {
  displayCurrency: 'USD',
  usdToChf: null,
  quoteCurrencyBySymbol: {},
}

describe('TWR series regression (#84 math)', () => {
  it('matches #84 twrPct series on Robin-shaped fixture', () => {
    const trades: PortfolioTrade[] = [
      {
        id: 'b',
        portfolioId: 'p1',
        symbol: 'TEST',
        side: 'buy',
        tradeDate: '2022-05-09',
        shares: 10,
        price: 100,
        currency: 'USD',
      },
    ]
    const wires: PortfolioExternalCashFlow[] = [
      {
        id: 'w',
        portfolioId: 'p1',
        flowDate: '2024-01-04',
        amount: 10_000,
        direction: 'deposit',
        currency: 'USD',
      },
    ]
    const r = buildFullReturnProgression({
      trades,
      portfolio,
      scenarios,
      historiesBySymbol: { TEST: [{ date: '2022-05-01', close: 100 }] },
      asOfDate: '2022-05-12',
      perfCtx,
      externalFlows: wires,
    })
    const series = r.points.map((p) => p.twrPct)
    expect(series).toEqual(TWR84_GOLDEN)
    expect(r.impliedCashTopUps).toEqual([{ date: '2022-05-09', amount: 1000 }])
  })
})
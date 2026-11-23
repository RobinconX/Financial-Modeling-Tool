import { describe, expect, it } from 'vitest'
import {
  buildFullReturnProgression,
  computeBookTimeWeightedReturn,
} from '../../src/lib/portfolioReturnProgression'
import type { PortfolioTrade, SavedScenario } from '../../src/types'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import { newPortfolio } from '../../src/lib/portfolio'

const portfolio = { ...newPortfolio('Test'), id: 'p1' }

const scenarios: SavedScenario[] = []

function buy(
  sym: string,
  date: string,
  shares: number,
  price: number,
): PortfolioTrade {
  return {
    id: `${sym}-${date}`,
    portfolioId: 'p1',
    symbol: sym,
    side: 'buy',
    tradeDate: date,
    shares,
    price,
    currency: 'USD',
  }
}

describe('buildFullReturnProgression', () => {
  const perfCtx: PerfDisplayContext = {
    displayCurrency: 'USD',
    usdToChf: null,
    quoteCurrencyBySymbol: {},
  }

  it('links TWR when underlying history exists for equity only book', () => {
    const trades = [buy('AAPL', '2024-01-02', 10, 100)]
    const histories = {
      AAPL: [
        { date: '2024-01-02', close: 100 },
        { date: '2024-01-03', close: 110 },
      ],
    }
    const r = buildFullReturnProgression({
      trades,
      portfolio,
      scenarios,
      historiesBySymbol: histories,
      asOfDate: '2024-01-03',
      perfCtx,
    })
    const last = r.points.at(-1)!
    expect(last.twrPct).not.toBeNull()
    expect(last.twrPct! > 0).toBe(true)
    const scalar = computeBookTimeWeightedReturn({
      trades,
      portfolio,
      scenarios,
      historiesBySymbol: histories,
      asOfDate: '2024-01-03',
      perfCtx,
    })
    expect(scalar.twr).toBeCloseTo(last.twrPct!, 6)
  })

  it('computes cumulative MWR from NAV and peak net capital', () => {
    const trades = [buy('AAPL', '2024-01-02', 10, 100)]
    const histories = {
      AAPL: [
        { date: '2024-01-02', close: 100 },
        { date: '2024-01-03', close: 110 },
      ],
    }
    const r = buildFullReturnProgression({
      trades,
      portfolio,
      scenarios,
      historiesBySymbol: histories,
      asOfDate: '2024-01-03',
      perfCtx,
    })
    expect(r.points.at(-1)?.mwrCumPct).not.toBeNull()
  })
})
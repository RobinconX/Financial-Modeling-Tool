import { describe, expect, it } from 'vitest'
import {
  buildFullReturnProgression,
  computeBookTimeWeightedReturn,
  portfolioPositionsValueOnDate,
} from '../../src/lib/portfolioReturnProgression'
import type { PortfolioTrade, SavedScenario } from '../../src/types'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import { newPortfolio } from '../../src/lib/portfolio'

const portfolio = { ...newPortfolio('Test'), id: 'p1', currentCash: 50_000 }

const scenarios: SavedScenario[] = []

const perfCtx: PerfDisplayContext = {
  displayCurrency: 'USD',
  usdToChf: null,
  quoteCurrencyBySymbol: {},
}

function buy(
  sym: string,
  date: string,
  shares: number,
  price: number,
): PortfolioTrade {
  return {
    id: `${sym}-${date}-${shares}`,
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
  it('links TWR with price appreciation and aligns snapshot scalar', () => {
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
    expect(last.twrPct!).toBeCloseTo(0.1, 4)
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

  it('does not spike TWR when adding shares at unchanged marks', () => {
    const trades = [
      buy('AAPL', '2024-01-02', 10, 100),
      buy('AAPL', '2024-01-03', 10, 100),
    ]
    const histories = {
      AAPL: [
        { date: '2024-01-02', close: 100 },
        { date: '2024-01-03', close: 100 },
        { date: '2024-01-04', close: 100 },
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
    const day3 = r.points.find((p) => p.date === '2024-01-03')
    expect(day3?.twrPct).not.toBeNull()
    expect(day3!.twrPct!).toBeCloseTo(0, 4)
  })

  it('uses positions-only NAV excluding cash tab', () => {
    const trades = [buy('AAPL', '2024-01-02', 10, 100)]
    const histories = { AAPL: [{ date: '2024-01-02', close: 100 }] }
    const { value } = portfolioPositionsValueOnDate(
      trades,
      portfolio,
      scenarios,
      histories,
      '2024-01-02',
      perfCtx,
    )
    expect(value).toBeCloseTo(1000, 4)
  })

  it('records net invested capital on progression points', () => {
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
    expect(r.points.at(-1)?.netInvested).toBeCloseTo(1000, 4)
    expect(r.points.at(-1)?.positionsNav).toBeCloseTo(1100, 4)
  })
})
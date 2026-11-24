import { describe, expect, it } from 'vitest'
import { buildFullReturnProgression } from '../../src/lib/portfolioReturnProgression'
import type { PortfolioExternalCashFlow, PortfolioTrade, SavedScenario } from '../../src/types'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import { newPortfolio } from '../../src/lib/portfolio'

const portfolio = { ...newPortfolio('Test'), id: 'p1', currentCash: 0 }
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

describe('external-flow TWR', () => {
  it('uses approximate method when no external rows', () => {
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
    expect(r.twrMethod).toBe('approximate')
    expect(r.points.at(-1)?.twrPct).toBeCloseTo(0.1, 4)
  })

  it('keeps TWR near flat when deposit funds a same-day buy at flat marks', () => {
    const trades = [buy('AAPL', '2024-01-02', 10, 100)]
    const flows: PortfolioExternalCashFlow[] = [
      {
        id: 'f1',
        portfolioId: 'p1',
        flowDate: '2024-01-02',
        amount: 1000,
        direction: 'deposit',
        currency: 'USD',
      },
    ]
    const histories = {
      AAPL: [
        { date: '2024-01-02', close: 100 },
        { date: '2024-01-03', close: 100 },
      ],
    }
    const r = buildFullReturnProgression({
      trades,
      portfolio,
      scenarios,
      historiesBySymbol: histories,
      asOfDate: '2024-01-03',
      perfCtx,
      externalFlows: flows,
    })
    expect(r.twrMethod).toBe('external')
    const day3 = r.points.find((p) => p.date === '2024-01-03')
    expect(day3?.twrPct).not.toBeNull()
    expect(day3!.twrPct!).toBeCloseTo(0, 3)
    expect(r.points.at(-1)?.positionsNav).toBeCloseTo(1000, 4)
  })

  it('reports appreciation on full NAV after funded buy', () => {
    const trades = [buy('AAPL', '2024-01-02', 10, 100)]
    const flows: PortfolioExternalCashFlow[] = [
      {
        id: 'f1',
        portfolioId: 'p1',
        flowDate: '2024-01-02',
        amount: 1000,
        direction: 'deposit',
        currency: 'USD',
      },
    ]
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
      externalFlows: flows,
    })
    expect(r.points.at(-1)?.twrPct).toBeCloseTo(0.1, 3)
  })
})
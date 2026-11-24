import { describe, expect, it } from 'vitest'
import { buildFullReturnProgression } from '../../src/lib/portfolioReturnProgression'
import { computeDerivedCashReconciliation } from '../../src/lib/portfolioDerivedCash'
import { externalCfByDate } from '../../src/lib/portfolioExternalCash'
import type { PortfolioExternalCashFlow, PortfolioTrade, SavedScenario } from '../../src/types'
import type { PerfDisplayContext } from '../../src/lib/portfolioTradeFx'
import { newPortfolio } from '../../src/lib/portfolio'

const portfolio = { ...newPortfolio('Book'), id: 'p1', currentCash: 0 }
const scenarios: SavedScenario[] = []
const histories = { TEST: [{ date: '2024-01-01', close: 100 }] }

describe('negative derived cash (margin)', () => {
  const perfCtxChf: PerfDisplayContext = {
    displayCurrency: 'CHF',
    usdToChf: 0.85,
    quoteCurrencyBySymbol: {},
  }

  it('keeps TWR finite when CHF wire is smaller than USD buy on same day (FX mismatch)', () => {
    const trades: PortfolioTrade[] = [
      {
        id: 'b1',
        portfolioId: 'p1',
        symbol: 'TEST',
        side: 'buy',
        tradeDate: '2024-01-02',
        shares: 10,
        price: 100,
        currency: 'USD',
      },
    ]
    const wires: PortfolioExternalCashFlow[] = [
      {
        id: 'w1',
        portfolioId: 'p1',
        flowDate: '2024-01-02',
        amount: 800,
        direction: 'deposit',
        currency: 'CHF',
      },
    ]
    const byDate = externalCfByDate(wires, perfCtxChf)
    const recon = computeDerivedCashReconciliation(
      trades,
      '2024-06-01',
      byDate,
      perfCtxChf,
    )
    expect(recon.derivedCashToday).toBeLessThan(0)
    expect(recon.negativeCashDays).toBeGreaterThan(0)

    const r = buildFullReturnProgression({
      trades,
      portfolio,
      scenarios,
      historiesBySymbol: histories,
      asOfDate: '2024-06-01',
      perfCtx: perfCtxChf,
      externalFlows: wires,
    })
    const twr = r.points.at(-1)!.twrPct
    expect(twr).not.toBeNull()
    expect(twr!).toBeGreaterThan(-0.99)
    expect(twr!).not.toBeCloseTo(-1, 2)
  })
})
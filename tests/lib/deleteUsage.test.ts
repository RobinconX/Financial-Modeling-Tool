import { describe, expect, it } from 'vitest'
import {
  deleteScenarioConfirmMessage,
  incomeCostScenarioUsage,
  portfolioScenarioUsage,
  portfoliosUsingScenario,
  savingsAccountUsage,
  stockProjectionScenarioUsage,
} from '../../src/lib/deleteUsage'
import type {
  OverviewScenario,
  SavedComparable,
  SavedPortfolio,
} from '../../src/types'
import { newHolding, newOpeningDeposit, newPortfolio } from '../../src/lib/portfolio'
import { newOverviewScenario, newOverviewSeries } from '../../src/lib/overview'

function portfolio(
  id: string,
  name: string,
  holdings: { scenarioId: string | null; manualOnly?: boolean }[],
  deposits: SavedPortfolio['deposits'] = [newOpeningDeposit(0, 2026)],
  perpetualYearlyDeposit?: SavedPortfolio['perpetualYearlyDeposit'],
): SavedPortfolio {
  const p = newPortfolio(name)
  return {
    ...p,
    id,
    name,
    deposits,
    perpetualYearlyDeposit,
    holdings: holdings.map((h, i) => ({
      ...newHolding('AAA'),
      id: `h-${id}-${i}`,
      scenarioId: h.scenarioId,
      manualOnly: h.manualOnly,
    })),
  }
}

describe('portfoliosUsingScenario', () => {
  it('lists portfolios with non-manual holdings linked to the scenario', () => {
    const portfolios = [
      portfolio('p1', 'Growth', [{ scenarioId: 'sc1' }, { scenarioId: 'sc1' }]),
      portfolio('p2', 'Cash only', [{ scenarioId: null, manualOnly: true }]),
      portfolio('p3', 'Retirement', [{ scenarioId: 'sc1' }, { scenarioId: 'sc2' }]),
    ]
    const usage = portfoliosUsingScenario('sc1', portfolios)
    expect(usage).toEqual([
      { portfolioId: 'p1', portfolioName: 'Growth', holdingCount: 2 },
      { portfolioId: 'p3', portfolioName: 'Retirement', holdingCount: 1 },
    ])
  })
})

describe('incomeCostScenarioUsage', () => {
  it('names portfolio surplus deposits and overview bindings', () => {
    const icId = 'ic-2026'
    const deposits = [
      newOpeningDeposit(0, 2026),
      {
        id: 'd1',
        year: 2027,
        amount: 0,
        source: 'surplus' as const,
        surplusScenarioId: icId,
        surplusPercent: 50,
      },
    ]
    const portfolios = [
      portfolio('p1', 'Growth', [], deposits, {
        amount: 0,
        source: 'surplus',
        surplusScenarioId: icId,
        surplusPercent: 25,
      }),
    ]
    const ov = newOverviewScenario('Base', 0)
    const series = newOverviewSeries({ type: 'manual', name: 'Side fund' }, 0)
    series.yearBindings = [{ year: 2026, incomeCostScenarioId: icId, percent: 40 }]
    const overviewScenarios: OverviewScenario[] = [{ ...ov, series: [series] }]
    const usage = incomeCostScenarioUsage(icId, portfolios, overviewScenarios)
    expect(usage.refs.some((r) => r.where.includes('Growth') && r.detail.includes('Surplus'))).toBe(
      true,
    )
    expect(usage.refs.some((r) => r.where.includes('Overview') && r.detail.includes('2026'))).toBe(
      true,
    )
  })
})

describe('portfolioScenarioUsage', () => {
  it('lists overview series for a portfolio id', () => {
    const ov = newOverviewScenario('Wealth path', 0)
    const series = newOverviewSeries({ type: 'portfolio', name: 'Main book', portfolioId: 'p99' }, 0)
    const usage = portfolioScenarioUsage('p99', [{ ...ov, series: [series] }])
    expect(usage.refs).toHaveLength(1)
    expect(usage.refs[0]!.where).toContain('Wealth path')
  })
})

describe('savingsAccountUsage', () => {
  it('lists overview savings series', () => {
    const ov = newOverviewScenario('Stack', 0)
    const series = newOverviewSeries(
      { type: 'savings', name: 'Emergency', savingsAccountId: 'sa-1' },
      0,
    )
    const usage = savingsAccountUsage('sa-1', [{ ...ov, series: [series] }])
    expect(usage.refs[0]!.detail).toContain('Emergency')
  })
})

describe('stockProjectionScenarioUsage', () => {
  it('merges holdings and comparables', () => {
    const portfolios = [portfolio('p1', 'Growth', [{ scenarioId: 'sc1' }])]
    const comparables: SavedComparable[] = [
      {
        id: 'c1',
        name: 'Watchlist',
        entries: [{ scenarioId: 'sc1', basis: 'easy' }],
        sortYear: null,
        sortDir: 'desc',
        filterYears: [],
        createdAt: '',
        updatedAt: '',
      },
    ]
    const usage = stockProjectionScenarioUsage('sc1', portfolios, comparables)
    expect(usage.refs).toHaveLength(2)
    expect(usage.refs.some((r) => r.where.includes('Comparables'))).toBe(true)
  })
})

describe('deleteScenarioConfirmMessage', () => {
  it('builds legacy string message', () => {
    const msg = deleteScenarioConfirmMessage('AAPL', 'Base', [
      { portfolioId: 'p1', portfolioName: 'Growth', holdingCount: 2 },
    ])
    expect(msg).toContain('Growth')
    expect(msg).toContain('AAPL · Base')
  })
})

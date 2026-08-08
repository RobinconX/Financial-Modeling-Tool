import { describe, expect, it } from 'vitest'
import {
  deleteScenarioConfirmMessage,
  portfoliosUsingScenario,
} from '../../src/lib/scenarioUsage'
import type { SavedPortfolio } from '../../src/types'
import { newHolding, newOpeningDeposit, newPortfolio } from '../../src/lib/portfolio'

function portfolio(
  id: string,
  name: string,
  holdings: { scenarioId: string | null; manualOnly?: boolean }[],
): SavedPortfolio {
  const p = newPortfolio(name)
  return {
    ...p,
    id,
    name,
    deposits: [newOpeningDeposit(0, 2026)],
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

  it('builds a stronger confirm message when used in portfolios', () => {
    const usage = [
      { portfolioId: 'p1', portfolioName: 'Growth', holdingCount: 2 },
    ]
    const msg = deleteScenarioConfirmMessage('AAPL', 'Base', usage)
    expect(msg).toContain('Growth')
    expect(msg).toContain('AAPL · Base')
    expect(msg).toContain('Delete')
  })
})

import { describe, expect, it } from 'vitest'
import { pickComparePanelBScenario } from '../../src/lib/comparePanelSelection'
import type { SavedScenario } from '../../src/types'

function sc(
  partial: Partial<SavedScenario> & Pick<SavedScenario, 'id' | 'symbol' | 'name'>,
): SavedScenario {
  return {
    companyName: null,
    currency: 'USD',
    currentPrice: 10,
    currentMarketCap: 1000,
    sharesOutstanding: 100,
    instrumentType: null,
    mcapOverride: null,
    easyRows: [],
    advancedRows: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

const DRAFT = '__draft__'

describe('pickComparePanelBScenario', () => {
  it('returns null when there is no other saved scenario', () => {
    const only = sc({ id: 'only', symbol: 'AAPL', name: 'Base' })
    expect(pickComparePanelBScenario([], DRAFT)).toBeNull()
    expect(pickComparePanelBScenario([only], 'only')).toBeNull()
  })

  it('can fill Panel B from the sole save when Panel A is still draft', () => {
    const only = sc({ id: 'only', symbol: 'AAPL', name: 'Base' })
    expect(pickComparePanelBScenario([only], DRAFT)).toBe('only')
  })

  it('picks a scenario that differs from Panel A', () => {
    const scenarios = [
      sc({ id: 'a', symbol: 'MSFT', name: 'Base', updatedAt: '2026-01-10T00:00:00.000Z' }),
      sc({ id: 'b', symbol: 'MSFT', name: 'Bull', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ]
    expect(pickComparePanelBScenario(scenarios, 'a')).toBe('b')
    expect(pickComparePanelBScenario(scenarios, 'b')).toBe('a')
  })

  it('prefers the most recently updated other scenario', () => {
    const scenarios = [
      sc({ id: 'old', symbol: 'NVDA', name: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      sc({ id: 'mid', symbol: 'NVDA', name: 'Mid', updatedAt: '2026-06-01T00:00:00.000Z' }),
      sc({ id: 'new', symbol: 'NVDA', name: 'New', updatedAt: '2026-11-01T00:00:00.000Z' }),
    ]
    expect(pickComparePanelBScenario(scenarios, DRAFT)).toBe('new')
    expect(pickComparePanelBScenario(scenarios, 'new')).toBe('mid')
  })

  it('falls back to ticker/name order when updatedAt ties', () => {
    const scenarios = [
      sc({ id: 'z', symbol: 'TSLA', name: 'Zebra', updatedAt: '2026-05-01T00:00:00.000Z' }),
      sc({ id: 'a', symbol: 'AAPL', name: 'Alpha', updatedAt: '2026-05-01T00:00:00.000Z' }),
    ]
    expect(pickComparePanelBScenario(scenarios, DRAFT)).toBe('a')
  })
})
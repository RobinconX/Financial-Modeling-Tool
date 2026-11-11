import { beforeEach, describe, expect, it } from 'vitest'
import { loadOverview, OVERVIEW_STORAGE_KEY } from '../../src/lib/overviewStorage'

describe('loadOverview v1 migration', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v))
        },
        removeItem: (k: string) => {
          store.delete(k)
        },
        clear: () => {
          store.clear()
        },
      },
    })
  })

  it('ensures a permanent Leftover cash series when upgrading flat v1 saves', () => {
    store.set(
      OVERVIEW_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        startYear: 2024,
        endYear: 2030,
        series: [
          {
            id: 'cash',
            type: 'manual',
            name: 'Other',
            enabled: true,
            sortOrder: 0,
            baseChf: 25_000,
            baseYear: 2024,
            annualRatePercent: 0,
            yearBindings: [],
            perpetualYearlyChf: 0,
          },
        ],
      }),
    )

    const state = loadOverview()
    expect(state.version).toBe(2)
    const scenario = state.scenarios[0]!
    const leftovers = scenario.series.filter((s) => s.type === 'incomeLeftover')
    expect(leftovers).toHaveLength(1)
    expect(leftovers[0]!.enabled).toBe(true)
    expect(leftovers[0]!.name).toBe('Leftover cash')
  })

  it('preserves existing v1 Leftover cash balances and bindings', () => {
    store.set(
      OVERVIEW_STORAGE_KEY,
      JSON.stringify({
        startYear: 2024,
        endYear: 2030,
        series: [
          {
            id: 'left',
            type: 'incomeLeftover',
            name: 'Leftover cash',
            enabled: true,
            sortOrder: 1,
            baseChf: 42_000,
            baseYear: 2024,
            annualRatePercent: 3,
            yearBindings: [{ year: 2024, incomeCostScenarioId: 'ic-1' }],
            perpetualYearlyChf: 5_000,
          },
        ],
      }),
    )

    const state = loadOverview()
    const leftover = state.scenarios[0]!.series.find((s) => s.type === 'incomeLeftover')
    expect(leftover).toBeDefined()
    expect(leftover!.baseChf).toBe(42_000)
    expect(leftover!.annualRatePercent).toBe(3)
    expect(leftover!.yearBindings).toEqual([{ year: 2024, incomeCostScenarioId: 'ic-1' }])
    expect(leftover!.perpetualYearlyChf).toBe(5_000)
  })
})

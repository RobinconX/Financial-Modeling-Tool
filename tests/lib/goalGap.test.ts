import { describe, expect, it } from 'vitest'
import {
  buildGoalGapTable,
  defaultGoalYear,
  easyGoalPrice,
  mergeUpsideSeries,
  remainingUpside,
  resolveGoalYear,
  sortGoalGapRows,
  statedEasyYears,
  unionEasyYears,
  upsideSeries,
} from '../../src/lib/goalGap'
import { yearsUntilProjectionEnd, cagr } from '../../src/lib/valuation'
import type { SavedScenario } from '../../src/types'

function sc(
  partial: Partial<SavedScenario> & Pick<SavedScenario, 'id' | 'symbol' | 'name'>,
): SavedScenario {
  return {
    companyName: null,
    currency: 'USD',
    currentPrice: 120,
    currentMarketCap: 240_000_000_000,
    sharesOutstanding: 2_000_000_000,
    mcapOverride: null,
    easyRows: [],
    advancedRows: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

const acme = sc({
  id: 'scen-acme',
  symbol: 'ACME',
  name: 'Base',
  easyRows: [
    { id: 'easy-2028', year: 2028, projectedMarketCap: 360_000_000_000 },
    { id: 'easy-2030', year: 2030, projectedMarketCap: 480_000_000_000 },
  ],
})

describe('easy goal price', () => {
  it('is Easy mcap ÷ shares (ACME 2030 = $240)', () => {
    expect(easyGoalPrice(acme, 2030)).toBe(240)
    expect(easyGoalPrice(acme, 2028)).toBe(180)
    expect(easyGoalPrice(acme, 2029)).toBeNull()
  })

  it('remaining upside is goal / spot − 1', () => {
    expect(remainingUpside(240, 120)).toBe(1)
    expect(remainingUpside(180, 120)).toBe(0.5)
  })
})

describe('default / resolve goal year', () => {
  it('prefers 2030 then max stated year', () => {
    expect(defaultGoalYear([2028, 2030, 2032])).toBe(2030)
    expect(defaultGoalYear([2028, 2029])).toBe(2029)
    expect(defaultGoalYear([])).toBeNull()
  })

  it('keeps a stored year only if it is still available', () => {
    expect(resolveGoalYear(2028, [2028, 2030])).toBe(2028)
    expect(resolveGoalYear(2029, [2028, 2030])).toBe(2030)
    expect(resolveGoalYear(null, [2028])).toBe(2028)
  })
})

describe('buildGoalGapTable', () => {
  it('fills ACME 2030 spot, goal, upside, CAGR', () => {
    const rows = buildGoalGapTable(
      [{ scenarioId: 'scen-acme', basis: 'easy' }],
      [acme],
      2030,
      new Date(2026, 0, 1),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.spot).toBe(120)
    expect(rows[0]!.goalYear).toBe(2030)
    expect(rows[0]!.goalPrice).toBe(240)
    expect(rows[0]!.upside).toBe(1)
    const span = yearsUntilProjectionEnd(2030, new Date(2026, 0, 1))
    expect(rows[0]!.cagr).toBeCloseTo(cagr(120, 240, span))
  })

  it('leaves goal empty when the scenario has no Easy at that year', () => {
    const rows = buildGoalGapTable(
      [{ scenarioId: 'scen-acme', basis: 'easy' }],
      [acme],
      2029,
      2026,
    )
    expect(rows[0]!.goalYear).toBeNull()
    expect(rows[0]!.goalPrice).toBeNull()
    expect(rows[0]!.upside).toBeNull()
    expect(rows[0]!.cagr).toBeNull()
    expect(rows[0]!.spot).toBe(120)
  })

  it('unions Easy years from the selection', () => {
    const bull = sc({
      id: 'bull',
      symbol: 'ACME',
      name: 'Bull',
      easyRows: [{ id: 'e', year: 2028, projectedMarketCap: 400_000_000_000 }],
    })
    expect(
      unionEasyYears(
        [
          { scenarioId: 'scen-acme', basis: 'easy' },
          { scenarioId: 'bull', basis: 'easy' },
        ],
        [acme, bull],
      ),
    ).toEqual([2028, 2030])
    expect(statedEasyYears(bull)).toEqual([2028])
  })

  it('sorts by upside, missing last', () => {
    const rows = [
      { ...buildGoalGapTable([{ scenarioId: 'scen-acme', basis: 'easy' }], [acme], 2030)[0]! },
      {
        scenarioId: 'z',
        symbol: 'ZZZ',
        scenarioName: 'None',
        label: 'ZZZ / None',
        currency: 'USD',
        spot: 10,
        goalYear: null,
        goalPrice: null,
        upside: null,
        cagr: null,
      },
    ]
    const sorted = sortGoalGapRows(rows, 'upside', 'desc')
    expect(sorted[0]!.scenarioId).toBe('scen-acme')
    expect(sorted[1]!.scenarioId).toBe('z')
  })
})

describe('upsideSeries', () => {
  it('is goal / close − 1 at each date', () => {
    const pts = upsideSeries(240, [
      { date: '2025-01-02', close: 120 },
      { date: '2025-06-01', close: 160 },
      { date: '2026-01-01', close: 0 },
    ])
    expect(pts).toEqual([
      { date: '2025-01-02', upside: 1 },
      { date: '2025-06-01', upside: 0.5 },
    ])
  })

  it('merges overlay series on a shared date axis', () => {
    const merged = mergeUpsideSeries([
      {
        key: 'a',
        name: 'A',
        points: [
          { date: '2022-01-03', upside: 1 },
          { date: '2022-06-01', upside: 0.5 },
        ],
      },
      {
        key: 'b',
        name: 'B',
        points: [{ date: '2022-06-01', upside: 0.2 }],
      },
    ])
    expect(merged).toEqual([
      { date: '2022-01-03', a: 1, b: null },
      { date: '2022-06-01', a: 0.5, b: 0.2 },
    ])
  })
})

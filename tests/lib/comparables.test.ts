import { describe, expect, it } from 'vitest'
import {
  buildComparableTable,
  defaultBasisForScenario,
  normalizeFilterYears,
  priceNowForScenario,
  pruneComparableEntries,
  sortComparableRows,
  visibleComparableYears,
  yearsInPeriod,
  yearsUntilProjectionEnd,
} from '../../src/lib/comparables'
import type { SavedScenario } from '../../src/types'

function sc(partial: Partial<SavedScenario> & Pick<SavedScenario, 'id' | 'symbol' | 'name'>): SavedScenario {
  return {
    companyName: null,
    currency: 'USD',
    currentPrice: 10,
    currentMarketCap: 1000,
    sharesOutstanding: 100,
    mcapOverride: null,
    easyRows: [],
    advancedRows: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('buildComparableTable', () => {
  const a = sc({
    id: 'a',
    symbol: 'AAA',
    name: 'Base',
    easyRows: [
      { id: '1', year: 2028, projectedMarketCap: 2000 },
      { id: '2', year: 2030, projectedMarketCap: 4000 },
    ],
  })
  const b = sc({
    id: 'b',
    symbol: 'BBB',
    name: 'Bull',
    currentPrice: 20,
    currentMarketCap: 2000,
    sharesOutstanding: 100,
    easyRows: [{ id: '1', year: 2028, projectedMarketCap: 2500 }],
  })

  it('unions years and leaves missing cells empty', () => {
    const table = buildComparableTable(
      [
        { scenarioId: 'a', basis: 'easy' },
        { scenarioId: 'b', basis: 'easy' },
      ],
      [a, b],
      2026,
    )
    expect(table.years).toEqual([2028, 2030])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]!.byYear[2028]?.roi).toBeCloseTo(1)
    const span = yearsUntilProjectionEnd(2028, new Date(2026, 0, 1))
    expect(table.rows[0]!.byYear[2028]?.cagr).toBeCloseTo(Math.pow(2, 1 / span) - 1)
    expect(table.rows[0]!.byYear[2028]?.price).toBeCloseTo(20)
    expect(table.rows[1]!.byYear[2030]).toBeUndefined()
    expect(table.rows[1]!.priceNow).toBeCloseTo(20)
    expect(table.rows[0]!.shares).toBe(100)
  })

  it('drops missing scenario ids', () => {
    const table = buildComparableTable(
      [
        { scenarioId: 'gone', basis: 'easy' },
        { scenarioId: 'a', basis: 'easy' },
      ],
      [a],
      2026,
    )
    expect(table.rows.map((r) => r.scenarioId)).toEqual(['a'])
  })

  it('defaults to easy when that basis has years', () => {
    expect(defaultBasisForScenario(a, 2026)).toBe('easy')
  })
})

describe('sortComparableRows', () => {
  const table = buildComparableTable(
    [
      { scenarioId: 'low', basis: 'easy' },
      { scenarioId: 'high', basis: 'easy' },
    ],
    [
      sc({
        id: 'low',
        symbol: 'LOW',
        name: 'A',
        easyRows: [{ id: '1', year: 2028, projectedMarketCap: 1100 }],
      }),
      sc({
        id: 'high',
        symbol: 'HI',
        name: 'B',
        easyRows: [{ id: '1', year: 2028, projectedMarketCap: 3000 }],
      }),
    ],
    2026,
  )

  it('sorts by year ROI descending by default', () => {
    const sorted = sortComparableRows(table.rows, 2028, 'desc')
    expect(sorted.map((r) => r.symbol)).toEqual(['HI', 'LOW'])
  })

  it('reverses on asc', () => {
    const sorted = sortComparableRows(table.rows, 2028, 'asc')
    expect(sorted.map((r) => r.symbol)).toEqual(['LOW', 'HI'])
  })
})

describe('priceNowForScenario', () => {
  it('prefers live currentPrice over implied from a stale mcap', () => {
    const s = sc({
      id: 'p',
      symbol: 'X',
      name: 'Base',
      currentPrice: 12,
      currentMarketCap: 1000,
      sharesOutstanding: 100,
    })
    expect(priceNowForScenario(s)).toBe(12)
  })
})

describe('yearsUntilProjectionEnd', () => {
  it('is the span from the as-of date to 31 Dec of the projection year', () => {
    expect(yearsUntilProjectionEnd(2028, new Date(2026, 11, 31))).toBeCloseTo(2, 2)
    const fromAug = yearsUntilProjectionEnd(2028, new Date(2026, 7, 13))
    expect(fromAug).toBeGreaterThan(2)
    expect(fromAug).toBeLessThan(3)
  })
})

describe('year filters', () => {
  const all = [2027, 2028, 2030, 2035]

  it('keeps years in a period', () => {
    expect(yearsInPeriod(all, 2028, 2030)).toEqual([2028, 2030])
  })

  it('intersects a stored set with available years', () => {
    expect(visibleComparableYears(all, [2028, 2031, 2035])).toEqual([2028, 2035])
  })

  it('shows no years until the user adds some', () => {
    expect(visibleComparableYears(all, [])).toEqual([])
    expect(visibleComparableYears(all, null)).toEqual([])
    expect(visibleComparableYears(all, [1999])).toEqual([])
  })

  it('keeps an explicit set including all or none', () => {
    expect(normalizeFilterYears(all, all)).toEqual(all)
    expect(normalizeFilterYears([], all)).toEqual([])
    expect(normalizeFilterYears([2028, 2030], all)).toEqual([2028, 2030])
  })
})

describe('pruneComparableEntries', () => {
  it('drops unknown ids and duplicates', () => {
    const a = sc({ id: 'a', symbol: 'A', name: 'x' })
    expect(
      pruneComparableEntries(
        [
          { scenarioId: 'a', basis: 'easy' },
          { scenarioId: 'a', basis: 'ps' },
          { scenarioId: 'z', basis: 'easy' },
        ],
        [a],
      ),
    ).toEqual([{ scenarioId: 'a', basis: 'easy' }])
  })
})
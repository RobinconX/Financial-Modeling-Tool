import { describe, expect, it } from 'vitest'
import type { ProjectionRow } from '../../src/types'
import {
  pruneProjectionFilterYears,
  sortProjectionRows,
  uniqueProjectionYears,
  visibleProjectionYears,
} from '../../src/lib/projectionRows'

function row(
  year: number,
  basis: ProjectionRow['basis'],
  cagr: number,
): ProjectionRow {
  return {
    year,
    basis,
    marketCap: 1,
    equityValue: 1,
    dilutionFactor: 1,
    totalReturn: 0,
    cagr,
    years: 1,
  }
}

describe('projection table years', () => {
  it('lists unique years sorted', () => {
    expect(
      uniqueProjectionYears([row(2030, 'ps', 0.1), row(2028, 'easy', 0.2), row(2030, 'pe', 0.3)]),
    ).toEqual([2028, 2030])
  })

  it('null filter shows all years; empty shows none', () => {
    expect(visibleProjectionYears([2028, 2030], null)).toEqual([2028, 2030])
    expect(visibleProjectionYears([2028, 2030], [])).toEqual([])
    expect(visibleProjectionYears([2028, 2030], [2030, 1999])).toEqual([2030])
  })

  it('falls back to all when selected years no longer exist', () => {
    expect(visibleProjectionYears([2028], [2030])).toEqual([2028])
    expect(pruneProjectionFilterYears([2030], [2028])).toBeNull()
    expect(pruneProjectionFilterYears([], [2028])).toEqual([])
    expect(pruneProjectionFilterYears(null, [2028])).toBeNull()
  })
})

describe('sortProjectionRows', () => {
  const rows = [
    row(2030, 'ps', 0.1),
    row(2028, 'pe', 0.4),
    row(2028, 'easy', 0.2),
    row(2030, 'easy', Number.NaN),
  ]

  it('sorts by year then basis', () => {
    const out = sortProjectionRows(rows, 'year', 'asc')
    expect(out.map((r) => `${r.year}-${r.basis}`)).toEqual([
      '2028-easy',
      '2028-pe',
      '2030-easy',
      '2030-ps',
    ])
  })

  it('sorts by basis then year', () => {
    const out = sortProjectionRows(rows, 'basis', 'asc')
    expect(out.map((r) => `${r.year}-${r.basis}`)).toEqual([
      '2028-easy',
      '2030-easy',
      '2030-ps',
      '2028-pe',
    ])
  })

  it('sorts by ROI desc and keeps missing last', () => {
    const out = sortProjectionRows(rows, 'roi', 'desc')
    expect(out.map((r) => r.cagr)).toEqual([0.4, 0.2, 0.1, Number.NaN])
  })
})

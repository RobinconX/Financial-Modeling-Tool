import { describe, expect, it } from 'vitest'
import {
  buildAdvancedProjections,
  buildEasyProjections,
  cagr,
  equityValueAfterDilution,
  impliedFromPE,
  impliedFromPFCF,
  impliedFromPS,
  normalizeDilution,
  pickHeroRow,
  totalReturn,
  yearsUntil,
} from '../../src/lib/valuation'
import type { EasyProjection, YearProjection } from '../../src/types'

describe('yearsUntil / cagr / totalReturn', () => {
  it('computes year delta', () => {
    expect(yearsUntil(2030, 2026)).toBe(4)
  })

  it('computes CAGR for doubling in 4 years', () => {
    const r = cagr(100, 200, 4)
    expect(r).toBeCloseTo(Math.pow(2, 0.25) - 1, 10)
  })

  it('returns NaN for invalid CAGR inputs', () => {
    expect(cagr(0, 100, 5)).toBeNaN()
    expect(cagr(100, 200, 0)).toBeNaN()
    expect(cagr(100, -1, 5)).toBeNaN()
  })

  it('computes total return', () => {
    expect(totalReturn(100, 150)).toBeCloseTo(0.5)
    expect(totalReturn(0, 150)).toBeNaN()
  })
})

describe('dilution helpers', () => {
  it('normalizes dilution defaults', () => {
    expect(normalizeDilution(null)).toBe(1)
    expect(normalizeDilution(0)).toBe(1)
    expect(normalizeDilution(1.1)).toBe(1.1)
  })

  it('reduces equity claim after dilution', () => {
    expect(equityValueAfterDilution(110, 1.1)).toBeCloseTo(100)
  })
})

describe('implied multiples', () => {
  it('computes PS / PFCF / PE mcap', () => {
    expect(impliedFromPS(10, 5)).toBe(50)
    expect(impliedFromPFCF(2, 20)).toBe(40)
    expect(impliedFromPE(3, 15)).toBe(45)
  })
})

describe('buildEasyProjections', () => {
  const year = 2026
  const rows: EasyProjection[] = [
    { id: 'a', year: year + 4, projectedMarketCap: 200 },
    { id: 'b', year: year - 1, projectedMarketCap: 999 },
    { id: 'c', year: year + 2, projectedMarketCap: null },
  ]

  it('builds rows for future years with mcap', () => {
    const out = buildEasyProjections(100, rows, year)
    expect(out).toHaveLength(1)
    expect(out[0].year).toBe(year + 4)
    expect(out[0].basis).toBe('easy')
    expect(out[0].cagr).toBeCloseTo(cagr(100, 200, 4))
    expect(out[0].totalReturn).toBeCloseTo(1)
  })

  it('returns empty when current mcap invalid', () => {
    expect(buildEasyProjections(0, rows, year)).toEqual([])
  })
})

describe('buildAdvancedProjections', () => {
  const year = 2026
  const rows: YearProjection[] = [
    {
      id: 'y',
      year: year + 5,
      dilutionFactor: 1,
      revenue: 10,
      psMultiple: 5,
      fcf: 2,
      pfcfMultiple: 10,
      profit: 1,
      peMultiple: 20,
    },
  ]

  it('emits PS/PFCF/PE bases', () => {
    const out = buildAdvancedProjections(50, rows, year)
    expect(out.map((r) => r.basis).sort()).toEqual(['pe', 'pfcf', 'ps'])
    const ps = out.find((r) => r.basis === 'ps')!
    expect(ps.marketCap).toBe(50)
    expect(ps.equityValue).toBe(50)
  })

  it('applies dilution to equity value', () => {
    const diluted: YearProjection[] = [{ ...rows[0], dilutionFactor: 2 }]
    const out = buildAdvancedProjections(50, diluted, year)
    const pe = out.find((r) => r.basis === 'pe')!
    expect(pe.marketCap).toBe(20)
    expect(pe.equityValue).toBe(10)
  })
})

describe('pickHeroRow', () => {
  it('picks latest year for basis', () => {
    const rows = buildEasyProjections(
      100,
      [
        { id: '1', year: 2030, projectedMarketCap: 200 },
        { id: '2', year: 2035, projectedMarketCap: 400 },
      ],
      2026,
    )
    const hero = pickHeroRow(rows, 'easy')
    expect(hero?.year).toBe(2035)
  })

  it('returns null when basis missing', () => {
    expect(pickHeroRow([], 'ps')).toBeNull()
  })
})

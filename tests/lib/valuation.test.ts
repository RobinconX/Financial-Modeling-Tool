import { describe, expect, it } from 'vitest'
import {
  advancedCagrGapYears,
  buildAdvancedProjections,
  buildChartSeries,
  buildEasyProjections,
  cagr,
  cagrInterpolate,
  easyCagrGapYears,
  equityValueAfterDilution,
  impliedFromPE,
  impliedFromPFCF,
  impliedFromPS,
  interpolateByCagr,
  materializeAdvancedCagrYears,
  materializeEasyCagrYears,
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

describe('interpolateByCagr / cagrInterpolate', () => {
  it('hits endpoints and midpoint of a double-in-4-years path', () => {
    // 100 → 200 over 4 years; midpoint (2y) = 100 * sqrt(2)
    expect(interpolateByCagr(2026, 100, 2030, 200, 2026)).toBeCloseTo(100)
    expect(interpolateByCagr(2026, 100, 2030, 200, 2030)).toBeCloseTo(200)
    expect(interpolateByCagr(2026, 100, 2030, 200, 2028)).toBeCloseTo(100 * Math.SQRT2, 10)
  })

  it('matches compound growth at each step', () => {
    const r = cagr(100, 200, 4)
    for (let y = 0; y <= 4; y++) {
      const v = interpolateByCagr(0, 100, 4, 200, y)!
      expect(v).toBeCloseTo(100 * Math.pow(1 + r, y), 10)
    }
  })

  it('returns null for non-positive values', () => {
    expect(interpolateByCagr(2026, 0, 2030, 200, 2028)).toBeNull()
    expect(interpolateByCagr(2026, 100, 2030, -1, 2028)).toBeNull()
  })

  it('cagrInterpolate fills gaps between known points', () => {
    const known = [
      { year: 2026, value: 100 },
      { year: 2030, value: 200 },
      { year: 2034, value: 400 },
    ]
    expect(cagrInterpolate(known, 2028)).toBeCloseTo(100 * Math.SQRT2, 10)
    expect(cagrInterpolate(known, 2032)).toBeCloseTo(200 * Math.SQRT2, 10)
    expect(cagrInterpolate(known, 2026)).toBe(100)
    expect(cagrInterpolate(known, 2035)).toBe(400) // clamp past end
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

  it('builds rows only for stated future years with mcap', () => {
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

describe('materializeEasyCagrYears', () => {
  it('lists and creates intermediate years between mcap anchors', () => {
    const rows: EasyProjection[] = [
      { id: 'a', year: 2030, projectedMarketCap: 200 },
      { id: 'b', year: 2034, projectedMarketCap: 400 },
    ]
    expect(easyCagrGapYears(rows)).toEqual([2031, 2032, 2033])
    const filled = materializeEasyCagrYears(rows)
    expect(filled.map((r) => r.year)).toEqual([2030, 2031, 2032, 2033, 2034])
    const mid = filled.find((r) => r.year === 2032)!
    expect(mid.projectedMarketCap).toBeCloseTo(200 * Math.SQRT2, 10)
  })

  it('does not overwrite existing positive mcap years', () => {
    const rows: EasyProjection[] = [
      { id: 'a', year: 2030, projectedMarketCap: 200 },
      { id: 'x', year: 2032, projectedMarketCap: 999 },
      { id: 'b', year: 2034, projectedMarketCap: 400 },
    ]
    expect(easyCagrGapYears(rows)).toEqual([2031, 2033])
    const filled = materializeEasyCagrYears(rows)
    expect(filled.find((r) => r.year === 2032)!.projectedMarketCap).toBe(999)
  })
})

describe('materializeAdvancedCagrYears', () => {
  it('creates intermediate years with CAGR fundamentals', () => {
    const rows: YearProjection[] = [
      {
        id: 'a',
        year: 2030,
        dilutionFactor: 1,
        revenue: 100,
        psMultiple: 10,
        fcf: null,
        pfcfMultiple: null,
        profit: null,
        peMultiple: null,
      },
      {
        id: 'b',
        year: 2032,
        dilutionFactor: 1.21,
        revenue: 121,
        psMultiple: 10,
        fcf: null,
        pfcfMultiple: null,
        profit: null,
        peMultiple: null,
      },
    ]
    expect(advancedCagrGapYears(rows)).toEqual([2031])
    const filled = materializeAdvancedCagrYears(rows)
    expect(filled.map((r) => r.year)).toEqual([2030, 2031, 2032])
    const mid = filled.find((r) => r.year === 2031)!
    expect(mid.revenue).toBeCloseTo(110, 10)
    expect(mid.psMultiple).toBeCloseTo(10, 10)
    expect(mid.dilutionFactor).toBeCloseTo(1.1, 10)
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

  it('emits PS/PFCF/PE bases for stated years only', () => {
    const out = buildAdvancedProjections(50, rows, year)
    expect(out.map((r) => r.basis).sort()).toEqual(['pe', 'pfcf', 'ps'])
    const ps = out.find((r) => r.basis === 'ps')!
    expect(ps.marketCap).toBe(50)
    expect(ps.equityValue).toBe(50)
    expect(out.filter((r) => r.basis === 'ps')).toHaveLength(1)
  })

  it('applies dilution to equity value', () => {
    const diluted: YearProjection[] = [{ ...rows[0], dilutionFactor: 2 }]
    const out = buildAdvancedProjections(50, diluted, year)
    const pe = out.find((r) => r.basis === 'pe')!
    expect(pe.marketCap).toBe(20)
    expect(pe.equityValue).toBe(10)
  })
})

describe('buildChartSeries CAGR path', () => {
  it('uses CAGR (not linear) between easy anchors for chart display only', () => {
    const series = buildChartSeries(
      100,
      'easy',
      [{ id: 'a', year: 2030, projectedMarketCap: 200 }],
      [],
      2026,
    )
    const mid = series.find((p) => p.year === 2028)!
    expect(mid.easy).toBeCloseTo(100 * Math.SQRT2, 10)
    expect(mid.easy).not.toBeCloseTo(150, 1)
    expect(mid.easyActual).toBeUndefined()
    const end = series.find((p) => p.year === 2030)!
    expect(end.easyActual).toBe(true)
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

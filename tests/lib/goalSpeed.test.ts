import { describe, expect, it } from 'vitest'
import {
  buildGoalSpeedTable,
  formatGoalSpeedAmount,
  formatGoalSpeedDuration,
  formatGoalSpeedDurationExact,
  formatGoalSpeedExtras,
  goalSpeedBreakdown,
  mergeGoalSpeedSeries,
  relativeDollarEffectiveness,
  solveGoalSpeedPath,
  splitMonths,
} from '../../src/lib/goalSpeed'

const TODAY = new Date(2026, 8, 12) // 12 Sep 2026 local

function solve(partial: {
  start?: number
  goal?: number
  ratePercent?: number
  extras?: { year: number; amount: number }[]
  maxYears?: number
  anchorYear?: number
}) {
  return solveGoalSpeedPath({
    start: partial.start ?? 100_000,
    goal: partial.goal ?? 200_000,
    ratePercent: partial.ratePercent ?? 7,
    extras: partial.extras ?? [],
    today: TODAY,
    maxYears: partial.maxYears,
    anchorYear: partial.anchorYear,
  })
}

describe('solveGoalSpeedPath', () => {
  it('does not grow in Y0; first (1+r) is the next calendar year', () => {
    const r = solve({ extras: [{ year: 2026, amount: 10_000 }] })
    const eoy = r.series.find((p) => p.date === '2026-12-31' && !p.isHit)
    const after = [...r.series].reverse().find((p) => p.date === '2026-12-31')
    expect(after?.wealth).toBe(110_000)
    expect(eoy?.wealth === 100_000 || after?.wealth === 110_000).toBe(true)
    const jan = r.series.find((p) => p.date === '2027-01-01')
    expect(jan?.wealth).toBe(110_000)
    const eoy2027 = [...r.series].reverse().find((p) => p.date === '2027-12-31')
    expect(eoy2027?.wealth).toBeCloseTo(110_000 * 1.07, 6)
  })

  it('extra at Y0 only grows from Y0+1', () => {
    const withExtra = solve({
      start: 100,
      goal: 1_000,
      ratePercent: 100,
      extras: [{ year: 2026, amount: 5 }],
    })
    const eoy = [...withExtra.series].reverse().find((p) => p.date === '2026-12-31')
    expect(eoy?.wealth).toBe(105)
    const jan = withExtra.series.find((p) => p.date === '2027-01-01')
    expect(jan?.wealth).toBe(105)
  })

  it('year-end extra that jumps the goal hits 31 Dec', () => {
    const r = solve({
      start: 100,
      goal: 110,
      ratePercent: 7,
      extras: [{ year: 2026, amount: 20 }],
    })
    expect(r.hit.reached).toBe(true)
    if (!r.hit.reached) return
    expect(r.hit.date).toBe('2026-12-31')
    expect(r.hit.already).toBe(false)
  })

  it('already-above-goal is 0y 0m today', () => {
    const r = solve({ start: 200_000, goal: 100_000 })
    expect(r.hit.reached).toBe(true)
    if (!r.hit.reached) return
    expect(r.hit.already).toBe(true)
    expect(r.hit.date).toBe('2026-09-12')
    expect(r.hit.duration.totalMonths).toBe(0)
    expect(formatGoalSpeedDuration(r.hit.duration)).toBe('0m')
  })

  it('intra-year hit matches the log formula after the Y0 stub', () => {
    const r = solve({ start: 100_000, goal: 200_000, ratePercent: 7, extras: [] })
    expect(r.hit.reached).toBe(true)
    if (!r.hit.reached) return
    const tGrowth = Math.log(2) / Math.log(1.07)
    const stub =
      (Date.UTC(2027, 0, 1) - Date.UTC(2026, 8, 12)) / (365.25 * 86_400_000)
    expect(r.hit.date.startsWith('2037-03')).toBe(true)
    expect(r.hit.yearsFromToday).toBeCloseTo(stub + tGrowth, 10)
    expect(r.hit.duration.totalMonths).toBe(Math.round((stub + tGrowth) * 12))
  })

  it('projected year-end start has no today-stub; first growth is the next year', () => {
    const r = solve({
      start: 100_000,
      goal: 200_000,
      ratePercent: 7,
      extras: [],
      anchorYear: 2028,
    })
    expect(r.hit.reached).toBe(true)
    if (!r.hit.reached) return
    const tGrowth = Math.log(2) / Math.log(1.07)
    expect(r.hit.yearsFromToday).toBeCloseTo(tGrowth, 10)
    expect(r.series[0]?.date).toBe('2028-12-31')
  })

  it('adds extras at the anchor year-end with no growth that year', () => {
    const r = solve({
      start: 100_000,
      goal: 1_000_000,
      ratePercent: 7,
      extras: [
        { year: 2027, amount: 50_000 },
        { year: 2028, amount: 10_000 },
      ],
      anchorYear: 2028,
    })
    const eoy2028 = [...r.series].reverse().find((p) => p.date === '2028-12-31')
    expect(eoy2028?.wealth).toBe(110_000)
    const jan2029 = r.series.find((p) => p.date === '2029-01-01')
    expect(jan2029?.wealth).toBe(110_000)
  })

  it('never reaches within the cap', () => {
    const r = solve({
      start: 1,
      goal: 1e12,
      ratePercent: 1,
      maxYears: 5,
    })
    expect(r.hit.reached).toBe(false)
    expect(r.series.length).toBeGreaterThan(1)
  })

  it('r = 0 only jumps via extras', () => {
    const miss = solve({ start: 100, goal: 150, ratePercent: 0, extras: [] })
    expect(miss.hit.reached).toBe(false)
    const hit = solve({
      start: 100,
      goal: 150,
      ratePercent: 0,
      extras: [{ year: 2028, amount: 50 }],
    })
    expect(hit.hit.reached).toBe(true)
    if (!hit.hit.reached) return
    expect(hit.hit.date).toBe('2028-12-31')
  })

  it('ignores extras before this year', () => {
    const r = solve({
      start: 100,
      goal: 150,
      ratePercent: 0,
      extras: [{ year: 2025, amount: 999 }],
    })
    expect(r.hit.reached).toBe(false)
  })
})

describe('buildGoalSpeedTable', () => {
  it('later extras are cumulative; acceleration is vs the previous row', () => {
    const rows = buildGoalSpeedTable({
      start: 100_000,
      goal: 200_000,
      ratePercent: 7,
      extras: [
        { year: 2026, amount: 10_000 },
        { year: 2027, amount: 10_000 },
      ],
      today: TODAY,
    })
    expect(rows).toHaveLength(3)
    expect(rows[0]!.label).toBe('Base')
    expect(rows[1]!.label).toBe('+2026')
    expect(rows[2]!.label).toBe('+2027')
    expect(rows[1]!.extrasIncluded).toEqual([{ year: 2026, amount: 10_000 }])
    expect(rows[2]!.extrasIncluded).toEqual([
      { year: 2026, amount: 10_000 },
      { year: 2027, amount: 10_000 },
    ])

    expect(rows[0]!.hit.reached).toBe(true)
    expect(rows[1]!.hit.reached).toBe(true)
    expect(rows[2]!.hit.reached).toBe(true)
    if (!rows[0]!.hit.reached || !rows[1]!.hit.reached || !rows[2]!.hit.reached) return

    expect(rows[1]!.hit.duration.totalMonths).toBeLessThan(rows[0]!.hit.duration.totalMonths)
    expect(rows[2]!.hit.duration.totalMonths).toBeLessThan(rows[1]!.hit.duration.totalMonths)

    expect(rows[0]!.fasterThanPrevious).toBeNull()
    expect(rows[1]!.fasterThanPrevious?.totalMonths).toBe(
      Math.round(
        (rows[0]!.hit.yearsFromToday - rows[1]!.hit.yearsFromToday) * 12,
      ),
    )
    expect(rows[2]!.fasterThanPrevious?.totalMonths).toBe(
      Math.round(
        (rows[1]!.hit.yearsFromToday - rows[2]!.hit.yearsFromToday) * 12,
      ),
    )
    expect(rows[2]!.fasterThanPrevious?.totalMonths).not.toBe(
      Math.round(
        (rows[0]!.hit.yearsFromToday - rows[2]!.hit.yearsFromToday) * 12,
      ),
    )

    expect(rows[0]!.relativeEffectiveness).toBeNull()
    expect(rows[2]!.relativeEffectiveness).toBe(1)
    expect(rows[1]!.relativeEffectiveness).toBeGreaterThan(1)
  })

  it('relative effectiveness is time saved per unit vs the last year', () => {
    const extras = Array.from({ length: 10 }, (_, i) => ({
      year: 2026 + i,
      amount: 10_000,
    }))
    const rows = buildGoalSpeedTable({
      start: 100_000,
      goal: 400_000,
      ratePercent: 7,
      extras,
      today: TODAY,
    })
    const first = rows[1]!
    const last = rows[10]!
    expect(last.relativeEffectiveness).toBe(1)
    expect(first.relativeEffectiveness).toBeCloseTo(
      first.fasterThanPreviousExact! / last.fasterThanPreviousExact!,
      10,
    )
  })

  it('relative effectiveness is exact time saved per unit vs the last year', () => {
    const rows = buildGoalSpeedTable({
      start: 100_000,
      goal: 250_000,
      ratePercent: 7,
      extras: [
        { year: 2026, amount: 1_000 },
        { year: 2027, amount: 50_000 },
      ],
      today: TODAY,
    })
    const early = rows[1]!
    const late = rows[2]!
    expect(late.relativeEffectiveness).toBe(1)
    expect(early.fasterThanPreviousExact).toBeTruthy()
    expect(late.fasterThanPreviousExact).toBeTruthy()
    expect(early.relativeEffectiveness).toBeCloseTo(
      early.fasterThanPreviousExact! /
        1_000 /
        (late.fasterThanPreviousExact! / 50_000),
      10,
    )
  })

  it('merged chart series includes base, extras, and the goal line', () => {
    const rows = buildGoalSpeedTable({
      start: 100_000,
      goal: 200_000,
      ratePercent: 7,
      extras: [{ year: 2026, amount: 10_000 }],
      today: TODAY,
    })
    const merged = mergeGoalSpeedSeries(rows, 200_000)
    expect(merged.length).toBeGreaterThan(2)
    expect(merged[0]?.t).toBe(0)
    expect(merged[0]?.base).toBe(100_000)
    expect(merged[0]?.['plus-2026']).toBe(100_000)
    expect(merged.every((p) => p.goal === 200_000)).toBe(true)
    const hitExtra = rows[1]
    expect(hitExtra?.hit.reached).toBe(true)
    if (!hitExtra || !hitExtra.hit.reached) return
    const hitT = hitExtra.hit.t
    const atHit = merged.find((p) => p.t === hitT)
    expect(atHit?.['plus-2026']).toBeCloseTo(200_000, 0)
  })
})

describe('goalSpeedBreakdown', () => {
  const input = (partial: {
    start?: number
    goal?: number
    ratePercent?: number
    extras?: { year: number; amount: number }[]
    maxYears?: number
  }) => ({
    start: partial.start ?? 100_000,
    goal: partial.goal ?? 200_000,
    ratePercent: partial.ratePercent ?? 7,
    extras: partial.extras ?? [],
    today: TODAY,
    maxYears: partial.maxYears,
  })

  it('marks already-at-goal on Now', () => {
    const steps = goalSpeedBreakdown(input({ start: 250_000, goal: 200_000 }))
    expect(steps).toHaveLength(1)
    expect(steps[0]!.title).toBe('Now')
    expect(steps[0]!.hit).toBe(true)
  })

  it('shows no growth in Y0 then growth the next year', () => {
    const steps = goalSpeedBreakdown(
      input({ extras: [{ year: 2026, amount: 10_000 }] }),
    )
    const y0 = steps.find((s) => s.title === '2026')
    expect(y0?.grew).toBe(false)
    expect(y0?.contribution).toBe(10_000)
    expect(y0?.wealth).toBe(110_000)
    const y1 = steps.find((s) => s.title === '2027')
    expect(y1?.grew).toBe(true)
    expect(y1?.prior).toBe(110_000)
    expect(y1?.grown).toBeCloseTo(110_000 * 1.07, 6)
  })

  it('last step is the hit, matching the solver date', () => {
    const args = input({ extras: [] })
    const hit = solveGoalSpeedPath(args).hit
    const steps = goalSpeedBreakdown(args)
    const last = steps[steps.length - 1]!
    expect(last.hit).toBe(true)
    expect(last.wealth).toBe(200_000)
    if (!hit.reached) return
    expect(last.hitDate).toBe(hit.date)
  })
})

describe('relativeDollarEffectiveness', () => {
  it('is 1 for this year and grows by (1+r) for each later year', () => {
    expect(relativeDollarEffectiveness(2026, 2026, 7)).toBe(1)
    expect(relativeDollarEffectiveness(2027, 2026, 7)).toBeCloseTo(1.07, 10)
    expect(relativeDollarEffectiveness(2028, 2026, 7)).toBeCloseTo(1.07 ** 2, 10)
  })

  it('is 1 when the rate is 0, and null before this year', () => {
    expect(relativeDollarEffectiveness(2030, 2026, 0)).toBe(1)
    expect(relativeDollarEffectiveness(2025, 2026, 7)).toBeNull()
  })
})

describe('formatGoalSpeedDuration', () => {
  it('formats years and months', () => {
    expect(formatGoalSpeedDuration(splitMonths(0))).toBe('0m')
    expect(formatGoalSpeedDuration(splitMonths(8))).toBe('8m')
    expect(formatGoalSpeedDuration(splitMonths(24))).toBe('2y')
    expect(formatGoalSpeedDuration(splitMonths(26))).toBe('2y 2m')
  })
})

describe('fasterThanPrevious rounding', () => {
  it('rounds the exact gap, not the difference of already-rounded times', () => {
    expect(splitMonths(7.36).totalMonths).toBe(7)
    expect(splitMonths(7.5).totalMonths).toBe(8)
  })
})

describe('formatGoalSpeedDurationExact', () => {
  it('keeps at most 2 decimal places on months', () => {
    expect(formatGoalSpeedDurationExact(74 / 12)).toBe('6y 2m')
    expect(formatGoalSpeedDurationExact(74.22 / 12)).toBe('6y 2.22m')
    expect(formatGoalSpeedDurationExact(9.04 / 12)).toBe('9.04m')
    expect(formatGoalSpeedDurationExact(0)).toBe('0m')
  })
})

describe('formatGoalSpeedExtras', () => {
  it('is empty for no contributions', () => {
    expect(formatGoalSpeedExtras([])).toBe('—')
  })

  it('lists amounts only, joined with plus', () => {
    expect(
      formatGoalSpeedExtras([
        { year: 2026, amount: 30_000 },
        { year: 2027, amount: 30_000 },
        { year: 2028, amount: 15_000 },
      ]),
    ).toBe('30k + 30k + 15k')
  })

  it('formats compact amounts', () => {
    expect(formatGoalSpeedAmount(10_000)).toBe('10k')
    expect(formatGoalSpeedAmount(1_500)).toBe('1.5k')
    expect(formatGoalSpeedAmount(2_000_000)).toBe('2.00M')
  })
})

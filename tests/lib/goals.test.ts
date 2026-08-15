import { describe, expect, it } from 'vitest'
import {
  goalMarkXKey,
  goalYMax,
  normalizeNetWorthGoal,
  parseGoalAmount,
} from '../../src/lib/goals'

describe('normalizeNetWorthGoal', () => {
  it('keeps a valid CHF + year goal', () => {
    expect(normalizeNetWorthGoal({ year: 2035, amountChf: 2_000_000, name: ' FI ' })).toMatchObject({
      year: 2035,
      amountChf: 2_000_000,
      name: 'FI',
    })
    expect(normalizeNetWorthGoal({ year: 2035, amountChf: 0 })).toBeNull()
    expect(normalizeNetWorthGoal({ year: 99, amountChf: 100 })).toBeNull()
  })
})

describe('parseGoalAmount', () => {
  it('accepts compact suffixes', () => {
    expect(parseGoalAmount('2M')).toBe(2_000_000)
    expect(parseGoalAmount('500k')).toBe(500_000)
    expect(parseGoalAmount('0')).toBeNull()
  })
})

describe('chart adjust', () => {
  const goals = [
    { id: 'a', year: 2040, amountChf: 3_000_000, name: 'FI' },
    { id: 'b', year: 2030, amountChf: 1_000_000, name: '' },
  ]

  it('lifts Y max to the goal', () => {
    const fn = goalYMax(goals)
    expect(fn(500_000)).toBeCloseTo(3_000_000 * 1.04)
    expect(fn(4_000_000)).toBeCloseTo(4_000_000 * 1.04)
  })

  it('places the year mark on the matching tick', () => {
    expect(goalMarkXKey(2030, ['2029', '2030', '2031'])).toBe('2030')
    expect(goalMarkXKey(2024, ['2024-03', '2024-12'])).toBe('2024-12')
    expect(goalMarkXKey(2025, ['2024-12'])).toBeNull()
  })
})

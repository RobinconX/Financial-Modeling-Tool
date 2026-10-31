import { describe, expect, it } from 'vitest'
import { pickValueGuide } from '../../src/components/projections/GoalGapChart'

describe('pickValueGuide', () => {
  const yOf = (v: number) => 200 - v * 100

  it('uses the series closest to the pointer', () => {
    const guide = pickValueGuide(
      [
        { value: 0.2, color: '#34d399' },
        { value: 0.8, color: '#38bdf8' },
      ],
      yOf,
      130,
    )
    expect(guide).toEqual({ y: 120, color: '#38bdf8' })
  })

  it('skips empty values and falls back to stroke', () => {
    const guide = pickValueGuide(
      [
        { value: null },
        { value: 'nope' },
        { value: 0.5, stroke: '#fbbf24' },
      ],
      yOf,
      10,
    )
    expect(guide).toEqual({ y: 150, color: '#fbbf24' })
  })

  it('returns null when nothing maps onto the axis', () => {
    expect(pickValueGuide([{ value: 1 }], () => undefined, 0)).toBeNull()
    expect(pickValueGuide([], yOf, 0)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { fromDisplay, toDisplay } from '../../src/lib/fx'

describe('toDisplay / fromDisplay', () => {
  const rate = 0.9

  it('leaves USD unchanged', () => {
    expect(toDisplay(100, 'USD', rate)).toBe(100)
    expect(fromDisplay(100, 'USD', rate)).toBe(100)
  })

  it('converts USD → CHF when rate present', () => {
    expect(toDisplay(100, 'CHF', rate)).toBeCloseTo(90)
  })

  it('converts CHF → USD when rate present', () => {
    expect(fromDisplay(90, 'CHF', rate)).toBeCloseTo(100)
  })

  it('round-trips through CHF', () => {
    const usd = 12_345.67
    const chf = toDisplay(usd, 'CHF', rate)
    expect(fromDisplay(chf, 'CHF', rate)).toBeCloseTo(usd, 10)
  })

  it('does not convert CHF without a positive rate', () => {
    expect(toDisplay(100, 'CHF', null)).toBe(100)
    expect(toDisplay(100, 'CHF', 0)).toBe(100)
    expect(fromDisplay(100, 'CHF', null)).toBe(100)
  })

  it('passes through non-finite numbers', () => {
    expect(toDisplay(Number.NaN, 'CHF', rate)).toBeNaN()
  })
})

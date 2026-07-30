import { describe, expect, it } from 'vitest'
import {
  amountToDisplay,
  fixedAmountToUsd,
  fromDisplay,
  toDisplay,
} from '../../src/lib/fx'

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

describe('fixed cash denomination (no FX drift)', () => {
  it('amountToDisplay keeps CHF amount when display is CHF even if rate changes', () => {
    expect(amountToDisplay(10_000, 'CHF', 'CHF', 0.8)).toBe(10_000)
    expect(amountToDisplay(10_000, 'CHF', 'CHF', 0.95)).toBe(10_000)
  })

  it('amountToDisplay converts only when display currency differs', () => {
    expect(amountToDisplay(10_000, 'CHF', 'USD', 0.8)).toBeCloseTo(12_500)
    expect(amountToDisplay(1_000, 'USD', 'CHF', 0.9)).toBeCloseTo(900)
  })

  it('fixedAmountToUsd converts CHF using rate', () => {
    expect(fixedAmountToUsd(900, 'CHF', 0.9)).toBeCloseTo(1000)
    expect(fixedAmountToUsd(1000, 'USD', 0.9)).toBe(1000)
  })
})

import { describe, expect, it } from 'vitest'
import {
  emptyPortfolioContributions,
  contributionInYearDisplay,
  investedAt,
  investedAtDisplay,
  cashToInvestedPct,
  investedForRoiDisplay,
  setContributionYear,
  simpleRoi,
} from '../../src/lib/portfolioContributions'
import { newOpeningDeposit } from '../../src/lib/portfolio'

describe('portfolio contributions', () => {
  it('sums money-in through a year and ignores later years', () => {
    const state = {
      version: 1 as const,
      currency: 'CHF' as const,
      byYear: { '2024': 10_000, '2025': 5_000, '2027': 8_000 },
    }
    expect(investedAt(state, 2023)).toBe(0)
    expect(investedAt(state, 2024)).toBe(10_000)
    expect(investedAt(state, 2025)).toBe(15_000)
    expect(investedAt(state, 2026)).toBe(15_000)
    expect(investedAt(state, 2027)).toBe(23_000)
  })

  it('returns one year’s money-in in the display currency', () => {
    const state = {
      version: 1 as const,
      currency: 'USD' as const,
      byYear: { '2025': 2_000 },
    }
    expect(contributionInYearDisplay(state, 2025, 'USD', null)).toBe(2_000)
    expect(contributionInYearDisplay(state, 2024, 'USD', null)).toBe(0)
    expect(contributionInYearDisplay(null, 2025, 'USD', null)).toBe(0)
  })

  it('cash / invested is null when nothing is invested', () => {
    expect(cashToInvestedPct(1_000, 0)).toBeNull()
    expect(cashToInvestedPct(2_000, 10_000)).toBeCloseTo(0.2)
  })

  it('returns null ROI when nothing is invested', () => {
    expect(simpleRoi(50_000, 0)).toBeNull()
    expect(simpleRoi(50_000, NaN)).toBeNull()
  })

  it('computes simple gain / invested', () => {
    const r = simpleRoi(130_000, 100_000)!
    expect(r.gain).toBe(30_000)
    expect(r.roi).toBeCloseTo(0.3)
    expect(r.invested).toBe(100_000)
    expect(r.value).toBe(130_000)
  })

  it('setContributionYear adds, replaces, and clears', () => {
    let s = emptyPortfolioContributions('USD')
    s = setContributionYear(s, 2026, 1_000)
    s = setContributionYear(s, 2026, 2_000)
    expect(s.byYear['2026']).toBe(2_000)
    s = setContributionYear(s, 2026, null)
    expect(s.byYear['2026']).toBeUndefined()
  })

  it('converts invested to display currency', () => {
    const state = {
      version: 1 as const,
      currency: 'USD' as const,
      byYear: { '2026': 10_000 },
    }
    expect(investedAtDisplay(state, 2026, 'USD', 0.8)).toBe(10_000)
    expect(investedAtDisplay(state, 2026, 'CHF', 0.8)).toBeCloseTo(8_000)
    expect(investedAtDisplay(state, 2026, 'CHF', null)).toBeNull()
  })

  it('adds planned deposits after the current year, not years already in money-in', () => {
    const state = {
      version: 1 as const,
      currency: 'USD' as const,
      byYear: { '2026': 10_000 },
    }
    const p = {
      id: 'p1',
      name: 'T',
      currentCash: 0,
      deposits: [newOpeningDeposit(1_000, 2026), { id: 'd2', year: 2028, amount: 4_000 }],
      perpetualYearlyDeposit: { amount: 1_000, source: 'fixed' as const },
      holdings: [],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    // 2026 (current): money-in only
    expect(investedForRoiDisplay(state, 2026, 'USD', 1, p, 2026)).toBe(10_000)
    // 2027: 10k + perpetual 1k (after last explicit 2028? last explicit is 2028, so 2027 has no perpetual)
    expect(investedForRoiDisplay(state, 2027, 'USD', 1, p, 2026)).toBe(10_000)
    // 2028: 10k + planned 4k
    expect(investedForRoiDisplay(state, 2028, 'USD', 1, p, 2026)).toBe(14_000)
    // 2029: 10k + 4k + perpetual 1k
    expect(investedForRoiDisplay(state, 2029, 'USD', 1, p, 2026)).toBe(15_000)
  })

  it('adds current-year planned deposit minus already deposited', () => {
    const state = {
      version: 1 as const,
      currency: 'USD' as const,
      byYear: { '2025': 8_000 },
    }
    const p = {
      id: 'p1',
      name: 'T',
      currentCash: 0,
      deposits: [
        newOpeningDeposit(1_000, 2026),
        { id: 'd2', year: 2026, amount: 5_000, alreadyDeposited: 2_000 },
      ],
      holdings: [],
      actions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    // 3k still to land this year — year-end includes it
    expect(investedForRoiDisplay(state, 2026, 'USD', 1, p, 2026, false)).toBe(11_000)
    // Now: no 2026 money-in row → prior 8k + already deposited 2k
    expect(investedForRoiDisplay(state, 2026, 'USD', 1, p, 2026, true)).toBe(10_000)
  })
})

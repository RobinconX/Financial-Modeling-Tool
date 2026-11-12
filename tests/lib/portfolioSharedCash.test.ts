import { describe, expect, it } from 'vitest'
import {
  resolvePortfolioCash,
  resolvePortfoliosCash,
  sharedCashFromPortfolio,
} from '../../src/lib/portfolioSharedCash'
import { newDeposit, newOpeningDeposit, newPortfolio } from '../../src/lib/portfolio'

describe('portfolioSharedCash', () => {
  it('overlays shared deposits on every portfolio when mode is shared', () => {
    const a = newPortfolio('A')
    const b = newPortfolio('B')
    a.deposits = [newOpeningDeposit(1_000, 2026)]
    b.deposits = [newOpeningDeposit(9_000, 2026)]
    const shared = sharedCashFromPortfolio(a, 'USD')
    shared.deposits = [
      newOpeningDeposit(5_000, 2026),
      newDeposit(2027, 2_000),
    ]
    const resolved = resolvePortfoliosCash([a, b], 'shared', shared)
    expect(resolved[0]!.deposits.find((d) => d.isOpening)?.amount).toBe(5_000)
    expect(resolved[1]!.deposits.find((d) => d.isOpening)?.amount).toBe(5_000)
    expect(resolved[0]!.deposits.some((d) => d.year === 2027)).toBe(true)
  })

  it('leaves portfolio unchanged in perPortfolio mode', () => {
    const p = newPortfolio('One')
    p.deposits = [newOpeningDeposit(3_000, 2026)]
  const shared = sharedCashFromPortfolio(p, 'USD')
    const out = resolvePortfolioCash(p, 'perPortfolio', shared)
    expect(out.deposits.find((d) => d.isOpening)?.amount).toBe(3_000)
  })
})

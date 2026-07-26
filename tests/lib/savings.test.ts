import { describe, expect, it } from 'vitest'
import {
  addMonthsToKey,
  balanceNow,
  buildChartRows,
  buildTableColumns,
  cellBalance,
  currentPeriodKey,
  ensurePastPeriodKey,
  latestActual,
  makePeriodKey,
  removePastPeriodKey,
  periodKeyFromDate,
  projectAccount,
  seriesForAccount,
  stepToEndOfMonth,
  totalNow,
} from '../../src/lib/savings'
import type { SavingsAccount } from '../../src/types'

function acc(partial: Partial<SavingsAccount> & Pick<SavingsAccount, 'actuals'>): SavingsAccount {
  return {
    id: partial.id ?? 'a1',
    name: partial.name ?? 'Test',
    actuals: partial.actuals,
    contribution: partial.contribution ?? 0,
    cadence: partial.cadence ?? 'monthly',
    annualRatePercent: partial.annualRatePercent ?? 0,
    sortOrder: partial.sortOrder ?? 0,
  }
}

const asOf = new Date(2026, 6, 15) // Jul 2026
const nowKey = periodKeyFromDate(asOf) // 2026-07

describe('period helpers', () => {
  it('builds and shifts period keys', () => {
    expect(periodKeyFromDate(asOf)).toBe('2026-07')
    expect(makePeriodKey(2025, 12)).toBe('2025-12')
    expect(addMonthsToKey('2026-07', 1)).toBe('2026-08')
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12')
  })
})

describe('actuals', () => {
  it('totalNow sums current-period actuals', () => {
    const accounts = [
      acc({ id: '1', actuals: { [nowKey]: 1000 }, sortOrder: 0 }),
      acc({ id: '2', actuals: { [nowKey]: 2500 }, sortOrder: 1 }),
    ]
    expect(totalNow(accounts, asOf)).toBe(3500)
  })

  it('latestActual prefers last past ≤ now, else 0', () => {
    const a = acc({
      actuals: { '2026-01': 100, '2026-05': 200, '2027-01': 999 },
    })
    expect(latestActual(a, nowKey)).toBe(200)
    expect(latestActual(acc({ actuals: {} }), nowKey)).toBe(0)
  })

  it('past actuals appear as actual and are not changed by rate', () => {
    const a = acc({
      actuals: { '2026-05': 5000, [nowKey]: 5200 },
      contribution: 100,
      annualRatePercent: 12,
      cadence: 'monthly',
    })
    const series = seriesForAccount(a, asOf)
    const past = series.find((p) => p.key === '2026-05')
    expect(past?.kind).toBe('actual')
    expect(past?.balance).toBe(5000)
    const now = series.find((p) => p.key === nowKey)
    expect(now?.kind).toBe('actual')
    expect(now?.balance).toBe(5200)
  })
})

describe('stepToEndOfMonth / compounding', () => {
  it('includes contribution in the target month with no mid-year compound', () => {
    // Aug from Jul: +100 monthly, no compound
    expect(stepToEndOfMonth(1000, '2026-08', 100, 12, 'monthly')).toBe(1100)
  })

  it('compounds only when entering January (Dec → Jan)', () => {
    // 1000 at Dec end → Jan: *1.10 then + monthly 0
    expect(stepToEndOfMonth(1000, '2027-01', 0, 10, 'monthly')).toBe(1100)
  })

  it('January applies compound then monthly contribution', () => {
    // 1000 * 1.10 + 50
    expect(stepToEndOfMonth(1000, '2027-01', 50, 10, 'monthly')).toBe(1150)
  })

  it('yearly contribution only in January (after compound)', () => {
    expect(stepToEndOfMonth(1000, '2026-08', 500, 0, 'yearly')).toBe(1000)
    expect(stepToEndOfMonth(1000, '2027-01', 500, 10, 'yearly')).toBe(1000 * 1.1 + 500)
  })
})

describe('projection', () => {
  it('zero rate + monthly contrib accumulates linearly', () => {
    const a = acc({
      actuals: { [nowKey]: 1000 },
      contribution: 100,
      annualRatePercent: 0,
      cadence: 'monthly',
    })
    const proj = projectAccount(a, asOf)
    const m1 = proj.find((p) => p.key === addMonthsToKey(nowKey, 1))
    const m12 = proj.find((p) => p.key === addMonthsToKey(nowKey, 12))
    expect(m1?.balance).toBe(1100)
    expect(m12?.balance).toBe(1000 + 100 * 12)
    expect(m1?.kind).toBe('projected')
  })

  it('annual compound at year boundary beats pure contributions over a year that includes Jan', () => {
    // Start Dec 2026 so first step is Jan 2027 with compound
    const decAsOf = new Date(2026, 11, 15) // Dec 2026
    const a = acc({
      actuals: { '2026-12': 10000 },
      contribution: 100,
      annualRatePercent: 12,
      cadence: 'monthly',
    })
    const proj = projectAccount(a, decAsOf)
    const jan = proj.find((p) => p.key === '2027-01')
    // 10000 * 1.12 + 100
    expect(jan?.balance).toBeCloseTo(10000 * 1.12 + 100, 6)
    const pureContrib = 10000 + 100
    expect(jan!.balance).toBeGreaterThan(pureContrib)
  })

  it('emits dense months and milestones for any cadence', () => {
    const a = acc({
      actuals: { [nowKey]: 1000 },
      contribution: 500,
      annualRatePercent: 0,
      cadence: 'yearly',
    })
    const proj = projectAccount(a, asOf)
    const keys = proj.map((p) => p.key)
    expect(keys).toContain(addMonthsToKey(nowKey, 3))
    expect(keys).toContain(addMonthsToKey(nowKey, 24))
    expect(keys).toContain('+5y')
    expect(keys).toContain('+10y')
    expect(keys).not.toContain(addMonthsToKey(nowKey, 36))
  })

  it('milestones exist after dense 24 months', () => {
    const a = acc({
      actuals: { [nowKey]: 0 },
      contribution: 10,
      annualRatePercent: 0,
      cadence: 'monthly',
    })
    const proj = projectAccount(a, asOf)
    expect(proj.some((p) => p.key === '+5y')).toBe(true)
    expect(proj.filter((p) => p.kind === 'projected').length).toBeGreaterThan(20)
  })
})

describe('chart + table + past period', () => {
  it('monthly chart: 12 months then year marks including 30y', () => {
    const accounts = [
      acc({ id: 'x', actuals: { '2026-05': 100, [nowKey]: 200 }, sortOrder: 0 }),
      acc({ id: 'y', actuals: { [nowKey]: 300 }, contribution: 0, sortOrder: 1 }),
    ]
    const rows = buildChartRows(accounts, asOf, 'monthly')
    const nowRow = rows.find((r) => r.key === nowKey)
    expect(nowRow?.kind).toBe('actual')
    expect(nowRow?.total).toBe(500)
    expect(Number(nowRow?.['x'])).toBe(200)
    expect(Number(nowRow?.['y'])).toBe(300)

    const past = rows.find((r) => r.key === '2026-05')
    expect(past?.kind).toBe('actual')

    expect(rows.some((r) => r.key === addMonthsToKey(nowKey, 12))).toBe(true)
    expect(rows.some((r) => r.key === addMonthsToKey(nowKey, 13))).toBe(false)
    expect(rows.some((r) => r.key === '+2y')).toBe(true)
    expect(rows.some((r) => r.key === '+30y')).toBe(true)
    expect(rows.some((r) => r.key === '+6y')).toBe(false)
  })

  it('yearly chart: every year through 30', () => {
    const accounts = [acc({ id: 'x', actuals: { [nowKey]: 100 } })]
    const rows = buildChartRows(accounts, asOf, 'yearly')
    const yearKeys = rows.filter((r) => r.key.startsWith('+')).map((r) => r.key)
    expect(yearKeys).toContain('+1y')
    expect(yearKeys).toContain('+30y')
    expect(yearKeys).toHaveLength(30)
    expect(rows.some((r) => r.key === addMonthsToKey(nowKey, 1))).toBe(false)
  })

  it('table: past editable, now not, future projected', () => {
    const accounts = [acc({ actuals: { '2026-04': 1, [nowKey]: 2 } })]
    const cols = buildTableColumns(accounts, asOf)
    const past = cols.find((c) => c.key === '2026-04')
    const now = cols.find((c) => c.key === nowKey)
    const fut = cols.find((c) => c.kind === 'projected')
    expect(past?.editable).toBe(true)
    expect(now?.editable).toBe(false)
    expect(now?.label).toBe('Now')
    expect(fut?.editable).toBe(false)
  })

  it('cellBalance reads actuals and projected', () => {
    const a = acc({
      actuals: { [nowKey]: 1000 },
      contribution: 50,
      annualRatePercent: 0,
      cadence: 'monthly',
    })
    expect(cellBalance(a, nowKey, 'actual', asOf)).toBe(1000)
    expect(balanceNow(a, asOf)).toBe(1000)
    const next = addMonthsToKey(nowKey, 1)
    expect(cellBalance(a, next, 'projected', asOf)).toBe(1050)
  })

  it('ensurePastPeriodKey rejects future and seeds column', () => {
    const accounts = [acc({ id: 'a', actuals: { [nowKey]: 1 } })]
    expect(ensurePastPeriodKey(accounts, '2027-01', asOf)).toBeNull()
    const ok = ensurePastPeriodKey(accounts, '2025-12', asOf)
    expect(ok?.key).toBe('2025-12')
    expect(ok?.accounts[0].actuals['2025-12']).toBe(0)
  })

  it('removePastPeriodKey drops past actuals but not now', () => {
    const accounts = [
      acc({
        id: 'a',
        actuals: { '2025-12': 10, '2026-03': 20, [nowKey]: 30 },
      }),
    ]
    const next = removePastPeriodKey(accounts, '2026-03', asOf)
    expect(next).not.toBeNull()
    expect(next![0].actuals['2026-03']).toBeUndefined()
    expect(next![0].actuals['2025-12']).toBe(10)
    expect(next![0].actuals[nowKey]).toBe(30)
    expect(removePastPeriodKey(accounts, nowKey, asOf)).toBeNull()
  })
})

describe('currentPeriodKey', () => {
  it('matches asOf', () => {
    expect(currentPeriodKey(asOf)).toBe('2026-07')
  })
})

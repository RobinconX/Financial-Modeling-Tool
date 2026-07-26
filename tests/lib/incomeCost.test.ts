import { describe, expect, it } from 'vitest'
import {
  buildScenarioSankeyData,
  copyScenarioAsNew,
  monthlyFromYearly,
  moveScenario,
  newScenario,
  scenarioTotals,
  setAmountFromMonthly,
  setAmountFromYearly,
  sortLines,
  yearlyFromMonthly,
} from '../../src/lib/incomeCost'
import type { CashflowLine, CashflowScenario } from '../../src/types'

function line(
  partial: Partial<CashflowLine> & Pick<CashflowLine, 'kind' | 'scenarioId'>,
): CashflowLine {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? '',
    detail: partial.detail,
    cadence: partial.cadence ?? 'recurring',
    yearlyAmount: partial.yearlyAmount ?? 0,
    lastEdited: partial.lastEdited,
    kind: partial.kind,
    scenarioId: partial.scenarioId,
  }
}

describe('monthly / yearly conversion', () => {
  it('converts both ways', () => {
    expect(yearlyFromMonthly(800)).toBe(9600)
    expect(monthlyFromYearly(12000)).toBe(1000)
  })

  it('setAmountFromMonthly updates yearly', () => {
    const l = setAmountFromMonthly(line({ kind: 'cost', scenarioId: 's1' }), 500)
    expect(l.yearlyAmount).toBe(6000)
    expect(l.lastEdited).toBe('monthly')
  })

  it('setAmountFromYearly updates yearly', () => {
    const l = setAmountFromYearly(line({ kind: 'income', scenarioId: 's1' }), 24000)
    expect(l.yearlyAmount).toBe(24000)
    expect(l.lastEdited).toBe('yearly')
  })
})

describe('scenarioTotals', () => {
  const sid = 's1'
  const lines: CashflowLine[] = [
    line({
      kind: 'cost',
      scenarioId: sid,
      name: 'Rent',
      yearlyAmount: 24000,
      cadence: 'recurring',
    }),
    line({
      kind: 'cost',
      scenarioId: sid,
      name: 'Trip',
      yearlyAmount: 3000,
      cadence: 'one-time',
    }),
    line({
      kind: 'income',
      scenarioId: sid,
      name: 'Salary',
      yearlyAmount: 120000,
      cadence: 'recurring',
    }),
    line({
      kind: 'income',
      scenarioId: 'other',
      name: 'Other',
      yearlyAmount: 1000,
      cadence: 'recurring',
    }),
  ]

  it('aggregates only selected scenario', () => {
    const t = scenarioTotals(lines, sid)
    expect(t.costRecurringYearly).toBe(24000)
    expect(t.costOneTimeYearly).toBe(3000)
    expect(t.costYearly).toBe(27000)
    expect(t.costMonthly).toBe(2000)
    expect(t.incomeYearly).toBe(120000)
    expect(t.incomeMonthly).toBe(10000)
    expect(t.netYearly).toBe(93000)
    expect(t.netMonthly).toBe(8000)
  })
})

describe('sortLines', () => {
  const lines: CashflowLine[] = [
    line({ kind: 'cost', scenarioId: 's', name: 'Zebra', yearlyAmount: 100 }),
    line({ kind: 'cost', scenarioId: 's', name: 'Apple', yearlyAmount: 500 }),
  ]

  it('sorts by name', () => {
    const s = sortLines(lines, 'name', 'asc')
    expect(s.map((l) => l.name)).toEqual(['Apple', 'Zebra'])
  })

  it('sorts by yearly desc', () => {
    const s = sortLines(lines, 'yearly', 'desc')
    expect(s[0].name).toBe('Apple')
  })
})

describe('copyScenarioAsNew', () => {
  it('clones lines into a new scenario with new ids', () => {
    const scenarios: CashflowScenario[] = [newScenario('Base', 0)]
    const sid = scenarios[0].id
    const lines = [
      line({ id: 'a', kind: 'cost', scenarioId: sid, name: 'Food', yearlyAmount: 6000 }),
    ]
    const result = copyScenarioAsNew(scenarios, lines, sid, 'Copy of Base')
    expect(result.scenarios).toHaveLength(2)
    expect(result.newScenario.name).toBe('Copy of Base')
    const cloned = result.lines.filter((l) => l.scenarioId === result.newScenario.id)
    expect(cloned).toHaveLength(1)
    expect(cloned[0].id).not.toBe('a')
    expect(cloned[0].name).toBe('Food')
    expect(result.lines.filter((l) => l.scenarioId === sid)).toHaveLength(1)
  })
})

describe('moveScenario', () => {
  it('swaps order with neighbor', () => {
    const scenarios = [newScenario('A', 0), newScenario('B', 1), newScenario('C', 2)]
    const next = moveScenario(scenarios, scenarios[1].id, 'up')
    const ordered = [...next].sort((a, b) => a.sortOrder - b.sortOrder)
    expect(ordered.map((s) => s.name)).toEqual(['B', 'A', 'C'])
  })
})

describe('buildScenarioSankeyData', () => {
  it('returns null when empty', () => {
    expect(buildScenarioSankeyData([], 's')).toBeNull()
  })

  it('builds balanced income → pool → costs + leftover', () => {
    const sid = 's1'
    const lines = [
      line({ id: 'i1', kind: 'income', scenarioId: sid, name: 'Job', yearlyAmount: 100 }),
      line({ id: 'c1', kind: 'cost', scenarioId: sid, name: 'Rent', yearlyAmount: 40 }),
    ]
    const data = buildScenarioSankeyData(lines, sid)
    expect(data).not.toBeNull()
    const pool = data!.nodes.findIndex((n) => n.kind === 'pool')
    expect(pool).toBeGreaterThanOrEqual(0)
    const intoPool = data!.links
      .filter((l) => l.target === pool)
      .reduce((s, l) => s + l.value, 0)
    const outOfPool = data!.links
      .filter((l) => l.source === pool)
      .reduce((s, l) => s + l.value, 0)
    expect(intoPool).toBeCloseTo(100)
    expect(outOfPool).toBeCloseTo(100) // 40 cost + 60 leftover
    expect(data!.nodes.some((n) => n.kind === 'leftover')).toBe(true)
  })
})

import type {
  CashflowCadence,
  CashflowKind,
  CashflowLine,
  CashflowScenario,
  IncomeCostState,
  MoneyEditField,
  WorkingBalanceDraw,
} from '../types'

export const INCOME_COST_CURRENCY = 'CHF' as const
export const DEFAULT_SCENARIO_NAME = 'Base'

export type SortKey = 'name' | 'monthly' | 'yearly'
export type SortDir = 'asc' | 'desc'

export type ScenarioTotals = {
  scenarioId: string
  costRecurringYearly: number
  costOneTimeYearly: number
  costYearly: number
  costMonthly: number
  incomeRecurringYearly: number
  incomeOneTimeYearly: number
  incomeYearly: number
  incomeMonthly: number
  netYearly: number
  netMonthly: number
}

export function monthlyFromYearly(yearly: number): number {
  if (!Number.isFinite(yearly)) return 0
  return yearly / 12
}

export function yearlyFromMonthly(monthly: number): number {
  if (!Number.isFinite(monthly)) return 0
  return monthly * 12
}

export function newScenario(
  name: string,
  sortOrder: number,
  year?: number,
): CashflowScenario {
  const y =
    year != null && Number.isFinite(year)
      ? Math.floor(year)
      : new Date().getFullYear()
  return {
    id: crypto.randomUUID(),
    name: name.trim() || DEFAULT_SCENARIO_NAME,
    sortOrder,
    year: y,
  }
}

/** Label for pickers: "2025 · Base". */
export function scenarioDisplayName(s: CashflowScenario): string {
  const y = Number.isFinite(s.year) ? s.year : new Date().getFullYear()
  const n = s.name.trim() || DEFAULT_SCENARIO_NAME
  return `${y} · ${n}`
}

export function newCashflowLine(
  scenarioId: string,
  kind: CashflowKind,
  cadence: CashflowCadence = 'recurring',
): CashflowLine {
  return {
    id: crypto.randomUUID(),
    scenarioId,
    kind,
    name: '',
    detail: '',
    cadence,
    yearlyAmount: 0,
    lastEdited: 'monthly',
    month: null,
  }
}

/** Valid calendar month 1–12, else null. */
export function normalizeMonth(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 1 || n > 12) return null
  return n
}

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Positive CHF amount this line contributes in calendar month `month` (1–12).
 * Kind is not applied here — caller splits income vs cost.
 *
 * - month set → full yearlyAmount in that month only
 * - recurring + no month → yearly÷12 every month
 * - one-time + no month → 0 on monthly path
 */
export function amountInMonth(line: CashflowLine, month: number): number {
  if (!(month >= 1 && month <= 12)) return 0
  const amt = line.yearlyAmount > 0 && Number.isFinite(line.yearlyAmount) ? line.yearlyAmount : 0
  if (!(amt > 0)) return 0

  const due = normalizeMonth(line.month)
  if (due != null) {
    return due === month ? amt : 0
  }
  if (line.cadence === 'one-time') return 0
  return monthlyFromYearly(amt)
}

export type MonthlyCashflowPoint = {
  month: number
  label: string
  income: number
  cost: number
  net: number
  /** Cumulative IC working balance (budget lines only; no draws) */
  balance: number
  /** Sum of informative working-balance draws this month */
  draw: number
  /** Cumulative balance after draws */
  balanceAfterDraws: number
}

export function emptyMonthAmounts(): number[] {
  return Array.from({ length: 12 }, () => 0)
}

export function normalizeAmounts12(raw: unknown): number[] {
  const out = emptyMonthAmounts()
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < 12; i++) {
    const n = Number(raw[i])
    out[i] = Number.isFinite(n) && n > 0 ? n : 0
  }
  return out
}

export function newWorkingBalanceDraw(
  scenarioId: string,
  sortOrder = 0,
): WorkingBalanceDraw {
  return {
    id: crypto.randomUUID(),
    scenarioId,
    name: '',
    sortOrder,
    amounts: emptyMonthAmounts(),
  }
}

export function drawsForScenario(
  draws: WorkingBalanceDraw[],
  scenarioId: string,
): WorkingBalanceDraw[] {
  return draws
    .filter((d) => d.scenarioId === scenarioId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export function drawAmountInMonth(draw: WorkingBalanceDraw, month: number): number {
  if (!(month >= 1 && month <= 12)) return 0
  const n = draw.amounts[month - 1]
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Jan–Dec inflows/outflows from budget lines, plus optional informative draws.
 * `openingBalance` is typically permanent Cash savings year-end of prior year.
 * `balance` ignores draws; `balanceAfterDraws` subtracts them.
 */
export function buildMonthlySchedule(
  lines: CashflowLine[],
  scenarioId: string,
  draws: WorkingBalanceDraw[] = [],
  openingBalance = 0,
): MonthlyCashflowPoint[] {
  const ys = linesForScenario(lines, scenarioId)
  const ds = drawsForScenario(draws, scenarioId)
  const open =
    Number.isFinite(openingBalance) && openingBalance > 0 ? openingBalance : 0
  const points: MonthlyCashflowPoint[] = []
  let balance = open
  let balanceAfterDraws = open
  for (let month = 1; month <= 12; month++) {
    let income = 0
    let cost = 0
    for (const l of ys) {
      const a = amountInMonth(l, month)
      if (!(a > 0)) continue
      if (l.kind === 'income') income += a
      else cost += a
    }
    let draw = 0
    for (const d of ds) {
      draw += drawAmountInMonth(d, month)
    }
    const net = income - cost
    balance += net
    balanceAfterDraws += net - draw
    points.push({
      month,
      label: MONTH_LABELS[month - 1]!,
      income,
      cost,
      net,
      balance,
      draw,
      balanceAfterDraws,
    })
  }
  return points
}

/** One-time lines with amount but no month (missing from monthly path). */
export function oneTimeMissingMonthCount(lines: CashflowLine[], scenarioId: string): number {
  return linesForScenario(lines, scenarioId).filter(
    (l) =>
      l.cadence === 'one-time' &&
      l.yearlyAmount > 0 &&
      normalizeMonth(l.month) == null,
  ).length
}

export function emptyIncomeCostState(): IncomeCostState {
  const base = newScenario(DEFAULT_SCENARIO_NAME, 0)
  return { version: 3, scenarios: [base], lines: [], draws: [] }
}

export function sortedScenarios(scenarios: CashflowScenario[]): CashflowScenario[] {
  return [...scenarios].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  )
}

export function linesForScenario(lines: CashflowLine[], scenarioId: string): CashflowLine[] {
  return lines.filter((l) => l.scenarioId === scenarioId)
}

export function lineMonthly(line: CashflowLine): number {
  if (line.cadence === 'one-time') return 0
  return monthlyFromYearly(line.yearlyAmount)
}

export function sortLines(
  lines: CashflowLine[],
  key: SortKey,
  dir: SortDir,
): CashflowLine[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...lines].sort((a, b) => {
    if (key === 'name') {
      return mul * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    if (key === 'monthly') {
      return mul * (lineMonthly(a) - lineMonthly(b))
    }
    return mul * (a.yearlyAmount - b.yearlyAmount)
  })
}

export function setAmountFromMonthly(line: CashflowLine, monthly: number): CashflowLine {
  const m = Number.isFinite(monthly) && monthly >= 0 ? monthly : 0
  return {
    ...line,
    yearlyAmount: yearlyFromMonthly(m),
    lastEdited: 'monthly' as MoneyEditField,
  }
}

export function setAmountFromYearly(line: CashflowLine, yearly: number): CashflowLine {
  const y = Number.isFinite(yearly) && yearly >= 0 ? yearly : 0
  return {
    ...line,
    yearlyAmount: y,
    lastEdited: 'yearly' as MoneyEditField,
  }
}

export function scenarioTotals(lines: CashflowLine[], scenarioId: string): ScenarioTotals {
  const ys = linesForScenario(lines, scenarioId)
  let costRecurringYearly = 0
  let costOneTimeYearly = 0
  let incomeRecurringYearly = 0
  let incomeOneTimeYearly = 0

  for (const l of ys) {
    const amt = l.yearlyAmount > 0 ? l.yearlyAmount : 0
    if (l.kind === 'cost') {
      if (l.cadence === 'one-time') costOneTimeYearly += amt
      else costRecurringYearly += amt
    } else if (l.cadence === 'one-time') incomeOneTimeYearly += amt
    else incomeRecurringYearly += amt
  }

  const costYearly = costRecurringYearly + costOneTimeYearly
  const incomeYearly = incomeRecurringYearly + incomeOneTimeYearly

  return {
    scenarioId,
    costRecurringYearly,
    costOneTimeYearly,
    costYearly,
    costMonthly: monthlyFromYearly(costRecurringYearly),
    incomeRecurringYearly,
    incomeOneTimeYearly,
    incomeYearly,
    incomeMonthly: monthlyFromYearly(incomeRecurringYearly),
    netYearly: incomeYearly - costYearly,
    netMonthly: monthlyFromYearly(incomeRecurringYearly - costRecurringYearly),
  }
}

/** Clone all lines + draws from source into a new scenario (new ids). */
export function copyScenarioAsNew(
  scenarios: CashflowScenario[],
  lines: CashflowLine[],
  fromScenarioId: string,
  newName: string,
  year?: number,
  draws: WorkingBalanceDraw[] = [],
): {
  scenarios: CashflowScenario[]
  lines: CashflowLine[]
  draws: WorkingBalanceDraw[]
  newScenario: CashflowScenario
} {
  const maxOrder = scenarios.reduce((m, s) => Math.max(m, s.sortOrder), -1)
  const source = scenarios.find((s) => s.id === fromScenarioId)
  const y =
    year != null && Number.isFinite(year)
      ? Math.floor(year)
      : (source?.year ?? new Date().getFullYear()) + 1
  const created = newScenario(newName, maxOrder + 1, y)
  const clones = linesForScenario(lines, fromScenarioId).map((l) => ({
    ...l,
    id: crypto.randomUUID(),
    scenarioId: created.id,
  }))
  const drawClones = drawsForScenario(draws, fromScenarioId).map((d) => ({
    ...d,
    id: crypto.randomUUID(),
    scenarioId: created.id,
    amounts: normalizeAmounts12(d.amounts),
  }))
  return {
    scenarios: [...scenarios, created],
    lines: [...lines, ...clones],
    draws: [...draws, ...drawClones],
    newScenario: created,
  }
}

export function reorderScenarios(
  scenarios: CashflowScenario[],
  orderedIds: string[],
): CashflowScenario[] {
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const next: CashflowScenario[] = []
  let order = 0
  for (const id of orderedIds) {
    const s = byId.get(id)
    if (s) {
      next.push({ ...s, sortOrder: order++ })
      byId.delete(id)
    }
  }
  for (const s of byId.values()) {
    next.push({ ...s, sortOrder: order++ })
  }
  return next
}

export function moveScenario(
  scenarios: CashflowScenario[],
  id: string,
  direction: 'up' | 'down',
): CashflowScenario[] {
  const sorted = sortedScenarios(scenarios)
  const i = sorted.findIndex((s) => s.id === id)
  if (i < 0) return scenarios
  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= sorted.length) return scenarios
  const ids = sorted.map((s) => s.id)
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return reorderScenarios(scenarios, ids)
}

export type SankeyNodeKind = 'income' | 'pool' | 'cost' | 'leftover' | 'gap'

export type SankeyNode = {
  /** Unique key used by Recharts */
  name: string
  /** Label drawn on the chart */
  displayName: string
  kind: SankeyNodeKind
  /** Optional note from the cashflow line (for tooltips) */
  note?: string
  /** Yearly CHF amount for this position (for tooltips) */
  yearlyAmount?: number
}

export type SankeyLink = {
  source: number
  target: number
  value: number
  /** Position-facing label for tooltips (prefer endpoint name) */
  positionName?: string
  note?: string
}

/**
 * Balanced 3-column flow:
 *   incomes (+ gap if underfunded) → Total income → costs + Left over
 * Values are CHF yearly. Guarantees inflow = outflow at the pool node.
 */
export function buildScenarioSankeyData(
  lines: CashflowLine[],
  scenarioId: string,
): { nodes: SankeyNode[]; links: SankeyLink[] } | null {
  const ys = linesForScenario(lines, scenarioId).filter((l) => l.yearlyAmount > 0)
  if (ys.length === 0) return null

  const incomes = ys.filter((l) => l.kind === 'income')
  const costs = ys.filter((l) => l.kind === 'cost')
  const totals = scenarioTotals(lines, scenarioId)
  if (totals.incomeYearly <= 0 && totals.costYearly <= 0) return null

  const nodes: SankeyNode[] = []
  const links: SankeyLink[] = []

  const addNode = (
    name: string,
    displayName: string,
    kind: SankeyNodeKind,
    extra?: { note?: string; yearlyAmount?: number },
  ) => {
    nodes.push({
      name,
      displayName,
      kind,
      note: extra?.note,
      yearlyAmount: extra?.yearlyAmount,
    })
    return nodes.length - 1
  }

  const lineLabel = (l: CashflowLine, fallback: string) => {
    const base = l.name.trim() || fallback
    return l.cadence === 'one-time' ? `${base} ★` : base
  }

  const lineNote = (l: CashflowLine) => {
    const n = l.detail?.trim()
    return n ? n : undefined
  }

  const poolIdx = addNode('pool', 'Total income', 'pool', {
    yearlyAmount: Math.max(totals.incomeYearly, totals.costYearly),
  })

  // Left → pool
  if (incomes.length === 0 && costs.length > 0) {
    const gapIdx = addNode('gap', 'Unfunded', 'gap', {
      yearlyAmount: totals.costYearly,
    })
    links.push({
      source: gapIdx,
      target: poolIdx,
      value: totals.costYearly,
      positionName: 'Unfunded',
    })
  } else {
    for (const inc of incomes) {
      const label = lineLabel(inc, 'Income')
      const i = addNode(`in-${inc.id}`, label, 'income', {
        note: lineNote(inc),
        yearlyAmount: inc.yearlyAmount,
      })
      links.push({
        source: i,
        target: poolIdx,
        value: inc.yearlyAmount,
        positionName: label,
        note: lineNote(inc),
      })
    }
    // If costs exceed income, top up the pool so outflows can balance
    if (totals.costYearly > totals.incomeYearly + 0.005) {
      const gap = totals.costYearly - totals.incomeYearly
      const gapIdx = addNode('gap', 'Unfunded', 'gap', { yearlyAmount: gap })
      links.push({
        source: gapIdx,
        target: poolIdx,
        value: gap,
        positionName: 'Unfunded',
      })
    }
  }

  // Pool → right (costs + leftover)
  for (const c of costs) {
    const label = lineLabel(c, 'Cost')
    const i = addNode(`out-${c.id}`, label, 'cost', {
      note: lineNote(c),
      yearlyAmount: c.yearlyAmount,
    })
    links.push({
      source: poolIdx,
      target: i,
      value: c.yearlyAmount,
      positionName: label,
      note: lineNote(c),
    })
  }

  const leftover = totals.incomeYearly - totals.costYearly
  if (leftover > 0.005) {
    const leftIdx = addNode('leftover', 'Left over', 'leftover', {
      yearlyAmount: leftover,
    })
    links.push({
      source: poolIdx,
      target: leftIdx,
      value: leftover,
      positionName: 'Left over',
    })
  }

  if (links.length === 0) return null
  return { nodes, links }
}

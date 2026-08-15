import type { NetWorthGoal } from '../types'
import { parseMoney } from './format'

export const SHOW_GOALS_KEY = 'grok-lab-show-goals'

export function readShowGoals(): boolean {
  try {
    return localStorage.getItem(SHOW_GOALS_KEY) === '1'
  } catch {
    return false
  }
}

export function writeShowGoals(show: boolean): void {
  try {
    localStorage.setItem(SHOW_GOALS_KEY, show ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function newNetWorthGoal(
  year: number,
  amountChf: number,
  name = '',
): NetWorthGoal {
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 40),
    amountChf,
    year,
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function normalizeNetWorthGoal(raw: unknown): NetWorthGoal | null {
  if (!isRecord(raw)) return null
  const year = Math.floor(Number(raw.year))
  const amount = Number(raw.amountChf)
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null
  if (!Number.isFinite(amount) || amount <= 0) return null
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : ''
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    name,
    amountChf: amount,
    year,
  }
}

export function parseGoalAmount(raw: string): number | null {
  const n = parseMoney(raw)
  if (n == null || !(n > 0)) return null
  return n
}

export function maxGoalAmount(goals: NetWorthGoal[]): number {
  let m = 0
  for (const g of goals) {
    if (g.amountChf > m) m = g.amountChf
  }
  return m
}

/** Y-axis top so the goal line is visible (pad 4%). */
export function goalYMax(goals: NetWorthGoal[]): (dataMax: number) => number {
  const g = maxGoalAmount(goals)
  return (dataMax: number) => {
    const m = Math.max(Number(dataMax) || 0, g)
    return m > 0 ? m * 1.04 : 1
  }
}

/** Where to put a year goal on this chart (yearly key, else Dec / last month). */
export function goalMarkXKey(year: number, xKeys: string[]): string | null {
  const have = new Set(xKeys)
  if (have.has(String(year))) return String(year)
  const dec = `${year}-12`
  if (have.has(dec)) return dec
  const inYear = xKeys.filter((k) => k.startsWith(`${year}-`)).sort()
  return inYear[inYear.length - 1] ?? null
}


import type {
  CashflowLine,
  CashflowScenario,
  IncomeCostState,
} from '../types'
import { emptyIncomeCostState, newScenario } from './incomeCost'

export const INCOME_COST_STORAGE_KEY = 'grok-lab.income-cost.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function parseYearFromName(name: string): number | null {
  const m = /^(\d{4})\b/.exec(name.trim())
  if (!m) return null
  const y = Number(m[1])
  return y >= 1970 && y <= 2100 ? y : null
}

function normalizeScenario(raw: unknown, index: number): CashflowScenario | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const fromField = Math.floor(asNumber(raw.year, NaN))
  const year =
    Number.isFinite(fromField) && fromField >= 1970 && fromField <= 2100
      ? fromField
      : (parseYearFromName(name) ?? new Date().getFullYear())
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    name,
    sortOrder: Math.floor(asNumber(raw.sortOrder, index)),
    year,
  }
}

function normalizeLine(raw: unknown, scenarioIds: Set<string>): CashflowLine | null {
  if (!isRecord(raw)) return null
  const scenarioId = typeof raw.scenarioId === 'string' ? raw.scenarioId : null
  if (!scenarioId || !scenarioIds.has(scenarioId)) return null
  const kind = raw.kind === 'income' ? 'income' : raw.kind === 'cost' ? 'cost' : null
  if (!kind) return null
  const cadence = raw.cadence === 'one-time' ? 'one-time' : 'recurring'
  const line: CashflowLine = {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    scenarioId,
    kind,
    name: typeof raw.name === 'string' ? raw.name : '',
    cadence,
    yearlyAmount: Math.max(0, asNumber(raw.yearlyAmount, 0)),
  }
  if (typeof raw.detail === 'string' && raw.detail) line.detail = raw.detail
  if (raw.lastEdited === 'monthly' || raw.lastEdited === 'yearly') {
    line.lastEdited = raw.lastEdited
  }
  return line
}

/** Migrate v1 { lines: [{ year, ...}] } → v2 scenarios + scenarioId. */
function migrateV1(raw: Record<string, unknown>): IncomeCostState {
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : []
  const yearSet = new Set<number>()
  for (const item of linesRaw) {
    if (!isRecord(item)) continue
    const y = Math.floor(asNumber(item.year, 0))
    if (y >= 2000 && y <= 2100) yearSet.add(y)
  }
  const years = [...yearSet].sort((a, b) => a - b)
  if (years.length === 0) return emptyIncomeCostState()

  const scenarios: CashflowScenario[] = years.map((y, i) => newScenario(String(y), i, y))
  const yearToId = new Map(years.map((y, i) => [y, scenarios[i]!.id]))
  const scenarioIds = new Set(scenarios.map((s) => s.id))

  const lines: CashflowLine[] = []
  for (const item of linesRaw) {
    if (!isRecord(item)) continue
    const y = Math.floor(asNumber(item.year, 0))
    const scenarioId = yearToId.get(y)
    if (!scenarioId) continue
    const kind = item.kind === 'income' ? 'income' : item.kind === 'cost' ? 'cost' : null
    if (!kind) continue
    const line: CashflowLine = {
      id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
      scenarioId,
      kind,
      name: typeof item.name === 'string' ? item.name : '',
      cadence: item.cadence === 'one-time' ? 'one-time' : 'recurring',
      yearlyAmount: Math.max(0, asNumber(item.yearlyAmount, 0)),
    }
    if (typeof item.detail === 'string' && item.detail) line.detail = item.detail
    if (item.lastEdited === 'monthly' || item.lastEdited === 'yearly') {
      line.lastEdited = item.lastEdited
    }
    if (scenarioIds.has(line.scenarioId)) lines.push(line)
  }

  return { version: 2, scenarios, lines }
}

export function loadIncomeCost(): IncomeCostState {
  try {
    const raw = localStorage.getItem(INCOME_COST_STORAGE_KEY)
    if (!raw) return emptyIncomeCostState()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return emptyIncomeCostState()

    // v2
    if (parsed.version === 2 && Array.isArray(parsed.scenarios)) {
      const scenarios = parsed.scenarios
        .map((s, i) => normalizeScenario(s, i))
        .filter((s): s is CashflowScenario => s != null)
      if (scenarios.length === 0) return emptyIncomeCostState()
      const ids = new Set(scenarios.map((s) => s.id))
      const lines = Array.isArray(parsed.lines)
        ? parsed.lines
            .map((l) => normalizeLine(l, ids))
            .filter((l): l is CashflowLine => l != null)
        : []
      return { version: 2, scenarios, lines }
    }

    // v1 or unversioned with year-based lines
    if (Array.isArray(parsed.lines)) {
      return migrateV1(parsed)
    }

    return emptyIncomeCostState()
  } catch {
    return emptyIncomeCostState()
  }
}

export function saveIncomeCost(
  state: IncomeCostState,
): { ok: true } | { ok: false; error: string } {
  try {
    const payload: IncomeCostState = {
      version: 2,
      scenarios: state.scenarios,
      lines: state.lines,
    }
    localStorage.setItem(INCOME_COST_STORAGE_KEY, JSON.stringify(payload))
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save income/cost data',
    }
  }
}

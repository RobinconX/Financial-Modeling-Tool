import type {
  OverviewScenario,
  OverviewSeries,
  OverviewSeriesType,
  OverviewState,
} from '../types'
import { clampOverviewRange, defaultOverviewState, newOverviewScenario } from './overview'

export const OVERVIEW_STORAGE_KEY = 'grok-lab.overview.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normalizeType(v: unknown): OverviewSeriesType {
  if (v === 'portfolio' || v === 'savings' || v === 'manual') return v
  return 'manual'
}

function normalizeSeries(raw: unknown, index: number): OverviewSeries | null {
  if (!isRecord(raw)) return null
  const type = normalizeType(raw.type)
  const name = typeof raw.name === 'string' ? raw.name : ''
  const series: OverviewSeries = {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    // Allow empty labels (UI shows placeholder); do not force "Cash"/"Series"
    name,
    enabled: raw.enabled !== false,
    sortOrder: Math.floor(asNumber(raw.sortOrder, index)),
    type,
  }
  if (typeof raw.color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.color.trim())) {
    series.color = raw.color.trim()
  }
  if (type === 'portfolio') {
    series.portfolioId = typeof raw.portfolioId === 'string' ? raw.portfolioId : null
  }
  if (type === 'savings') {
    series.savingsAccountId =
      typeof raw.savingsAccountId === 'string' ? raw.savingsAccountId : null
  }
  if (type === 'manual') {
    series.baseChf = Math.max(0, asNumber(raw.baseChf, 0))
    series.annualRatePercent = asNumber(raw.annualRatePercent, 0)
    series.baseYear = Math.floor(asNumber(raw.baseYear, new Date().getFullYear()))
  }
  return series
}

function normalizeScenario(raw: unknown, index: number, asOf = new Date()): OverviewScenario | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const cy = asOf.getFullYear()
  const range = clampOverviewRange(
    asNumber(raw.startYear, cy),
    asNumber(raw.endYear, cy + 10),
    asOf,
  )
  const list = Array.isArray(raw.series) ? raw.series : []
  const series = list
    .map((s, i) => normalizeSeries(s, i))
    .filter((s): s is OverviewSeries => s != null)
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    name: name || `Scenario ${index + 1}`,
    sortOrder: Math.floor(asNumber(raw.sortOrder, index)),
    startYear: range.startYear,
    endYear: range.endYear,
    series,
  }
}

/** Migrate flat v1 { startYear, endYear, series } → v2 scenarios. */
function migrateV1(raw: Record<string, unknown>): OverviewState {
  const asOf = new Date()
  const cy = asOf.getFullYear()
  const range = clampOverviewRange(
    asNumber(raw.startYear, cy),
    asNumber(raw.endYear, cy + 10),
    asOf,
  )
  const list = Array.isArray(raw.series) ? raw.series : []
  const series = list
    .map((s, i) => normalizeSeries(s, i))
    .filter((s): s is OverviewSeries => s != null)
  const scenario = newOverviewScenario('Base', 0, asOf, series)
  scenario.startYear = range.startYear
  scenario.endYear = range.endYear
  return {
    version: 2,
    scenarios: [scenario],
    selectedScenarioId: scenario.id,
  }
}

export function loadOverview(): OverviewState {
  try {
    const raw = localStorage.getItem(OVERVIEW_STORAGE_KEY)
    if (!raw) return defaultOverviewState()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return defaultOverviewState()

    // v1 flat shape
    if (parsed.version === 1 || (!parsed.scenarios && Array.isArray(parsed.series))) {
      return migrateV1(parsed)
    }

    const list = Array.isArray(parsed.scenarios) ? parsed.scenarios : []
    const scenarios = list
      .map((s, i) => normalizeScenario(s, i))
      .filter((s): s is OverviewScenario => s != null)

    if (scenarios.length === 0) return defaultOverviewState()

    let selectedScenarioId =
      typeof parsed.selectedScenarioId === 'string' ? parsed.selectedScenarioId : null
    if (!selectedScenarioId || !scenarios.some((s) => s.id === selectedScenarioId)) {
      selectedScenarioId = scenarios[0]!.id
    }

    return {
      version: 2,
      scenarios,
      selectedScenarioId,
    }
  } catch {
    return defaultOverviewState()
  }
}

export function saveOverview(state: OverviewState): { ok: true } | { ok: false; error: string } {
  try {
    const payload: OverviewState = {
      version: 2,
      scenarios: state.scenarios,
      selectedScenarioId: state.selectedScenarioId,
    }
    localStorage.setItem(OVERVIEW_STORAGE_KEY, JSON.stringify(payload))
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save overview'
    return { ok: false, error: msg }
  }
}

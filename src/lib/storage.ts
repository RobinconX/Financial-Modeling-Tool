import type { SavedScenario, StoragePayload } from '../types'
import { queueAppDataChanged } from './linkedMirrorGate'
import {
  buildRecoveryNotice,
  type StorageLoadResult,
} from './storageLoadRecovery'
import {
  newEasyProjection,
  sortEasyProjections,
  sortYearProjections,
} from './valuation'

export const STORAGE_KEY = 'grok-lab.saved-scenarios.v1'

function emptyPayload(): StoragePayload {
  return { version: 1, scenarios: [] }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asNumberOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function normalizeScenario(raw: unknown): SavedScenario | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : null
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.toUpperCase() : null
  const name = typeof raw.name === 'string' ? raw.name.trim() : null
  if (!id || !symbol || !name) return null

  const easyRows = Array.isArray(raw.easyRows)
    ? raw.easyRows.map((r, i) => {
        const row = isRecord(r) ? r : {}
        return {
          id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
          year:
            typeof row.year === 'number'
              ? row.year
              : new Date().getFullYear() + 5 + i,
          projectedMarketCap: asNumberOrNull(row.projectedMarketCap),
        }
      })
    : [newEasyProjection()]

  const advancedRows = Array.isArray(raw.advancedRows)
    ? raw.advancedRows.map((r, i) => {
        const row = isRecord(r) ? r : {}
        return {
          id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
          year:
            typeof row.year === 'number'
              ? row.year
              : new Date().getFullYear() + 5 + i,
          dilutionFactor:
            typeof row.dilutionFactor === 'number' && row.dilutionFactor > 0
              ? row.dilutionFactor
              : 1,
          revenue: asNumberOrNull(row.revenue),
          psMultiple: asNumberOrNull(row.psMultiple),
          fcf: asNumberOrNull(row.fcf),
          pfcfMultiple: asNumberOrNull(row.pfcfMultiple),
          profit: asNumberOrNull(row.profit),
          peMultiple: asNumberOrNull(row.peMultiple),
        }
      })
    : []

  const now = new Date().toISOString()
  return {
    id,
    symbol,
    name,
    companyName: typeof raw.companyName === 'string' ? raw.companyName : null,
    currency: typeof raw.currency === 'string' ? raw.currency : 'USD',
    currentPrice: asNumberOrNull(raw.currentPrice),
    currentMarketCap: asNumberOrNull(raw.currentMarketCap),
    sharesOutstanding: asNumberOrNull(raw.sharesOutstanding),
    mcapOverride: asNumberOrNull(raw.mcapOverride),
    easyRows: sortEasyProjections(easyRows.length ? easyRows : [newEasyProjection()]),
    // Empty allowed — advanced is optional until the user adds it
    advancedRows: sortYearProjections(advancedRows),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

export function loadScenariosWithRecovery(): StorageLoadResult<SavedScenario[]> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { data: [], recovery: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.warn('[storage] Failed to parse scenarios', err)
      return {
        data: [],
        recovery: buildRecoveryNotice(STORAGE_KEY, 'Projections', 'parse', raw),
      }
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.scenarios)) {
      console.warn('[storage] Invalid payload shape; resetting')
      return {
        data: [],
        recovery: buildRecoveryNotice(STORAGE_KEY, 'Projections', 'shape', raw),
      }
    }
    const data = parsed.scenarios
      .map(normalizeScenario)
      .filter((s): s is SavedScenario => s != null)
    return { data, recovery: null }
  } catch (err) {
    console.warn('[storage] Failed to load scenarios', err)
    if (raw) {
      return {
        data: [],
        recovery: buildRecoveryNotice(STORAGE_KEY, 'Projections', 'parse', raw),
      }
    }
    return { data: [], recovery: null }
  }
}

export function loadScenarios(): SavedScenario[] {
  return loadScenariosWithRecovery().data
}

export function saveScenarios(scenarios: SavedScenario[]): { ok: true } | { ok: false; error: string } {
  try {
    const payload: StoragePayload = { version: 1, scenarios }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    queueAppDataChanged()
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'QuotaExceededError'
        ? 'Browser storage is full. Delete some scenarios and try again.'
        : err instanceof Error
          ? err.message
          : 'Failed to save scenarios'
    return { ok: false, error: message }
  }
}

export function findBySymbolAndName(
  scenarios: SavedScenario[],
  symbol: string,
  name: string,
): SavedScenario | undefined {
  const s = symbol.toUpperCase()
  const n = name.trim().toLowerCase()
  return scenarios.find((x) => x.symbol === s && x.name.toLowerCase() === n)
}

export function groupScenariosByTicker(
  scenarios: SavedScenario[],
): { symbol: string; scenarios: SavedScenario[] }[] {
  const map = new Map<string, SavedScenario[]>()
  for (const sc of scenarios) {
    const list = map.get(sc.symbol) ?? []
    list.push(sc)
    map.set(sc.symbol, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, list]) => ({
      symbol,
      scenarios: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

/** Seed empty payload in storage (debug / tests). */
export function clearScenarios(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyPayload()))
}

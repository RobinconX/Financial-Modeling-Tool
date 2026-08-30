import type { ComparableEntry, SavedComparable } from '../types'
import { isComparableBasis, newComparable } from './comparables'
import { queueAppDataChanged } from './linkedMirrorGate'

export const COMPARABLES_STORAGE_KEY = 'grok-lab.saved-comparables.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeEntry(raw: unknown): ComparableEntry | null {
  if (!isRecord(raw)) return null
  const scenarioId = typeof raw.scenarioId === 'string' ? raw.scenarioId : ''
  if (!scenarioId) return null
  return {
    scenarioId,
    basis: isComparableBasis(raw.basis) ? raw.basis : 'easy',
  }
}

export function normalizeComparable(raw: unknown): SavedComparable | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : crypto.randomUUID()
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled'
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(normalizeEntry).filter((e): e is ComparableEntry => e != null)
    : []
  const sortYear =
    raw.sortYear != null && Number.isFinite(Number(raw.sortYear))
      ? Math.floor(Number(raw.sortYear))
      : null
  const sortDir = raw.sortDir === 'asc' ? 'asc' : 'desc'
  const filterYears = Array.isArray(raw.filterYears)
    ? [...new Set(
        raw.filterYears
          .map((y) => Math.floor(Number(y)))
          .filter((y) => Number.isFinite(y) && y > 1900 && y < 3000),
      )].sort((a, b) => a - b)
    : null
  const now = new Date().toISOString()
  return {
    id,
    name,
    entries,
    sortYear,
    sortDir,
    filterYears: filterYears ?? [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

export function loadComparables(): SavedComparable[] {
  try {
    const raw = localStorage.getItem(COMPARABLES_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.comparables)) {
      console.warn('[comparablesStorage] Invalid payload; resetting')
      return []
    }
    return parsed.comparables
      .map(normalizeComparable)
      .filter((c): c is SavedComparable => c != null)
  } catch (err) {
    console.warn('[comparablesStorage] Failed to load', err)
    return []
  }
}

export function saveComparables(
  comparables: SavedComparable[],
): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(
      COMPARABLES_STORAGE_KEY,
      JSON.stringify({ version: 1, comparables }),
    )
    queueAppDataChanged()
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'QuotaExceededError'
        ? 'Browser storage is full. Delete some comparables and try again.'
        : err instanceof Error
          ? err.message
          : 'Failed to save comparables'
    return { ok: false, error: message }
  }
}

export { newComparable }
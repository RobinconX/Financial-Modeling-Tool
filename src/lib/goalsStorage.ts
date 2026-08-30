import type { NetWorthGoal } from '../types'
import { normalizeNetWorthGoal } from './goals'
import { queueAppDataChanged } from './linkedMirrorGate'

export const GOALS_STORAGE_KEY = 'grok-lab.goals.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function loadGoals(): NetWorthGoal[] {
  try {
    const raw = localStorage.getItem(GOALS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.goals)) {
      console.warn('[goalsStorage] Invalid payload; resetting')
      return []
    }
    return parsed.goals
      .map(normalizeNetWorthGoal)
      .filter((g): g is NetWorthGoal => g != null)
      .sort((a, b) => a.year - b.year || a.amountChf - b.amountChf)
  } catch (err) {
    console.warn('[goalsStorage] Failed to load', err)
    return []
  }
}

export function saveGoals(
  goals: NetWorthGoal[],
): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify({ version: 1, goals }))
    queueAppDataChanged()
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'QuotaExceededError'
        ? 'Browser storage is full.'
        : err instanceof Error
          ? err.message
          : 'Failed to save goals'
    return { ok: false, error: message }
  }
}
import type { SavingsAccount, SavingsCadence, SavingsState } from '../types'
import {
  emptySavingsState,
  ensurePermanentCashAccount,
  periodKeyFromDate,
} from './savings'

export const SAVINGS_STORAGE_KEY = 'grok-lab.savings.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normalizeCadence(v: unknown): SavingsCadence {
  return v === 'yearly' ? 'yearly' : 'monthly'
}

function normalizeActuals(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}$/.test(k)) continue
    const n = asNumber(v, NaN)
    if (!Number.isFinite(n)) continue
    out[k] = Math.max(0, n)
  }
  return out
}

function normalizeAccount(raw: unknown, index: number): SavingsAccount | null {
  if (!isRecord(raw)) return null
  const actuals = normalizeActuals(raw.actuals)
  // Migrate legacy `amount` field if present
  if (Object.keys(actuals).length === 0 && raw.amount != null) {
    const now = periodKeyFromDate(new Date())
    actuals[now] = Math.max(0, asNumber(raw.amount, 0))
  }
  const role = raw.role === 'cash' ? 'cash' : null
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === 'string' ? raw.name : '',
    actuals,
    contribution: Math.max(0, asNumber(raw.contribution, 0)),
    cadence: normalizeCadence(raw.cadence),
    annualRatePercent: asNumber(raw.annualRatePercent, 0),
    sortOrder: Math.floor(asNumber(raw.sortOrder, index)),
    role,
  }
}

export function loadSavings(): SavingsState {
  try {
    const raw = localStorage.getItem(SAVINGS_STORAGE_KEY)
    if (!raw) return emptySavingsState()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return emptySavingsState()
    const list = Array.isArray(parsed.accounts) ? parsed.accounts : []
    const accounts = ensurePermanentCashAccount(
      list
        .map((a, i) => normalizeAccount(a, i))
        .filter((a): a is SavingsAccount => a != null),
    )
    return { version: 1, accounts }
  } catch {
    return emptySavingsState()
  }
}

export function saveSavings(state: SavingsState): { ok: true } | { ok: false; error: string } {
  try {
    const accounts = ensurePermanentCashAccount(state.accounts)
    const payload: SavingsState = {
      version: 1,
      accounts: accounts.map((a, i) => ({
        id: a.id,
        name: a.name,
        actuals: a.actuals,
        contribution: a.contribution,
        cadence: a.cadence,
        annualRatePercent: a.annualRatePercent,
        sortOrder: a.sortOrder ?? i,
        role: a.role === 'cash' ? 'cash' : null,
      })),
    }
    localStorage.setItem(SAVINGS_STORAGE_KEY, JSON.stringify(payload))
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save savings'
    return { ok: false, error: msg }
  }
}

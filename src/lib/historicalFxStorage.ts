export const FX_DAILY_STORAGE_KEY = 'grok-lab.fx-daily.usd-chf.v1'

/** Skip Frankfurter network after a failed range fetch. */
export const FX_FETCH_COOLDOWN_MS = 30 * 60 * 1000

type Store = {
  version: 1
  byDate: Record<string, number>
  /** Epoch ms — do not call Frankfurter until elapsed. */
  fetchFailedAt?: number
}

function readStore(): Store {
  if (typeof localStorage === 'undefined') return { version: 1, byDate: {} }
  try {
    const raw = localStorage.getItem(FX_DAILY_STORAGE_KEY)
    if (!raw) return { version: 1, byDate: {} }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { version: 1, byDate: {} }
    const o = parsed as { version?: unknown; byDate?: unknown; fetchFailedAt?: unknown }
    const byDateRaw = o.byDate
    if (typeof byDateRaw !== 'object' || byDateRaw === null) {
      return { version: 1, byDate: {} }
    }
    const byDate: Record<string, number> = {}
    for (const [k, v] of Object.entries(byDateRaw)) {
      const n = Number(v)
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(n) && n > 0) {
        byDate[k] = n
      }
    }
    const fetchFailedAt =
      typeof o.fetchFailedAt === 'number' && Number.isFinite(o.fetchFailedAt)
        ? o.fetchFailedAt
        : undefined
    return { version: 1, byDate, fetchFailedAt }
  } catch {
    return { version: 1, byDate: {} }
  }
}

function writeStore(store: Store): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(FX_DAILY_STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* quota */
  }
}

export function readFxDailyCache(): Record<string, number> {
  return { ...readStore().byDate }
}

export function isFrankfurterFetchInCooldown(now = Date.now()): boolean {
  const failedAt = readStore().fetchFailedAt
  if (failedAt == null) return false
  return now - failedAt < FX_FETCH_COOLDOWN_MS
}

export function markFrankfurterFetchFailed(at = Date.now()): void {
  const store = readStore()
  store.fetchFailedAt = at
  writeStore(store)
}

export function clearFrankfurterFetchFailure(): void {
  const store = readStore()
  delete store.fetchFailedAt
  writeStore(store)
}

export function cacheFxRateForDate(isoDate: string, rate: number): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isFinite(rate) || rate <= 0) return
  const store = readStore()
  store.byDate[isoDate] = rate
  writeStore(store)
}

export function cacheFxRatesBulk(rates: Record<string, number>): void {
  const store = readStore()
  for (const [d, rate] of Object.entries(rates)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(rate) && rate > 0) {
      store.byDate[d] = rate
    }
  }
  writeStore(store)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidFxDailyRate(date: string, rate: unknown): rate is number {
  const n = Number(rate)
  return ISO_DATE.test(date) && Number.isFinite(n) && n > 0
}

/** Parse USD/CHF daily rates from a snapshot field; strips invalid entries. */
export function parseFxDailyRatesMap(raw: unknown): Record<string, number> | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (isValidFxDailyRate(k, v)) out[k] = v
  }
  return out
}

/** Add snapshot rates only for dates missing locally; existing local dates are kept. */
export function mergeFxDailyCacheFromSnapshot(incoming: Record<string, number>): void {
  const store = readStore()
  let changed = false
  for (const [d, rate] of Object.entries(incoming)) {
    if (!isValidFxDailyRate(d, rate)) continue
    if (Object.prototype.hasOwnProperty.call(store.byDate, d)) continue
    store.byDate[d] = rate
    changed = true
  }
  if (changed) writeStore(store)
}
export const FX_DAILY_STORAGE_KEY = 'grok-lab.fx-daily.usd-chf.v1'

type Store = { version: 1; byDate: Record<string, number> }

function readStore(): Store {
  if (typeof localStorage === 'undefined') return { version: 1, byDate: {} }
  try {
    const raw = localStorage.getItem(FX_DAILY_STORAGE_KEY)
    if (!raw) return { version: 1, byDate: {} }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { version: 1, byDate: {} }
    const byDateRaw = (parsed as { byDate?: unknown }).byDate
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
    return { version: 1, byDate }
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
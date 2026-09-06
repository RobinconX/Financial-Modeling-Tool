import type { CachedPriceHistory } from './priceHistory'

export const PRICE_HISTORY_KEY = 'grok-lab.priceHistory.v2'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeCached(raw: unknown): CachedPriceHistory | null {
  if (!isRecord(raw)) return null
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.toUpperCase() : ''
  if (!symbol) return null
  const fetchedAt = typeof raw.fetchedAt === 'string' ? raw.fetchedAt : ''
  const currency = typeof raw.currency === 'string' ? raw.currency : 'USD'
  if (!Array.isArray(raw.points)) return null
  const points = raw.points
    .map((p) => {
      if (!isRecord(p)) return null
      const date = typeof p.date === 'string' ? p.date : ''
      const close = Number(p.close)
      if (!date || !Number.isFinite(close) || !(close > 0)) return null
      return { date, close }
    })
    .filter((p): p is { date: string; close: number } => p != null)
  return { symbol, currency, fetchedAt, points }
}

type Store = { version: 1; bySymbol: Record<string, CachedPriceHistory> }

function readStore(): Store {
  try {
    const raw = localStorage.getItem(PRICE_HISTORY_KEY)
    if (!raw) return { version: 1, bySymbol: {} }
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.bySymbol)) return { version: 1, bySymbol: {} }
    const bySymbol: Record<string, CachedPriceHistory> = {}
    for (const [k, v] of Object.entries(parsed.bySymbol)) {
      const n = normalizeCached(v)
      if (n) bySymbol[k.toUpperCase()] = n
    }
    return { version: 1, bySymbol }
  } catch {
    return { version: 1, bySymbol: {} }
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(store))
  } catch {
    /* quota — skip cache */
  }
}

export function loadCachedPriceHistory(symbol: string): CachedPriceHistory | null {
  const key = symbol.trim().toUpperCase()
  if (!key) return null
  return readStore().bySymbol[key] ?? null
}

export function saveCachedPriceHistory(entry: CachedPriceHistory): void {
  const key = entry.symbol.trim().toUpperCase()
  if (!key) return
  const store = readStore()
  store.bySymbol[key] = { ...entry, symbol: key }
  writeStore(store)
}

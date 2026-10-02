/** Per projected year, saved CAGR % cutoffs for the comparables table. */
export const CAGR_THRESHOLDS_KEY = 'grok-lab-comparables-cagr-thresholds'

export type CagrThresholdDraft = {
  /** Percent points as typed, e.g. "15" means 15%. Empty = off. */
  buy: string
  /** Percent points as typed. Empty = off. */
  low: string
}

export type CagrHint = 'buy' | 'low'

export function parseThresholdPct(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return n
}

export function parseCagrThresholds(raw: unknown): Record<string, CagrThresholdDraft> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, CagrThresholdDraft> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const year = Number(key)
    if (!Number.isInteger(year) || year < 1900 || year > 3000) continue
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const buy = typeof v.buy === 'string' ? v.buy : ''
    const low = typeof v.low === 'string' ? v.low : ''
    if (!buy.trim() && !low.trim()) continue
    out[String(year)] = { buy, low }
  }
  return out
}

export function withYearThreshold(
  map: Record<string, CagrThresholdDraft>,
  year: number,
  patch: Partial<CagrThresholdDraft>,
): Record<string, CagrThresholdDraft> {
  const cur = map[String(year)] ?? { buy: '', low: '' }
  const nextYear = { ...cur, ...patch }
  const next = { ...map }
  if (!nextYear.buy.trim() && !nextYear.low.trim()) delete next[String(year)]
  else next[String(year)] = nextYear
  return next
}

/** Above buy → a buy-now hint. Below the sell cutoff → a sell-now hint. Equal to a cutoff does not match. */
export function cagrThresholdHints(
  cagr: number | null | undefined,
  raw: CagrThresholdDraft | undefined,
): CagrHint[] {
  if (cagr == null || !Number.isFinite(cagr) || !raw) return []
  const bps = Math.round(cagr * 10000)
  const hints: CagrHint[] = []
  const buy = parseThresholdPct(raw.buy)
  const low = parseThresholdPct(raw.low)
  if (buy != null && bps > Math.round(buy * 100)) hints.push('buy')
  if (low != null && bps < Math.round(low * 100)) hints.push('low')
  return hints
}

export function loadCagrThresholds(): Record<string, CagrThresholdDraft> {
  try {
    const raw = localStorage.getItem(CAGR_THRESHOLDS_KEY)
    if (!raw) return {}
    return parseCagrThresholds(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

export function saveCagrThresholds(map: Record<string, CagrThresholdDraft>): void {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(CAGR_THRESHOLDS_KEY)
    else localStorage.setItem(CAGR_THRESHOLDS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

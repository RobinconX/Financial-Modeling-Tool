import type { ChartAnnotation } from '../types'

export function newChartAnnotation(year: number, label: string): ChartAnnotation {
  return {
    id: crypto.randomUUID(),
    year,
    month: null,
    label: label.trim(),
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function normalizeChartAnnotation(raw: unknown): ChartAnnotation | null {
  if (!isRecord(raw)) return null
  const year = Math.floor(Number(raw.year))
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (!label) return null
  let month: number | null = null
  if (raw.month != null && Number.isFinite(Number(raw.month))) {
    const m = Math.floor(Number(raw.month))
    if (m >= 1 && m <= 12) month = m
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    year,
    month,
    label: label.slice(0, 80),
  }
}

export function parseXKeyYearMonth(xKey: string): { year: number; month: number | null } | null {
  if (xKey === 'now') return null
  const ym = /^(\d{4})-(\d{2})$/.exec(xKey)
  if (ym) {
    return { year: Number(ym[1]), month: Number(ym[2]) }
  }
  const y = /^(\d{4})$/.exec(xKey)
  if (y) return { year: Number(y[1]), month: null }
  return null
}

/** Notes that belong on this chart column (year bar or YYYY-MM). */
export function annotationsForXKey(
  notes: ChartAnnotation[],
  xKey: string,
): ChartAnnotation[] {
  const parsed = parseXKeyYearMonth(xKey)
  if (!parsed) return []
  return notes.filter((n) => {
    if (n.year !== parsed.year) return false
    if (parsed.month == null) return true
    return n.month == null || n.month === parsed.month
  })
}

/**
 * Where to draw a year note on this chart.
 * Yearly: "2024". Monthly year-only: Dec if present, else last month of that year.
 */
export function annotationMarkXKey(
  note: ChartAnnotation,
  xKeys: string[],
): string | null {
  const have = new Set(xKeys)
  if (note.month != null) {
    const k = `${note.year}-${String(note.month).padStart(2, '0')}`
    return have.has(k) ? k : have.has(String(note.year)) ? String(note.year) : null
  }
  if (have.has(String(note.year))) return String(note.year)
  const dec = `${note.year}-12`
  if (have.has(dec)) return dec
  const inYear = xKeys.filter((k) => k.startsWith(`${note.year}-`)).sort()
  return inYear[inYear.length - 1] ?? null
}

/** Notes keyed by the single x-axis tick they should mark. */
export function notesByMarkKey(
  notes: ChartAnnotation[],
  xKeys: string[],
): Map<string, ChartAnnotation[]> {
  const map = new Map<string, ChartAnnotation[]>()
  for (const n of notes) {
    const k = annotationMarkXKey(n, xKeys)
    if (!k) continue
    const arr = map.get(k)
    if (arr) arr.push(n)
    else map.set(k, [n])
  }
  return map
}
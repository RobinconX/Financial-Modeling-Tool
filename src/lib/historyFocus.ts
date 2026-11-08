const FOCUS_KEY = 'grok-lab-history-focus'

export type HistoryFocusRequest = {
  seriesId: string
  periodKey?: string
}

export function writeHistoryFocus(req: HistoryFocusRequest): void {
  try {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(req))
  } catch {
    /* ignore */
  }
}

export function readHistoryFocus(): HistoryFocusRequest | null {
  try {
    const raw = localStorage.getItem(FOCUS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const seriesId = (parsed as { seriesId?: unknown }).seriesId
    if (typeof seriesId !== 'string' || !seriesId) return null
    const periodKey = (parsed as { periodKey?: unknown }).periodKey
    return {
      seriesId,
      periodKey: typeof periodKey === 'string' && periodKey ? periodKey : undefined,
    }
  } catch {
    return null
  }
}

export function clearHistoryFocus(): void {
  try {
    localStorage.removeItem(FOCUS_KEY)
  } catch {
    /* ignore */
  }
}

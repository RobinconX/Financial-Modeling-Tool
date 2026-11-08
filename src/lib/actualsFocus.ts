const FOCUS_KEY = 'grok-lab-actuals-focus'

export type ActualsFocusRequest = {
  tab: 'portfolio' | 'savings'
  savingsAccountId?: string
  periodKey?: string
}

export function writeActualsFocus(req: ActualsFocusRequest): void {
  try {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(req))
  } catch {
    /* ignore */
  }
}

export function readActualsFocus(): ActualsFocusRequest | null {
  try {
    const raw = localStorage.getItem(FOCUS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const tab = (parsed as { tab?: unknown }).tab
    if (tab !== 'portfolio' && tab !== 'savings') return null
    const savingsAccountId = (parsed as { savingsAccountId?: unknown }).savingsAccountId
    const periodKey = (parsed as { periodKey?: unknown }).periodKey
    if (tab === 'savings') {
      if (typeof savingsAccountId !== 'string' || !savingsAccountId) return null
    }
    return {
      tab,
      savingsAccountId:
        typeof savingsAccountId === 'string' && savingsAccountId ? savingsAccountId : undefined,
      periodKey: typeof periodKey === 'string' && periodKey ? periodKey : undefined,
    }
  } catch {
    return null
  }
}

export function clearActualsFocus(): void {
  try {
    localStorage.removeItem(FOCUS_KEY)
  } catch {
    /* ignore */
  }
}

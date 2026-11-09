/** User-visible text when quote refresh has never succeeded. */
export const NO_QUOTE_REFRESH_YET = 'No successful refresh yet'

export function quoteRefreshErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  return 'Quote refresh failed'
}

/**
 * Short label for the last successful background quote refresh (local time).
 */
export function formatLastQuoteRefreshAt(
  lastSuccessAt: number | null,
  nowMs: number = Date.now(),
): string {
  if (lastSuccessAt == null || !Number.isFinite(lastSuccessAt)) {
    return NO_QUOTE_REFRESH_YET
  }
  const ageMs = Math.max(0, nowMs - lastSuccessAt)
  if (ageMs < 60_000) return 'Just now'
  if (ageMs < 60 * 60_000) {
    const min = Math.floor(ageMs / 60_000)
    return min === 1 ? '1 minute ago' : `${min} minutes ago`
  }
  if (ageMs < 24 * 60 * 60_000) {
    const hr = Math.floor(ageMs / (60 * 60_000))
    return hr === 1 ? '1 hour ago' : `${hr} hours ago`
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(lastSuccessAt)
  } catch {
    return new Date(lastSuccessAt).toLocaleString()
  }
}

/** True when every requested symbol came back empty (network/API down or all invalid). */
export function quoteRefreshLooksFailed(
  requestedCount: number,
  returnedCount: number,
): boolean {
  return requestedCount > 0 && returnedCount === 0
}

export function shouldShowQuoteRefreshFailure(
  failureMessage: string | null,
  dismissed: boolean,
  loading: boolean,
): boolean {
  return Boolean(failureMessage) && !dismissed && !loading
}

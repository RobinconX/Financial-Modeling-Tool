import {
  formatLastQuoteRefreshAt,
  shouldShowQuoteRefreshFailure,
} from '../../lib/quoteRefreshHint'

type Props = {
  loading: boolean
  count: number
  failureMessage?: string | null
  lastSuccessAt?: number | null
  failureDismissed?: boolean
  onDismissFailure?: () => void
}

/**
 * Fixed hint while background multi-ticker quote refresh runs or when it fails.
 */
export function QuoteLoadingHint({
  loading,
  count,
  failureMessage = null,
  lastSuccessAt = null,
  failureDismissed = false,
  onDismissFailure,
}: Props) {
  const showFailure = shouldShowQuoteRefreshFailure(
    failureMessage,
    failureDismissed,
    loading,
  )
  const showLoading = loading && count > 0

  if (!showLoading && !showFailure) return null

  if (showFailure && failureMessage) {
    return (
      <div
        className="fixed bottom-4 left-4 z-[100] max-w-sm"
        role="status"
        aria-live="polite"
      >
        <div className="rounded-lg border border-amber-500/35 bg-[#121820]/95 px-3 py-2 text-xs text-amber-100/95 shadow-lg backdrop-blur-sm">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-amber-50/95">Couldn&apos;t refresh prices</p>
              <p className="mt-0.5 text-[11px] leading-snug text-amber-100/80">
                {failureMessage}
              </p>
              <p className="mt-1 text-[10px] text-white/45">
                Last refreshed · {formatLastQuoteRefreshAt(lastSuccessAt)}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
              aria-label="Dismiss quote refresh warning"
              onClick={() => onDismissFailure?.()}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-[100] max-w-xs"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-lg border border-white/15 bg-[#121820]/95 px-3 py-2 text-xs text-white/80 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-2 font-medium">
          <span
            className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400"
            aria-hidden
          />
          Updating quotes
        </div>
        <div className="mt-0.5 text-[11px] text-white/50">
          {count === 1 ? '1 ticker' : `${count} tickers`} · live prices
        </div>
      </div>
    </div>
  )
}

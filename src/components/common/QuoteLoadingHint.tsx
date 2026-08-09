type Props = {
  loading: boolean
  count: number
}

/**
 * Fixed toast while background multi-ticker quote refresh is in flight.
 */
export function QuoteLoadingHint({ loading, count }: Props) {
  if (!loading || count <= 0) return null

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

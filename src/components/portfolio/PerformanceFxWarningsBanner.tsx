import { useState } from 'react'
import { performanceFxWarningSummary } from '../../lib/performanceFxWarnings'

type Props = {
  warnings: string[]
}

export function PerformanceFxWarningsBanner({ warnings }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (warnings.length === 0) return null

  const summary = performanceFxWarningSummary(warnings)

  return (
    <div
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90"
      data-testid="performance-fx-warnings-banner"
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="mt-0.5 shrink-0 text-amber-200/90" aria-hidden>
          ⚠
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-amber-200/95">FX on trade cash flows</span>
          <span className="mt-0.5 block text-amber-100/85">{summary}</span>
          {!expanded ? (
            <span className="mt-1 block text-[10px] text-amber-200/70">
              Tap for details — marked P/L still uses live spot.
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 text-[10px] text-amber-200/70 transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        >
          ▸
        </span>
      </button>
      {expanded ? (
        <ul className="mt-2 list-disc space-y-0.5 border-t border-amber-500/20 pt-2 pl-6 text-amber-100/80">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function PerformanceFxMetricBadge() {
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded border border-amber-500/35 bg-amber-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-200/90"
      title="Uses trade-date FX; see banner above for fallbacks"
    >
      FX
    </span>
  )
}
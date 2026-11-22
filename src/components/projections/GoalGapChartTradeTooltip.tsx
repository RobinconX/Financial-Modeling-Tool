import { formatPercent, formatPrice } from '../../lib/format'
import {
  comparablesTradeMetricLabel,
  tradesForComparablesTooltip,
  type ComparablesTradeMarker,
} from '../../lib/comparablesTradeChart'
import type { GoalPathMetric } from '../../lib/goalGap'
import { TARGET_CAGR_SERIES_KEY } from '../../lib/goalGap'

type PayloadItem = {
  dataKey?: string | number
  name?: string
  value?: number | string | null
  color?: string
}

export function GoalGapChartTradeTooltip({
  active,
  label,
  payload,
  metric,
  targetSeriesName,
  valueLabel,
  tradeMarkers,
  showTrades,
}: {
  active?: boolean
  label?: string | number
  payload?: PayloadItem[]
  metric: GoalPathMetric
  targetSeriesName: string
  valueLabel: string
  tradeMarkers: ComparablesTradeMarker[]
  showTrades: boolean
}) {
  if (!active || !payload?.length) return null
  const dateLabel = label != null ? String(label) : ''
  const trades =
    showTrades && tradeMarkers.length > 0
      ? tradesForComparablesTooltip(label, tradeMarkers)
      : []
  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
      <div className="mb-1.5 font-medium text-white/70">{dateLabel}</div>
      <div className="space-y-1">
        {payload.map((p) => {
          const n =
            typeof p.value === 'number' ? p.value : Number(p.value ?? NaN)
          if (!Number.isFinite(n)) return null
          const name = String(p.name ?? p.dataKey ?? '')
          const isTarget =
            p.dataKey === TARGET_CAGR_SERIES_KEY || name === targetSeriesName
          const seriesLabel = isTarget
            ? targetSeriesName
            : `${name} · ${valueLabel}`
          return (
            <div key={String(p.dataKey)} className="flex justify-between gap-4">
              <span className="text-white/60">{seriesLabel}</span>
              <span className="tabular-nums text-white/85">
                {formatPercent(n)}
              </span>
            </div>
          )
        })}
      </div>
      {trades.length > 0 ? (
        <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Trades ({comparablesTradeMetricLabel(metric)})
          </p>
          {trades.map((m) => {
            const sideTone = m.side === 'buy' ? '#34d399' : '#f87171'
            const px = formatPrice(m.price, m.currency ?? 'USD')
            return (
              <div key={m.id} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white/85">{m.symbol}</span>
                  <span style={{ color: sideTone }}>
                    {m.side === 'buy' ? 'Buy' : 'Sell'}
                  </span>
                </div>
                <div className="tabular-nums text-white/75">
                  {m.tradeDate !== m.chartDate
                    ? `${m.tradeDate} (on ${m.chartDate}) · `
                    : null}
                  {m.shares} @ {px}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../lib/format'
import type { ReturnProgressionPoint } from '../../lib/portfolioPerformanceStats'
import type { PortfolioTrade } from '../../types'

export type ReturnChartMode = 'pct' | 'usd'

export type ReturnChartTradeMarker = {
  id: string
  tradeDate: string
  side: PortfolioTrade['side']
  symbol: string
  shares: number
  price: number
  y: number
}

type Props = {
  points: ReturnProgressionPoint[]
  trades?: PortfolioTrade[]
  mode: ReturnChartMode
  missingNote: string | null
  onModeChange: (mode: ReturnChartMode) => void
}

/** Y position on the return chart for each trade (on trade date), in current chart units. */
export function buildReturnChartTradeMarkers(
  trades: PortfolioTrade[],
  points: ReturnProgressionPoint[],
  mode: ReturnChartMode,
): ReturnChartTradeMarker[] {
  const byDate = new Map(points.map((p) => [p.date, p]))
  const out: ReturnChartTradeMarker[] = []
  for (const t of trades) {
    const pt = byDate.get(t.tradeDate)
    if (!pt) continue
    const y =
      mode === 'pct'
        ? pt.returnPct != null
          ? pt.returnPct * 100
          : null
        : pt.totalPnl
    if (y == null || !Number.isFinite(y)) continue
    out.push({
      id: t.id,
      tradeDate: t.tradeDate,
      side: t.side,
      symbol: t.symbol,
      shares: t.shares,
      price: t.price,
      y,
    })
  }
  out.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  return out
}

type ChartRow = {
  date: string
  value: number | null
  valuePos: number | null
  valueNeg: number | null
}

function formatTick(date: string): string {
  const [y, m] = date.split('-')
  if (!m) return date
  return `${y}-${m}`
}

function returnProgressionSeriesLabel(mode: ReturnChartMode): string {
  return mode === 'pct' ? 'Return on buys' : 'Total P&L'
}

function formatReturnProgressionValue(
  value: number,
  mode: ReturnChartMode,
): string {
  return mode === 'pct' ? `${value.toFixed(2)}%` : formatMoney(value, 'USD')
}

type ReturnProgressionTooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: ChartRow }>
  label?: string | number
  mode: ReturnChartMode
}

/** One metric row; payload comes from the invisible `value` line (signed lines are tooltipType=none). */
export function ReturnProgressionTooltip({
  active,
  payload,
  label,
  mode,
}: ReturnProgressionTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as ChartRow | undefined
  const seriesLabel = returnProgressionSeriesLabel(mode)
  const dateLabel = label != null ? String(label) : ''
  if (row?.value == null || !Number.isFinite(row.value)) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
        <div className="mb-1.5 font-medium text-white/70">{dateLabel}</div>
        <div className="tabular-nums text-white/50">—</div>
      </div>
    )
  }
  const tone =
    row.value > 0 ? '#34d399' : row.value < 0 ? '#f87171' : 'rgba(255,255,255,0.45)'
  const formatted = formatReturnProgressionValue(row.value, mode)
  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
      <div className="mb-1.5 font-medium text-white/70">{dateLabel}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-white/60">
          <span
            className="inline-block h-1.5 w-1.5 rounded-sm"
            style={{ background: tone }}
          />
          {seriesLabel}
        </span>
        <span className="tabular-nums text-white/85">{formatted}</span>
      </div>
    </div>
  )
}

function isoDateFromUtcMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function zeroCrossDate(dateA: string, vA: number, dateB: string, vB: number): string {
  const tA = Date.parse(`${dateA}T12:00:00Z`)
  const tB = Date.parse(`${dateB}T12:00:00Z`)
  if (!Number.isFinite(tA) || !Number.isFinite(tB) || vA === vB) return dateB
  const frac = vA / (vA - vB)
  const tCross = tA + frac * (tB - tA)
  return isoDateFromUtcMs(tCross)
}

/** One value per day; split stroke masks for green/red (null when not on that side). */
export function buildSignedReturnChartRows(
  points: ReturnProgressionPoint[],
  mode: ReturnChartMode,
): ChartRow[] {
  const base: { date: string; value: number | null }[] = points.map((p) => {
    const value =
      mode === 'pct'
        ? p.returnPct != null
          ? p.returnPct * 100
          : null
        : p.totalPnl
    return { date: p.date, value }
  })

  const rows: ChartRow[] = []
  for (let i = 0; i < base.length; i++) {
    const cur = base[i]!
    const prev = i > 0 ? base[i - 1]! : null
    if (
      prev?.value != null &&
      cur.value != null &&
      ((prev.value > 0 && cur.value < 0) || (prev.value < 0 && cur.value > 0))
    ) {
      const crossDate = zeroCrossDate(prev.date, prev.value, cur.date, cur.value)
      // Two rows at the cross: end one series at 0, start the other at 0 — never both masks on one row.
      if (prev.value > 0) {
        rows.push({
          date: crossDate,
          value: 0,
          valuePos: 0,
          valueNeg: null,
        })
        rows.push({
          date: crossDate,
          value: 0,
          valuePos: null,
          valueNeg: 0,
        })
      } else {
        rows.push({
          date: crossDate,
          value: 0,
          valuePos: null,
          valueNeg: 0,
        })
        rows.push({
          date: crossDate,
          value: 0,
          valuePos: 0,
          valueNeg: null,
        })
      }
    }

    const v = cur.value
    rows.push({
      date: cur.date,
      value: v,
      valuePos: v == null ? null : v >= 0 ? v : null,
      valueNeg: v == null ? null : v < 0 ? v : null,
    })
  }

  rows.sort((a, b) => a.date.localeCompare(b.date))
  return rows
}

export function PortfolioReturnChart({
  points,
  trades = [],
  mode,
  missingNote,
  onModeChange,
}: Props) {
  const [showTrades, setShowTrades] = useState(false)
  const data = useMemo(
    () => buildSignedReturnChartRows(points, mode),
    [points, mode],
  )
  const tradeMarkers = useMemo(
    () => buildReturnChartTradeMarkers(trades, points, mode),
    [trades, points, mode],
  )

  const hasValue = data.some((d) => d.value != null)
  if (!hasValue) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        Add trades to see return progression.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
          Return progression
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {tradeMarkers.length > 0 ? (
            <button
              type="button"
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                showTrades
                  ? 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                  : 'border-white/10 text-white/45 hover:text-white/75'
              }`}
              aria-pressed={showTrades}
              onClick={() => setShowTrades((v) => !v)}
            >
              Trades
            </button>
          ) : null}
          <div
            className="inline-flex gap-0.5 rounded-md border border-white/10 p-0.5"
            role="group"
            aria-label="Return chart units"
          >
            {(
              [
                { id: 'pct' as const, label: '%' },
                { id: 'usd' as const, label: '$' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`rounded px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                  mode === opt.id
                    ? 'bg-white/15 text-white'
                    : 'text-white/45 hover:text-white/75'
                }`}
                onClick={() => onModeChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {missingNote ? (
        <p className="text-[11px] text-amber-200/75">{missingNote}</p>
      ) : null}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatTick}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              minTickGap={48}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              width={mode === 'pct' ? 44 : 52}
              tickFormatter={(v: number) =>
                mode === 'pct' ? `${v.toFixed(0)}%` : formatMoney(v, 'USD')
              }
            />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
              content={(props) => (
                <ReturnProgressionTooltip {...props} mode={mode} />
              )}
            />
            <Line
              type="monotone"
              dataKey="valuePos"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="valueNeg"
              stroke="#f87171"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={returnProgressionSeriesLabel(mode)}
              stroke="transparent"
              strokeWidth={0}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'transparent' }}
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
            />
            {showTrades
              ? tradeMarkers.map((m) => (
                  <ReferenceDot
                    key={m.id}
                    x={m.tradeDate}
                    y={m.y}
                    r={4}
                    fill={m.side === 'buy' ? '#34d399' : '#f87171'}
                    stroke="#0b0f14"
                    strokeWidth={1.25}
                    ifOverflow="discard"
                  />
                ))
              : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
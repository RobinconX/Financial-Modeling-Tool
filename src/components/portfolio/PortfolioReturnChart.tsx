import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, formatPrice } from '../../lib/format'
import { toDisplay } from '../../lib/fx'
import type { ReturnProgressionPoint } from '../../lib/portfolioPerformanceStats'
import type { DisplayCurrency, PortfolioTrade } from '../../types'

export type ReturnChartMode = 'pct' | 'usd'

export type ReturnChartTradeMarker = {
  id: string
  tradeDate: string
  time: number
  side: PortfolioTrade['side']
  symbol: string
  shares: number
  price: number
  fees: number
  y: number
}

type Props = {
  points: ReturnProgressionPoint[]
  trades?: PortfolioTrade[]
  mode: ReturnChartMode
  missingNote: string | null
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
  onModeChange: (mode: ReturnChartMode) => void
}

function pnlInDisplayUnits(
  usd: number | null | undefined,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): number | null {
  if (usd == null || !Number.isFinite(usd)) return null
  return toDisplay(usd, displayCurrency, usdToChf)
}

function progressionYOnDate(
  date: string,
  points: ReturnProgressionPoint[],
  mode: ReturnChartMode,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): number | null {
  const yFromPoint = (p: ReturnProgressionPoint): number | null => {
    if (mode === 'pct') {
      return p.returnPct != null ? p.returnPct * 100 : null
    }
    return pnlInDisplayUnits(p.totalPnl, displayCurrency, usdToChf)
  }
  const byDate = new Map(points.map((p) => [p.date, p]))
  const onDay = yFromPoint(byDate.get(date) ?? { date, totalPnl: null, returnPct: null })
  if (onDay != null && Number.isFinite(onDay)) return onDay
  const prior = [...points]
    .filter((p) => p.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date))
  for (let i = prior.length - 1; i >= 0; i--) {
    const y = yFromPoint(prior[i]!)
    if (y != null && Number.isFinite(y)) return y
  }
  return null
}

/** Y position on the return chart for each trade (on trade date), in current chart units. */
export function buildReturnChartTradeMarkers(
  trades: PortfolioTrade[],
  points: ReturnProgressionPoint[],
  mode: ReturnChartMode,
  displayCurrency: DisplayCurrency = 'USD',
  usdToChf: number | null = null,
): ReturnChartTradeMarker[] {
  const out: ReturnChartTradeMarker[] = []
  for (const t of trades) {
    const y = progressionYOnDate(
      t.tradeDate,
      points,
      mode,
      displayCurrency,
      usdToChf,
    )
    if (y == null || !Number.isFinite(y)) continue
    out.push({
      id: t.id,
      tradeDate: t.tradeDate,
      time: chartTimeForTradeDate(t.tradeDate),
      side: t.side,
      symbol: t.symbol,
      shares: t.shares,
      price: t.price,
      fees: t.fees ?? 0,
      y,
    })
  }
  out.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  return out
}

export function chartTimeForTradeDate(date: string): number {
  return Date.parse(`${date}T12:00:00Z`)
}

type ChartRow = {
  date: string
  time: number
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
  displayCurrency: DisplayCurrency,
): string {
  return mode === 'pct' ? `${value.toFixed(2)}%` : formatMoney(value, displayCurrency)
}

type TooltipPayloadItem = {
  dataKey?: string | number
  payload?: ChartRow | ReturnChartTradeMarker
}

type ReturnProgressionTooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<TooltipPayloadItem>
  label?: string | number
  mode: ReturnChartMode
  displayCurrency: DisplayCurrency
  usdToChf?: number | null
  /** When hovering a trade dot, line series may be absent — supply row from chart data. */
  rowOverride?: ChartRow
  trades?: ReturnChartTradeMarker[]
}

/** Line tooltip row only — trades come from date filter / dot hover, not Recharts payload. */
export function resolveReturnChartTooltipState(
  payload: ReadonlyArray<TooltipPayloadItem> | undefined,
  chartData: ChartRow[],
  pinnedTradeDate?: string | null,
): { row: ChartRow | undefined } {
  let row = payload?.find((p) => p.dataKey === 'value')?.payload as
    | ChartRow
    | undefined
  if (!row && pinnedTradeDate) {
    row = chartData.find((d) => d.date === pinnedTradeDate)
  }
  return { row }
}

export function tradesForReturnTooltip(
  row: ChartRow | undefined,
  label: string | number | undefined,
  tradeMarkers: ReturnChartTradeMarker[],
  pinnedTrades: ReturnChartTradeMarker[] | null,
): ReturnChartTradeMarker[] {
  if (pinnedTrades != null && pinnedTrades.length > 0) return pinnedTrades
  const day =
    row?.date ??
    (label != null && typeof label === 'number' && Number.isFinite(label)
      ? isoDateFromUtcMs(label)
      : null)
  if (!day) return []
  return tradeMarkers.filter((t) => t.tradeDate === day)
}

function TradeTooltipRows({
  trades,
  displayCurrency,
  usdToChf,
}: {
  trades: ReturnChartTradeMarker[]
  displayCurrency: DisplayCurrency
  usdToChf: number | null
}) {
  if (trades.length === 0) return null
  return (
    <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
        Trades
      </p>
      {trades.map((m) => {
        const sideTone = m.side === 'buy' ? '#34d399' : '#f87171'
        const px = formatPrice(
          toDisplay(m.price, displayCurrency, usdToChf),
          displayCurrency,
        )
        return (
          <div key={m.id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-white/85">{m.symbol}</span>
              <span style={{ color: sideTone }}>
                {m.side === 'buy' ? 'Buy' : 'Sell'}
              </span>
            </div>
            <div className="tabular-nums text-white/75">
              {m.shares} @ {px}
              {m.fees > 0
                ? ` · fees ${formatMoney(toDisplay(m.fees, displayCurrency, usdToChf), displayCurrency)}`
                : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** One metric row; payload comes from the invisible `value` line (signed lines are tooltipType=none). */
export function ReturnProgressionTooltip({
  active,
  payload,
  label,
  mode,
  displayCurrency,
  usdToChf = null,
  rowOverride,
  trades = [],
}: ReturnProgressionTooltipProps) {
  if (!active) return null
  const row =
    rowOverride ??
    ((payload?.find((p) => p.dataKey === 'value')?.payload ??
      payload?.[0]?.payload) as ChartRow | undefined)
  const seriesLabel = returnProgressionSeriesLabel(mode)
  const dateLabel =
    row?.date ??
    (label != null
      ? typeof label === 'number' && Number.isFinite(label)
        ? formatTick(isoDateFromUtcMs(label))
        : String(label)
      : trades[0]?.tradeDate ?? '')
  const body =
    row?.value == null || !Number.isFinite(row.value) ? (
      <div className="tabular-nums text-white/50">—</div>
    ) : (
      (() => {
        const tone =
          row.value > 0 ? '#34d399' : row.value < 0 ? '#f87171' : 'rgba(255,255,255,0.45)'
        const formatted = formatReturnProgressionValue(
          row.value,
          mode,
          displayCurrency,
        )
        return (
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
        )
      })()
    )
  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
      <div className="mb-1.5 font-medium text-white/70">{dateLabel}</div>
      {body}
      <TradeTooltipRows
        trades={trades}
        displayCurrency={displayCurrency}
        usdToChf={usdToChf}
      />
    </div>
  )
}

type ReturnChartTooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<TooltipPayloadItem>
  label?: string | number
  mode: ReturnChartMode
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  chartData: ChartRow[]
  tradeMarkers: ReturnChartTradeMarker[]
  pinnedTrades: ReturnChartTradeMarker[] | null
}

function ReturnChartTooltip({
  active,
  payload,
  label,
  mode,
  displayCurrency,
  usdToChf,
  chartData,
  tradeMarkers,
  pinnedTrades,
}: ReturnChartTooltipProps) {
  if (!active || !payload?.length) return null
  const pinDate = pinnedTrades?.[0]?.tradeDate ?? null
  const { row } = resolveReturnChartTooltipState(payload, chartData, pinDate)
  const trades = tradesForReturnTooltip(
    row,
    label,
    tradeMarkers,
    pinnedTrades,
  )
  return (
    <ReturnProgressionTooltip
      active={active}
      payload={payload}
      label={label}
      mode={mode}
      displayCurrency={displayCurrency}
      usdToChf={usdToChf}
      rowOverride={row}
      trades={trades}
    />
  )
}

function isoDateFromUtcMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function zeroCrossTime(
  dateA: string,
  vA: number,
  dateB: string,
  vB: number,
): number {
  const tA = Date.parse(`${dateA}T12:00:00Z`)
  const tB = Date.parse(`${dateB}T12:00:00Z`)
  if (!Number.isFinite(tA) || !Number.isFinite(tB) || vA === vB) {
    return chartTimeForTradeDate(dateB)
  }
  const frac = vA / (vA - vB)
  return tA + frac * (tB - tA)
}

function pushChartRow(
  rows: ChartRow[],
  date: string,
  time: number,
  value: number | null,
  valuePos: number | null,
  valueNeg: number | null,
): void {
  rows.push({ date, time, value, valuePos, valueNeg })
}

/** One value per day; split stroke masks for green/red (null when not on that side). */
export function buildSignedReturnChartRows(
  points: ReturnProgressionPoint[],
  mode: ReturnChartMode,
  displayCurrency: DisplayCurrency = 'USD',
  usdToChf: number | null = null,
): ChartRow[] {
  const base: { date: string; value: number | null }[] = points.map((p) => {
    const value =
      mode === 'pct'
        ? p.returnPct != null
          ? p.returnPct * 100
          : null
        : pnlInDisplayUnits(p.totalPnl, displayCurrency, usdToChf)
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
      const crossTime = zeroCrossTime(prev.date, prev.value, cur.date, cur.value)
      const crossDate = isoDateFromUtcMs(crossTime)
      // Two rows at the cross: end one series at 0, start the other at 0 — never both masks on one row.
      if (prev.value > 0) {
        pushChartRow(rows, crossDate, crossTime, 0, 0, null)
        pushChartRow(rows, crossDate, crossTime, 0, null, 0)
      } else {
        pushChartRow(rows, crossDate, crossTime, 0, null, 0)
        pushChartRow(rows, crossDate, crossTime, 0, 0, null)
      }
    }

    const v = cur.value
    const t = chartTimeForTradeDate(cur.date)
    pushChartRow(
      rows,
      cur.date,
      t,
      v,
      v == null ? null : v >= 0 ? v : null,
      v == null ? null : v < 0 ? v : null,
    )
  }

  rows.sort((a, b) => a.time - b.time)
  return rows
}

function renderTradeDot(
  tradeMarkers: ReturnChartTradeMarker[],
  onPinTrades: (trades: ReturnChartTradeMarker[] | null) => void,
) {
  return function TradeDot(props: {
    cx?: number
    cy?: number
    payload?: ReturnChartTradeMarker
  }) {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return null
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={payload.side === 'buy' ? '#34d399' : '#f87171'}
        stroke="#0b0f14"
        strokeWidth={1.5}
        onMouseEnter={() => {
          onPinTrades(
            tradeMarkers.filter((t) => t.tradeDate === payload.tradeDate),
          )
        }}
        onMouseLeave={() => onPinTrades(null)}
      />
    )
  }
}

export function PortfolioReturnChart({
  points,
  trades = [],
  mode,
  missingNote,
  displayCurrency = 'USD',
  usdToChf = null,
  onModeChange,
}: Props) {
  const [showTrades, setShowTrades] = useState(false)
  const [pinnedTrades, setPinnedTrades] = useState<ReturnChartTradeMarker[] | null>(
    null,
  )
  const moneyModeLabel = displayCurrency === 'CHF' ? 'CHF' : '$'
  const data = useMemo(
    () => buildSignedReturnChartRows(points, mode, displayCurrency, usdToChf),
    [points, mode, displayCurrency, usdToChf],
  )
  const tradeMarkers = useMemo(
    () =>
      buildReturnChartTradeMarkers(
        trades,
        points,
        mode,
        displayCurrency,
        usdToChf,
      ),
    [trades, points, mode, displayCurrency, usdToChf],
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
                { id: 'usd' as const, label: moneyModeLabel },
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
      <div
        className="h-48 w-full"
        onMouseLeave={() => setPinnedTrades(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => formatTick(isoDateFromUtcMs(t))}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              minTickGap={48}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              width={mode === 'pct' ? 44 : 52}
              tickFormatter={(v: number) =>
                mode === 'pct' ? `${v.toFixed(0)}%` : formatMoney(v, displayCurrency)
              }
            />
            <Tooltip
              shared={false}
              cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
              content={(props) => (
                <ReturnChartTooltip
                  active={props.active}
                  label={props.label}
                  payload={props.payload as unknown as TooltipPayloadItem[] | undefined}
                  mode={mode}
                  displayCurrency={displayCurrency}
                  usdToChf={usdToChf}
                  chartData={data}
                  tradeMarkers={tradeMarkers}
                  pinnedTrades={pinnedTrades}
                />
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
            {showTrades && tradeMarkers.length > 0 ? (
              <Scatter
                data={tradeMarkers}
                dataKey="y"
                name="Trade"
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
                shape={renderTradeDot(tradeMarkers, setPinnedTrades)}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
import { useMemo, useState } from 'react'
import { useChartDateIndexZoomPan } from '../../hooks/useChartDateIndexZoomPan'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, formatPrice } from '../../lib/format'
import { amountToDisplay } from '../../lib/fx'
import type { ReturnProgressionPoint } from '../../lib/portfolioPerformanceStats'
import { progressionYOnDate } from '../../lib/returnChartMarkerY'
import type {
  ReturnChartOptionMarker,
  ReturnChartTradeMarker,
} from '../../lib/returnChartMarkers'
import {
  isOptionLifecycleEvent,
  tradeMarkerActionColor,
  tradeMarkerActionLabel,
  tradeMarkerContractLabel,
  tradeMarkerQuantityUnit,
} from '../../lib/tradeMarkerDisplay'
import type { DisplayCurrency, PortfolioTrade } from '../../types'

export type ReturnChartMode = 'usd' | 'twr' | 'mwr' | 'grossBuys'
export type { ReturnChartTradeMarker } from '../../lib/returnChartMarkers'

type Props = {
  points: ReturnProgressionPoint[]
  trades?: PortfolioTrade[]
  optionMarkers?: ReturnChartOptionMarker[]
  mode: ReturnChartMode
  missingNote: string | null
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
  onModeChange: (mode: ReturnChartMode) => void
}

/** Progression amounts are already in display currency from the perf pipeline. */
function progressionMoneyValue(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
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
      currency: t.currency ?? 'USD',
      feesCurrency: t.feesCurrency,
      y,
      instrument: 'equity',
    })
  }
  out.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  return out
}

export function chartTimeForTradeDate(date: string): number {
  return Date.parse(`${date}T12:00:00Z`)
}

export type ReturnChartRow = {
  date: string
  time: number
  value: number | null
  valuePos: number | null
  valueNeg: number | null
}

type ChartRow = ReturnChartRow

function formatTick(date: string): string {
  const [y, m] = date.split('-')
  if (!m) return date
  return `${y}-${m}`
}

const RETURN_CHART_RIGHT_PX = 8

function formatReturnChartTimeTick(date: string, from: string, to: string): string {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (!Number.isFinite(days) || days > 500) return date.slice(0, 4)
  if (days > 80) return date.slice(0, 7)
  return date.slice(5)
}

function returnProgressionSeriesLabel(mode: ReturnChartMode): string {
  if (mode === 'usd') return 'Total P&L'
  if (mode === 'twr') return 'TWR'
  if (mode === 'mwr') return 'Cumulative MWR'
  return 'Return on buys'
}

function formatReturnProgressionValue(
  value: number,
  mode: ReturnChartMode,
  displayCurrency: DisplayCurrency,
): string {
  return mode === 'usd' ? formatMoney(value, displayCurrency) : `${value.toFixed(2)}%`
}

export function progressionPctChartValue(
  p: ReturnProgressionPoint,
  mode: ReturnChartMode,
): number | null {
  if (mode === 'usd') return progressionMoneyValue(p.totalPnl)
  if (mode === 'twr') return p.twrPct != null ? p.twrPct * 100 : null
  if (mode === 'mwr') return p.mwrCumPct != null ? p.mwrCumPct * 100 : null
  return p.returnPct != null ? p.returnPct * 100 : null
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

export function resolveReturnChartTooltipState(
  payload: ReadonlyArray<TooltipPayloadItem> | undefined,
): { row: ChartRow | undefined } {
  const hit = payload?.find((p) => p.dataKey === 'value')?.payload
  if (hit && 'valuePos' in hit) return { row: hit as ChartRow }
  return { row: undefined }
}

/** Nearest line point for the hovered time-scale x (cursor), not trade markers. */
export function chartRowNearestToTime(
  chartData: readonly ChartRow[],
  timeMs: number,
): ChartRow | undefined {
  if (!chartData.length || !Number.isFinite(timeMs)) return undefined
  let best: ChartRow | undefined
  let bestDist = Infinity
  for (const row of chartData) {
    const d = Math.abs(row.time - timeMs)
    if (d < bestDist) {
      bestDist = d
      best = row
    } else if (d === bestDist && best) {
      if (row.value != null && best.value == null) best = row
    }
  }
  return best
}

export function resolveReturnChartTooltipRow(
  chartData: readonly ChartRow[],
  label: string | number | undefined,
  payload?: ReadonlyArray<TooltipPayloadItem>,
): ChartRow | undefined {
  if (label != null && typeof label === 'number' && Number.isFinite(label)) {
    const atTime = chartRowNearestToTime(chartData, label)
    if (atTime) return atTime
  }
  const fromPayload = resolveReturnChartTooltipState(payload).row
  if (fromPayload) return fromPayload
  return undefined
}

/** Trades section only when the hovered line point’s calendar day has ledger trades. */
export function tradesForReturnTooltip(
  row: ChartRow | undefined,
  label: string | number | undefined,
  tradeMarkers: ReturnChartTradeMarker[],
  optionMarkers: ReturnChartTradeMarker[] = [],
): ReturnChartTradeMarker[] {
  const day =
    row?.date ??
    (label != null && typeof label === 'number' && Number.isFinite(label)
      ? isoDateFromUtcMs(label)
      : null)
  if (!day) return []
  return [...tradeMarkers, ...optionMarkers].filter((t) => t.tradeDate === day)
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
        const instrument = m.instrument === 'option' ? 'option' : 'equity'
        const actionTone = tradeMarkerActionColor({
          symbol: m.symbol,
          side: m.side,
          instrument,
          event: m.event,
          occSymbol: m.occSymbol,
          label: m.label,
        })
        const px = formatPrice(
          amountToDisplay(m.price, m.currency ?? 'USD', displayCurrency, usdToChf),
          displayCurrency,
        )
        const feeCur = m.feesCurrency ?? m.currency ?? 'USD'
        const action = tradeMarkerActionLabel({
          symbol: m.symbol,
          side: m.side,
          instrument,
          event: m.event,
          occSymbol: m.occSymbol,
          label: m.label,
        })
        const title = tradeMarkerContractLabel({
          symbol: m.symbol,
          side: m.side,
          instrument,
          occSymbol: m.occSymbol,
          label: m.label,
        })
        const unit = tradeMarkerQuantityUnit({
          symbol: m.symbol,
          side: m.side,
          instrument,
        })
        return (
          <div key={m.id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-white/85">{title}</span>
              <span style={{ color: actionTone }} className="text-right">
                {action}
              </span>
            </div>
            <div className="tabular-nums text-white/75">
              {m.shares} {unit} @ {px}
              {m.fees > 0
                ? ` · fees ${formatMoney(
                    amountToDisplay(m.fees, feeCur, displayCurrency, usdToChf),
                    displayCurrency,
                  )}`
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
  chartData: readonly ChartRow[]
  tradeMarkers: ReturnChartTradeMarker[]
  optionMarkers: ReturnChartOptionMarker[]
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
  optionMarkers,
}: ReturnChartTooltipProps) {
  if (!active) return null
  const row = resolveReturnChartTooltipRow(chartData, label, payload)
  if (!row) return null
  const trades = tradesForReturnTooltip(row, label, tradeMarkers, optionMarkers)
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
  _displayCurrency: DisplayCurrency = 'USD',
  _usdToChf: number | null = null,
): ChartRow[] {
  const base: { date: string; value: number | null }[] = points.map((p) => ({
    date: p.date,
    value: progressionPctChartValue(p, mode),
  }))

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

export function PortfolioReturnChart({
  points,
  trades = [],
  optionMarkers = [],
  mode,
  missingNote,
  displayCurrency = 'USD',
  usdToChf = null,
  onModeChange,
}: Props) {
  const [showTrades, setShowTrades] = useState(false)
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
  const hasAnyMarkers = tradeMarkers.length > 0 || optionMarkers.length > 0
  const yAxisPx = mode === 'usd' ? 52 : 44
  const {
    chartRef,
    panning,
    zoomed,
    visible: visibleData,
    surfaceClass,
    resetWindow,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = useChartDateIndexZoomPan(data, { yAxisPx, rightPx: RETURN_CHART_RIGHT_PX })

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
          {hasAnyMarkers ? (
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
                { id: 'twr' as const, label: 'TWR' },
                { id: 'mwr' as const, label: 'MWR' },
                { id: 'grossBuys' as const, label: 'Buys %' },
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
        ref={chartRef}
        className={`h-48 w-full ${surfaceClass}`}
        onDoubleClick={data.length >= 2 ? resetWindow : undefined}
        onPointerDown={data.length >= 2 ? onPointerDown : undefined}
        onPointerMove={data.length >= 2 ? onPointerMove : undefined}
        onPointerUp={data.length >= 2 ? onPointerUp : undefined}
        onPointerCancel={data.length >= 2 ? onPointerCancel : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleData}
            margin={{ top: 4, right: RETURN_CHART_RIGHT_PX, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => {
                const d = isoDateFromUtcMs(t)
                const min = visibleData[0]?.date ?? d
                const max = visibleData[visibleData.length - 1]?.date ?? d
                return formatReturnChartTimeTick(d, min, max)
              }}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              minTickGap={48}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              width={mode === 'usd' ? 52 : 44}
              tickFormatter={(v: number) =>
                mode === 'usd' ? formatMoney(v, displayCurrency) : `${v.toFixed(0)}%`
              }
            />
            {panning ? null : (
              <Tooltip
                filterNull={false}
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
                    optionMarkers={optionMarkers}
                  />
                )}
              />
            )}
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
                    x={m.time}
                    y={m.y}
                    r={5}
                    fill={m.side === 'buy' ? '#34d399' : '#f87171'}
                    stroke="#0b0f14"
                    strokeWidth={1.5}
                    ifOverflow="visible"
                  />
                ))
              : null}
            {showTrades
              ? optionMarkers.map((m) => {
                  const lifecycle = isOptionLifecycleEvent('option', m.event)
                  return (
                    <ReferenceDot
                      key={m.id}
                      x={m.time}
                      y={m.y}
                      r={6}
                      fill={lifecycle ? '#fbbf24' : 'transparent'}
                      stroke={lifecycle ? '#f59e0b' : '#fbbf24'}
                      strokeWidth={2.5}
                      ifOverflow="visible"
                    />
                  )
                })
              : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {data.length >= 2 ? (
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-[10px] text-white/30">
          <span>
            {visibleData[0]?.date} → {visibleData[visibleData.length - 1]?.date}
            {zoomed ? ' · drag to pan · scroll to zoom' : ' · scroll to zoom'}
          </span>
          {zoomed ? (
            <button
              type="button"
              className="text-emerald-300/80 hover:text-emerald-200"
              onClick={resetWindow}
            >
              Reset
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { annotationsForXKey } from '../../lib/annotations'
import { RECORDED_ACTUAL_KEY } from '../../lib/history'
import { formatMoney } from '../../lib/format'
import {
  assignOverviewSeriesColors,
  buildOverviewChartRows,
  OVERVIEW_CURRENCY,
  portfolioBreakdownChfAtYear,
  sourceLabel,
  type OverviewBuildDeps,
  type OverviewChartRow,
  type PortfolioBreakdownLine,
} from '../../lib/overview'
import { runwayDrawnFromRow } from '../../lib/runway'
import type { ChartAnnotation, NetWorthGoal, OverviewSeries } from '../../types'
import { ChartGoalLines } from '../common/ChartGoals'
import { chartYearTick } from '../common/ChartNotes'
import { goalYMax } from '../../lib/goals'

const PANEL_WIDTH = 260
const PANEL_GAP = 12
const PANEL_TOP = 8
const PANEL_EDGE = 8

type Props = {
  startYear: number
  endYear: number
  series: OverviewSeries[]
  deps: OverviewBuildDeps
  fillContainer?: boolean
  /** Year-end recorded actuals (History) to overlay. */
  recordedByYear?: Map<number, number>
  showRecorded?: boolean
  annotations?: ChartAnnotation[]
  goals?: NetWorthGoal[]
  prebuiltRows?: OverviewChartRow[]
  selectedXKey?: string | null
  onSelectYear?: (xKey: string) => void
}

type HoverState = {
  year: number
  xKey: string
  label: string
  kind: 'actual' | 'projected' | 'now'
  isNow: boolean
  barX: number
  stacks: { id: string; name: string; type: OverviewSeries['type']; value: number }[]
  total: number
  recorded: number | null
  income: number | null
  draw: number | null
  fromAssets: number | null
  surplus: number | null
  drawn: { id: string; name: string; amount: number }[]
  notes: { id: string; label: string }[]
  portfolios: {
    seriesId: string
    name: string
    total: number
    lines: PortfolioBreakdownLine[]
  }[]
}

/**
 * Place tooltip beside the bar, preferring the side toward chart center.
 * Left-half bars → panel to the right; right-half bars → panel to the left.
 */
function computePanelStyle(barX: number, areaW: number, areaH: number): CSSProperties {
  const w = areaW > 0 ? areaW : 640
  const h = areaH > 0 ? areaH : 320
  const panelW = Math.min(PANEL_WIDTH, Math.max(200, w - PANEL_EDGE * 2))
  const mid = w / 2

  let left: number
  if (barX < mid) {
    // Bar on left → open toward center (right of bar)
    left = barX + PANEL_GAP
    if (left + panelW > w - PANEL_EDGE) {
      left = barX - panelW - PANEL_GAP
    }
  } else {
    // Bar on right → open toward center (left of bar)
    left = barX - panelW - PANEL_GAP
    if (left < PANEL_EDGE) {
      left = barX + PANEL_GAP
    }
  }
  left = Math.max(PANEL_EDGE, Math.min(left, w - panelW - PANEL_EDGE))

  return {
    left,
    top: PANEL_TOP,
    width: panelW,
    maxHeight: Math.max(140, h - PANEL_TOP - PANEL_EDGE),
  }
}

export function OverviewChart({
  startYear,
  endYear,
  series,
  deps,
  fillContainer = false,
  recordedByYear,
  showRecorded = false,
  annotations = [],
  goals = [],
  prebuiltRows,
  selectedXKey = null,
  onSelectYear,
}: Props) {
  const [hover, setHover] = useState<HoverState | null>(null)
  const chartAreaRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 })
  const overChartRef = useRef(false)
  const overPanelRef = useRef(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverKeyRef = useRef<string | null>(null)

  // List order (low sortOrder first = top of editor). Recharts paints first Bar at
  // the stack bottom, so reverse when rendering bars so list-top = chart-top.
  // Keep ALL series mounted in stack order — filtering by enabled remounts a Bar as the
  // last child, which Recharts treats as the top of the stack regardless of sortOrder.
  const sorted = useMemo(
    () =>
      [...series].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      ),
    [series],
  )
  const active = useMemo(() => sorted.filter((s) => s.enabled), [sorted])
  // Paint order: last in list (high sortOrder) first → bottom of stack
  const stackOrder = useMemo(() => [...sorted].reverse(), [sorted])

  const rows = useMemo(() => {
    const built =
      prebuiltRows ?? buildOverviewChartRows({ startYear, endYear, series }, deps)
    if (!showRecorded || !recordedByYear) return built
    return built.map((r) => ({
      ...r,
      [RECORDED_ACTUAL_KEY]:
        r.isNow || r.kind !== 'actual' ? null : (recordedByYear.get(r.year) ?? null),
    }))
  }, [startYear, endYear, series, deps, recordedByYear, showRecorded, prebuiltRows])

  const colorById = useMemo(() => assignOverviewSeriesColors(series), [series])

  useLayoutEffect(() => {
    const el = chartAreaRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setAreaSize({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fillContainer, rows.length])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])

  function scheduleClear() {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = setTimeout(() => {
      if (!overChartRef.current && !overPanelRef.current) {
        hoverKeyRef.current = null
        setHover(null)
      }
    }, 80)
  }

  function cancelClear() {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
  }

  function hoverFromRow(row: OverviewChartRow, barX: number): HoverState {
    const stacks: HoverState['stacks'] = []
    const portfolios: HoverState['portfolios'] = []
    let total = 0
    const nameById = new Map(active.map((s) => [s.id, s.name.trim() || sourceLabel(s.type)]))
    const drawn = runwayDrawnFromRow(row).map((d) => ({
      ...d,
      name: nameById.get(d.id) ?? d.id,
    }))

    // Top of stack first (matches visual top of bar / list top)
    for (const s of active) {
      const value = Number(row[s.id]) || 0
      if (value === 0) continue
      stacks.push({
        id: s.id,
        name: s.name,
        type: s.type,
        value,
      })
      total += value
      if (s.type === 'portfolio') {
        const lines = portfolioBreakdownChfAtYear(s, row.year, deps, {
          live: row.isNow === true,
        })
        if (lines.length > 0) {
          portfolios.push({
            seriesId: s.id,
            name: s.name,
            total: value,
            lines,
          })
        }
      }
    }

    return {
      year: row.year,
      xKey: row.xKey,
      label: row.label,
      kind: row.kind,
      isNow: row.isNow === true,
      barX,
      stacks,
      total,
      recorded:
        row.isNow || row.kind !== 'actual'
          ? null
          : recordedByYear?.get(row.year) ?? null,
      notes: row.isNow ? [] : annotationsForXKey(annotations, row.xKey),
      income: typeof row.__income === 'number' ? row.__income : null,
      draw: typeof row.__draw === 'number' ? row.__draw : null,
      fromAssets: typeof row.__fromAssets === 'number' ? row.__fromAssets : null,
      surplus: typeof row.__surplus === 'number' ? row.__surplus : null,
      drawn,
      portfolios,
    }
  }

  function rowFromPointerState(state: {
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activePayload?: any[]
  }): OverviewChartRow | undefined {
    const byLabel =
      state.activeLabel != null
        ? rows.find(
            (r) =>
              r.xKey === String(state.activeLabel) ||
              r.label === String(state.activeLabel) ||
              (!r.isNow && String(r.year) === String(state.activeLabel)),
          )
        : undefined

    const rawIdx = state.activeTooltipIndex ?? state.activeIndex
    const idx =
      typeof rawIdx === 'number'
        ? rawIdx
        : typeof rawIdx === 'string' && /^\d+$/.test(rawIdx)
          ? Number(rawIdx)
          : -1
    const byIndex = idx >= 0 ? rows[idx] : undefined

    let byPayload: OverviewChartRow | undefined
    const p0 = state.activePayload?.[0]?.payload
    if (p0 && typeof p0 === 'object' && typeof (p0 as OverviewChartRow).year === 'number') {
      byPayload = p0 as OverviewChartRow
    }

    return byLabel ?? byIndex ?? byPayload
  }

  function resolveHover(state: {
    isTooltipActive?: boolean
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    activeCoordinate?: { x?: number; y?: number }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activePayload?: any[]
  }): HoverState | null {
    if (!state?.isTooltipActive) return null
    const row = rowFromPointerState(state)
    if (!row) return null
    const barX =
      typeof state.activeCoordinate?.x === 'number' ? state.activeCoordinate.x : areaSize.w / 2
    return hoverFromRow(row, barX)
  }

  const handleChartHover = useCallback(
    (state: Parameters<typeof resolveHover>[0]) => {
      overChartRef.current = true
      cancelClear()
      const next = resolveHover(state)
      const key = next?.xKey ?? null
      if (key === hoverKeyRef.current) return
      hoverKeyRef.current = key
      setHover(next)
    },
    // resolveHover closes over latest rows/active/deps via render; we only
    // skip when the year key is unchanged so the chart is not re-rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, active, deps, annotations, recordedByYear, areaSize.w],
  )

  const handleChartClick = useCallback(
    (state: Parameters<typeof rowFromPointerState>[0]) => {
      if (!onSelectYear) return
      const row = rowFromPointerState(state)
      if (!row) return
      onSelectYear(row.xKey)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSelectYear, rows],
  )

  const yearTick = useMemo(
    () =>
      chartYearTick(annotations, rows.map((r) => r.xKey), (key) => {
        if (key === 'now') return false
        const n = Number(key)
        if (!Number.isFinite(n)) return false
        if (rows.length > 40) return n % 5 !== 0
        if (rows.length > 18) return n % 2 !== 0
        return false
      }),
    [annotations, rows],
  )

  const goalXKeys = useMemo(() => rows.map((r) => r.xKey), [rows])

  const panelStyle = hover
    ? computePanelStyle(hover.barX, areaSize.w, areaSize.h)
    : null

  if (active.length === 0) {
    return (
      <div
        className={
          fillContainer
            ? 'flex h-full min-h-[16rem] items-center justify-center text-sm text-white/40'
            : 'flex h-72 items-center justify-center text-sm text-white/40'
        }
      >
        Enable or add series to see your stacked net worth
      </div>
    )
  }

  return (
    <div
      className={
        fillContainer
          ? 'relative z-10 flex h-full min-h-0 w-full flex-col'
          : 'relative z-10 flex w-full flex-col'
      }
    >
      <div
        ref={chartAreaRef}
        className={
          fillContainer
            ? `relative min-h-0 w-full flex-1 overflow-hidden outline-none [&_svg]:outline-none ${
                onSelectYear ? 'cursor-pointer' : ''
              }`
            : `relative h-80 w-full min-h-[20rem] overflow-hidden outline-none [&_svg]:outline-none ${
                onSelectYear ? 'cursor-pointer' : ''
              }`
        }
        onMouseDown={(e) => {
          if (!onSelectYear) return
          if (panelRef.current?.contains(e.target as Node)) return
          e.preventDefault()
        }}
        onMouseEnter={() => {
          overChartRef.current = true
          cancelClear()
        }}
        onMouseLeave={() => {
          overChartRef.current = false
          scheduleClear()
        }}
      >
        <OverviewBarsPlot
          rows={rows}
          stackOrder={stackOrder}
          colorById={colorById}
          yearTick={yearTick}
          goalXKeys={goalXKeys}
          goals={goals}
          showRecorded={showRecorded}
          selectedXKey={selectedXKey}
          onHover={handleChartHover}
          onClick={onSelectYear ? handleChartClick : undefined}
        />

        {hover && panelStyle ? (
          <div
            ref={panelRef}
            className="absolute z-30 overflow-y-auto rounded-xl border border-white/10 bg-[#121820]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm outline-none"
            style={panelStyle}
            tabIndex={-1}
            onMouseEnter={() => {
              overPanelRef.current = true
              cancelClear()
            }}
            onMouseLeave={() => {
              overPanelRef.current = false
              scheduleClear()
            }}
          >
            <div className="flex items-center gap-2 font-semibold text-white">
              <span>{hover.isNow ? 'Now' : hover.label}</span>
              {hover.isNow ? (
                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300/90">
                  Live
                </span>
              ) : hover.kind === 'projected' ? (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                  Projected
                </span>
              ) : (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400/80">
                  Actual
                </span>
              )}
            </div>

            {hover.stacks.length > 0 ? (
              <div className="mt-1.5 space-y-0.5">
                {hover.stacks.map((st) => (
                  <div key={st.id} className="flex justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-white/60">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: colorById.get(st.id) ?? '#94a3b8' }}
                      />
                      <span className="truncate">
                        {st.name.trim() || sourceLabel(st.type)}
                      </span>
                      <span className="shrink-0 text-white/30">({sourceLabel(st.type)})</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-white/90">
                      {formatMoney(st.value, OVERVIEW_CURRENCY)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-white/40">No values this year</p>
            )}

            <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 font-medium">
              <span className="text-white/50">Modeled</span>
              <span className="tabular-nums text-emerald-400/90">
                {formatMoney(hover.total, OVERVIEW_CURRENCY)}
              </span>
            </div>
            {hover.recorded != null ? (
              <div className="mt-1 flex justify-between font-medium">
                <span className="text-amber-300/80">Recorded</span>
                <span className="tabular-nums text-amber-300/90">
                  {formatMoney(hover.recorded, OVERVIEW_CURRENCY)}
                </span>
              </div>
            ) : null}
            {hover.draw != null ? (
              <div className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5 text-[11px]">
                {hover.income != null ? (
                  <div className="flex justify-between gap-3 text-white/55">
                    <span>Income</span>
                    <span className="tabular-nums">{formatMoney(hover.income, OVERVIEW_CURRENCY)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3 text-white/55">
                  <span>Draw</span>
                  <span className="tabular-nums">{formatMoney(hover.draw, OVERVIEW_CURRENCY)}</span>
                </div>
                {hover.fromAssets != null && hover.fromAssets > 0 ? (
                  <div className="flex justify-between gap-3 text-white/55">
                    <span>From assets</span>
                    <span className="tabular-nums">
                      {formatMoney(hover.fromAssets, OVERVIEW_CURRENCY)}
                    </span>
                  </div>
                ) : null}
                {hover.drawn.map((d) => (
                  <div key={d.id} className="flex justify-between gap-3 pl-2 text-rose-300/80">
                    <span className="truncate">{d.name}</span>
                    <span className="shrink-0 tabular-nums">
                      −{formatMoney(d.amount, OVERVIEW_CURRENCY)}
                    </span>
                  </div>
                ))}
                {hover.surplus != null && hover.surplus > 0 ? (
                  <div className="flex justify-between gap-3 text-white/55">
                    <span>To leftover</span>
                    <span className="tabular-nums">
                      {formatMoney(hover.surplus, OVERVIEW_CURRENCY)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {hover.notes.length > 0 ? (
              <div className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5 text-amber-200/75">
                {hover.notes.map((n) => (
                  <div key={n.id}>{n.label}</div>
                ))}
              </div>
            ) : null}

            {/* Portfolio breakdown in the same floating panel, scrollable */}
            {hover.portfolios.map((p) => (
              <div
                key={p.seriesId}
                className="mt-2 border-t border-white/10 pt-2"
              >
                <div className="mb-1 flex items-center justify-between gap-2 font-medium text-white/80">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ background: colorById.get(p.seriesId) ?? '#34d399' }}
                    />
                    {p.name.trim() || 'Portfolio'}
                  </span>
                  <span className="tabular-nums text-white/70">
                    {formatMoney(p.total, OVERVIEW_CURRENCY)}
                  </span>
                </div>
                <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                  {p.lines.map((line, i) => (
                    <li
                      key={`${p.seriesId}-${line.label}-${i}`}
                      className="flex justify-between gap-3 text-[11px]"
                    >
                      <span
                        className={
                          line.kind === 'cash'
                            ? 'text-white/40'
                            : 'min-w-0 truncate text-white/50'
                        }
                        title={line.label}
                      >
                        {line.label}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums ${
                          line.valueChf < 0 ? 'text-red-300/80' : 'text-white/65'
                        }`}
                      >
                        {formatMoney(line.valueChf, OVERVIEW_CURRENCY)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {active.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: colorById.get(s.id) ?? '#94a3b8' }}
            />
            {s.name.trim() || sourceLabel(s.type)}
            <span className="text-white/30">· {sourceLabel(s.type)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

type BarsPlotProps = {
  rows: OverviewChartRow[]
  stackOrder: OverviewSeries[]
  colorById: Map<string, string>
  yearTick: ReturnType<typeof chartYearTick>
  goalXKeys: string[]
  goals: NetWorthGoal[]
  showRecorded: boolean
  selectedXKey: string | null
  onHover: (state: {
    isTooltipActive?: boolean
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    activeCoordinate?: { x?: number; y?: number }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activePayload?: any[]
  }) => void
  onClick?: (state: {
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activePayload?: any[]
  }) => void
}

const OverviewBarsPlot = memo(function OverviewBarsPlot({
  rows,
  stackOrder,
  colorById,
  yearTick,
  goalXKeys,
  goals,
  showRecorded,
  selectedXKey,
  onHover,
  onClick,
}: BarsPlotProps) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <ComposedChart
        data={rows}
        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
        onMouseMove={onHover}
        onClick={onClick}
        style={onClick ? { cursor: 'pointer', outline: 'none' } : { outline: 'none' }}
      >
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="xKey"
          tick={yearTick}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          interval={0}
          height={28}
        />
        <YAxis
          tick={{ fill: 'rgba(232,238,245,0.4)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={goals.length > 0 ? [0, goalYMax(goals)] : undefined}
          tickFormatter={(v: number) => {
            if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
            if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`
            return String(v)
          }}
        />
        <Tooltip
          content={() => null}
          cursor={{ fill: 'rgba(255,255,255,0.06)' }}
          isAnimationActive={false}
        />
        {stackOrder.map((s) => (
          <Bar
            key={s.id}
            dataKey={s.id}
            name={s.name}
            stackId="overview"
            fill={colorById.get(s.id) ?? '#94a3b8'}
            isAnimationActive={false}
            legendType={s.enabled ? 'rect' : 'none'}
          >
            {s.enabled
              ? rows.map((r) => {
                  const selected = selectedXKey != null && r.xKey === selectedXKey
                  return (
                    <Cell
                      key={`${s.id}-${r.xKey}`}
                      fill={colorById.get(s.id) ?? '#94a3b8'}
                      fillOpacity={
                        selected ? 1 : r.isNow ? 1 : r.kind === 'actual' ? 0.92 : 0.4
                      }
                      stroke={
                        selected
                          ? 'rgba(255,255,255,0.8)'
                          : r.isNow
                            ? 'rgba(255,255,255,0.45)'
                            : undefined
                      }
                      strokeWidth={selected ? 2 : r.isNow ? 1.5 : 0}
                    />
                  )
                })
              : null}
          </Bar>
        ))}
        {showRecorded ? (
          <Line
            type="monotone"
            dataKey={RECORDED_ACTUAL_KEY}
            name="Recorded"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={{ r: 3, fill: '#fbbf24' }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ) : null}
        {goals.length > 0 ? <ChartGoalLines goals={goals} xKeys={goalXKeys} /> : null}
      </ComposedChart>
    </ResponsiveContainer>
  )
})

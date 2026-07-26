import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import type { OverviewSeries } from '../../types'

type Props = {
  startYear: number
  endYear: number
  series: OverviewSeries[]
  deps: OverviewBuildDeps
  fillContainer?: boolean
}

type HoverState = {
  year: number
  kind: 'actual' | 'projected'
  stacks: { id: string; name: string; type: OverviewSeries['type']; value: number }[]
  total: number
  portfolios: {
    seriesId: string
    name: string
    total: number
    lines: PortfolioBreakdownLine[]
  }[]
}

export function OverviewChart({
  startYear,
  endYear,
  series,
  deps,
  fillContainer = false,
}: Props) {
  const [hover, setHover] = useState<HoverState | null>(null)

  const active = useMemo(
    () => series.filter((s) => s.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    [series],
  )

  const rows = useMemo(
    () => buildOverviewChartRows({ startYear, endYear, series }, deps),
    [startYear, endYear, series, deps],
  )

  const colorById = useMemo(() => assignOverviewSeriesColors(series), [series])

  function hoverFromRow(row: OverviewChartRow): HoverState | null {
    const stacks: HoverState['stacks'] = []
    const portfolios: HoverState['portfolios'] = []
    let total = 0

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
        const lines = portfolioBreakdownChfAtYear(s, row.year, deps)
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

    if (stacks.length === 0) {
      // Still show year with total 0 so user sees something on hover
      return {
        year: row.year,
        kind: row.kind,
        stacks: [],
        total: 0,
        portfolios: [],
      }
    }

    return {
      year: row.year,
      kind: row.kind,
      stacks,
      total,
      portfolios,
    }
  }

  /**
   * Recharts 3 mouse state: use isTooltipActive + activeLabel / activeTooltipIndex
   * (same as PortfolioChart). Do not rely on activePayload.
   */
  function resolveHover(state: {
    isTooltipActive?: boolean
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activePayload?: any[]
  }): HoverState | null {
    if (!state?.isTooltipActive) return null

    const byLabel =
      state.activeLabel != null
        ? rows.find(
            (r) =>
              r.label === String(state.activeLabel) ||
              String(r.year) === String(state.activeLabel),
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

    // Fallback: payload payload (some recharts versions)
    let byPayload: OverviewChartRow | undefined
    const p0 = state.activePayload?.[0]?.payload
    if (p0 && typeof p0 === 'object' && typeof (p0 as OverviewChartRow).year === 'number') {
      byPayload = p0 as OverviewChartRow
    }

    const row = byLabel ?? byIndex ?? byPayload
    if (!row) return null
    return hoverFromRow(row)
  }

  if (active.length === 0) {
    return (
      <div
        className={
          fillContainer
            ? 'flex h-full min-h-[16rem] items-center justify-center text-sm text-white/40'
            : 'flex h-72 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40'
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
        className={
          fillContainer
            ? 'relative min-h-0 w-full flex-1'
            : 'relative h-80 w-full min-h-[20rem]'
        }
        onMouseLeave={() => setHover(null)}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={rows}
            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
            onMouseMove={(state) => {
              setHover(resolveHover(state as Parameters<typeof resolveHover>[0]))
            }}
            onMouseLeave={() => setHover(null)}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(232,238,245,0.45)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            />
            <YAxis
              tick={{ fill: 'rgba(232,238,245,0.4)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => {
                if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
                if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`
                return String(v)
              }}
            />
            {/* Required so isTooltipActive stays true on hover (Recharts 3) */}
            <Tooltip
              content={() => null}
              cursor={{ fill: 'rgba(255,255,255,0.06)' }}
              isAnimationActive={false}
            />
            {active.map((s) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                name={s.name}
                stackId="overview"
                fill={colorById.get(s.id) ?? '#94a3b8'}
                isAnimationActive={false}
              >
                {rows.map((r) => (
                  <Cell
                    key={`${s.id}-${r.year}`}
                    fill={colorById.get(s.id) ?? '#94a3b8'}
                    fillOpacity={r.kind === 'actual' ? 0.92 : 0.4}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* Compact totals panel — chart-local, not clipped by page below */}
        {hover ? (
          <div className="pointer-events-none absolute right-2 top-2 z-30 w-[15.5rem] rounded-xl border border-white/10 bg-[#121820]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 font-semibold text-white">
              <span>{hover.year}</span>
              {hover.kind === 'projected' ? (
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
              <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                {hover.stacks.map((st) => (
                  <div key={st.id} className="flex justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-white/60">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: colorById.get(st.id) ?? '#94a3b8' }}
                      />
                      <span className="truncate">{st.name}</span>
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
              <span className="text-white/50">Total</span>
              <span className="tabular-nums text-emerald-400/90">
                {formatMoney(hover.total, OVERVIEW_CURRENCY)}
              </span>
            </div>
            {hover.portfolios.length > 0 ? (
              <p className="mt-1.5 text-[10px] text-white/35">Portfolio details below chart</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Portfolio holdings — separate from compact totals */}
      {hover && hover.portfolios.length > 0 ? (
        <div className="relative z-20 mt-3 space-y-2">
          {hover.portfolios.map((p) => (
            <div
              key={p.seriesId}
              className="rounded-xl border border-white/10 bg-[#121820]/90 px-3 py-2 text-xs shadow-xl"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 font-semibold text-white">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: colorById.get(p.seriesId) ?? '#34d399' }}
                  />
                  {p.name}
                  <span className="font-normal text-white/40">· portfolio · {hover.year}</span>
                </div>
                <span className="tabular-nums font-medium text-emerald-400/90">
                  {formatMoney(p.total, OVERVIEW_CURRENCY)}
                </span>
              </div>
              <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto border-t border-white/10 pt-1.5">
                {p.lines.map((line, i) => (
                  <li
                    key={`${p.seriesId}-${line.label}-${i}`}
                    className="flex justify-between gap-4 text-[11px]"
                  >
                    <span className={line.kind === 'cash' ? 'text-white/45' : 'text-white/55'}>
                      {line.label}
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        line.valueChf < 0 ? 'text-red-300/80' : 'text-white/75'
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

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {active.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: colorById.get(s.id) ?? '#94a3b8' }}
            />
            {s.name}
            <span className="text-white/30">· {sourceLabel(s.type)}</span>
          </span>
        ))}
        <span className="text-[10px] text-white/30">
          Hover a bar for year totals (top-right); portfolio holdings list under the chart
        </span>
      </div>
    </div>
  )
}

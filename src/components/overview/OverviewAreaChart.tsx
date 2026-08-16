import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
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
  type OverviewBuildDeps,
  type OverviewChartRow,
} from '../../lib/overview'
import type { ChartAnnotation, NetWorthGoal, OverviewSeries } from '../../types'
import { ChartGoalLines } from '../common/ChartGoals'
import { chartYearTick } from '../common/ChartNotes'
import { goalYMax } from '../../lib/goals'

type Props = {
  startYear: number
  endYear: number
  series: OverviewSeries[]
  deps: OverviewBuildDeps
  fillContainer?: boolean
  recordedByYear?: Map<number, number>
  showRecorded?: boolean
  annotations?: ChartAnnotation[]
  goals?: NetWorthGoal[]
  prebuiltRows?: OverviewChartRow[]
  onSelectYear?: (xKey: string) => void
}

export function OverviewAreaChart({
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
  onSelectYear,
}: Props) {
  const sorted = useMemo(
    () =>
      [...series]
        .filter((s) => s.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [series],
  )
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

  if (sorted.length === 0) {
    return (
      <div
        className={
          fillContainer
            ? 'flex h-full min-h-[16rem] items-center justify-center text-sm text-white/40'
            : 'flex h-72 items-center justify-center text-sm text-white/40'
        }
      >
        Enable or add series to see stacked net worth
      </div>
    )
  }

  return (
    <div
      className={
        fillContainer
          ? 'relative flex h-full min-h-0 w-full flex-col'
          : 'relative flex w-full flex-col'
      }
    >
      <div
        className={
          fillContainer
            ? `relative min-h-0 w-full flex-1 outline-none [&_svg]:outline-none ${
                onSelectYear ? 'cursor-pointer' : ''
              }`
            : `relative h-80 w-full min-h-[20rem] outline-none [&_svg]:outline-none ${
                onSelectYear ? 'cursor-pointer' : ''
              }`
        }
        onMouseDown={(e) => {
          if (!onSelectYear) return
          e.preventDefault()
        }}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
            style={onSelectYear ? { cursor: 'pointer', outline: 'none' } : { outline: 'none' }}
            onClick={
              onSelectYear
                ? (state: {
                    activeLabel?: string | number
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    activePayload?: any[]
                  }) => {
                    const p0 = state?.activePayload?.[0]?.payload as
                      | { xKey?: string }
                      | undefined
                    const key =
                      typeof p0?.xKey === 'string'
                        ? p0.xKey
                        : state.activeLabel != null
                          ? String(state.activeLabel)
                          : null
                    if (key) onSelectYear(key)
                  }
                : undefined
            }
          >
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="xKey"
              tick={chartYearTick(annotations, rows.map((r) => r.xKey), (key) => {
                if (rows.length <= 18) return false
                const n = Number(key)
                return Number.isFinite(n) && n % 2 !== 0
              })}
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
              tickFormatter={(v: number) => formatMoney(v, OVERVIEW_CURRENCY)}
            />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as { total?: number; label?: string } | undefined
                const total = typeof row?.total === 'number' ? row.total : null
                return (
                  <div className="rounded-lg border border-white/15 bg-[#121820] px-2.5 py-2 text-xs">
                    <div className="mb-1.5 font-medium text-white/80">
                      {row?.label ?? String(label ?? '')}
                    </div>
                    {[...payload]
                      .filter((p) => p.dataKey !== RECORDED_ACTUAL_KEY)
                      .reverse()
                      .map((p) => (
                      <div
                        key={String(p.dataKey)}
                        className="flex items-center justify-between gap-4"
                      >
                        <span className="flex items-center gap-1.5 text-white/60">
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-sm"
                            style={{ background: String(p.color ?? '#fff') }}
                          />
                          {String(p.name ?? '')}
                        </span>
                        <span className="tabular-nums text-white/85">
                          {formatMoney(typeof p.value === 'number' ? p.value : null, OVERVIEW_CURRENCY)}
                        </span>
                      </div>
                    ))}
                    {total != null ? (
                      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-white/10 pt-1.5 font-medium">
                        <span className="text-white/70">Modeled</span>
                        <span className="tabular-nums text-white">
                          {formatMoney(total, OVERVIEW_CURRENCY)}
                        </span>
                      </div>
                    ) : null}
                    {showRecorded &&
                    row &&
                    typeof (row as { [RECORDED_ACTUAL_KEY]?: number | null })[RECORDED_ACTUAL_KEY] ===
                      'number' ? (
                      <div className="mt-1 flex items-center justify-between gap-4 font-medium">
                        <span className="text-amber-300/80">Recorded</span>
                        <span className="tabular-nums text-amber-300/90">
                          {formatMoney(
                            (row as { [RECORDED_ACTUAL_KEY]: number })[RECORDED_ACTUAL_KEY],
                            OVERVIEW_CURRENCY,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {(() => {
                      const xKey =
                        (row as { xKey?: string } | undefined)?.xKey ?? String(label ?? '')
                      const notesHere = annotationsForXKey(annotations, xKey)
                      if (notesHere.length === 0) return null
                      return (
                        <div className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5 text-amber-200/75">
                          {notesHere.map((n) => (
                            <div key={n.id}>{n.label}</div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {stackOrder.map((s) => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name.trim() || 'Series'}
                stackId="nw"
                stroke={colorById.get(s.id) ?? '#94a3b8'}
                fill={colorById.get(s.id) ?? '#94a3b8'}
                fillOpacity={0.35}
                connectNulls={false}
              />
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
              />
            ) : null}
            {goals.length > 0 ? (
              <ChartGoalLines goals={goals} xKeys={rows.map((r) => r.xKey)} />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

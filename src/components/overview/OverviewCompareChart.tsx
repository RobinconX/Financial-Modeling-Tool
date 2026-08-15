import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../lib/format'
import {
  assignScenarioCompareColors,
  buildOverviewCompareRows,
  OVERVIEW_CURRENCY,
  type OverviewBuildDeps,
} from '../../lib/overview'
import type { ChartAnnotation, OverviewScenario } from '../../types'
import { chartYearTick } from '../common/ChartNotes'
import { annotationsForXKey } from '../../lib/annotations'
import { RECORDED_ACTUAL_KEY } from '../../lib/history'

type Props = {
  scenarios: OverviewScenario[]
  /** Shared X range for comparison */
  startYear: number
  endYear: number
  deps: OverviewBuildDeps
  fillContainer?: boolean
  recordedByYear?: Map<number, number>
  showRecorded?: boolean
  annotations?: ChartAnnotation[]
}

export function OverviewCompareChart({
  scenarios,
  startYear,
  endYear,
  deps,
  fillContainer = false,
  recordedByYear,
  showRecorded = false,
  annotations = [],
}: Props) {
  const rows = useMemo(() => {
    const built = buildOverviewCompareRows(scenarios, deps, { startYear, endYear })
    if (!showRecorded || !recordedByYear) return built
    return built.map((r) => ({
      ...r,
      [RECORDED_ACTUAL_KEY]:
        r.isNow || r.kind !== 'actual' ? null : (recordedByYear.get(r.year) ?? null),
    }))
  }, [scenarios, deps, startYear, endYear, recordedByYear, showRecorded])

  const colorById = useMemo(() => assignScenarioCompareColors(scenarios), [scenarios])

  if (scenarios.length === 0) {
    return (
      <div
        className={
          fillContainer
            ? 'flex h-full min-h-[16rem] items-center justify-center text-sm text-white/40'
            : 'flex h-72 items-center justify-center text-sm text-white/40'
        }
      >
        Select at least one scenario to compare
      </div>
    )
  }

  return (
    <div
      className={
        fillContainer
          ? 'flex h-full min-h-0 w-full flex-col'
          : 'flex w-full flex-col'
      }
    >
      <div
        className={
          fillContainer
            ? 'relative min-h-0 w-full flex-1'
            : 'relative h-80 w-full min-h-[20rem]'
        }
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
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
              tickFormatter={(v: number) => {
                if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
                if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`
                return String(v)
              }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as
                  | { kind?: string; isNow?: boolean; label?: string; xKey?: string }
                  | undefined
                const isNow = row?.isNow === true
                const kind = row?.kind
                const notesHere = isNow
                  ? []
                  : annotationsForXKey(annotations, String(row?.xKey ?? label ?? ''))
                return (
                  <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <span>{isNow ? 'Now' : String(label ?? row?.label ?? '')}</span>
                      {isNow ? (
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300/90">
                          Live
                        </span>
                      ) : kind === 'projected' ? (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                          Projected
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400/80">
                          Actual
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {payload.map((p) => {
                        const id = String(p.dataKey ?? '')
                        if (id === RECORDED_ACTUAL_KEY) {
                          return (
                            <div key={id} className="flex justify-between gap-4">
                              <span className="inline-flex items-center gap-1.5 text-amber-300/80">
                                <span className="h-2 w-2 rounded-full bg-amber-300" />
                                Recorded
                              </span>
                              <span className="tabular-nums text-amber-300/90">
                                {formatMoney(Number(p.value) || 0, OVERVIEW_CURRENCY)}
                              </span>
                            </div>
                          )
                        }
                        const sc = scenarios.find((s) => s.id === id)
                        return (
                          <div key={id} className="flex justify-between gap-4">
                            <span className="inline-flex items-center gap-1.5 text-white/55">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: colorById.get(id) ?? '#94a3b8' }}
                              />
                              {sc?.name ?? id}
                            </span>
                            <span className="tabular-nums text-white/85">
                              {formatMoney(Number(p.value) || 0, OVERVIEW_CURRENCY)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {notesHere.length > 0 ? (
                      <div className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5 text-amber-200/75">
                        {notesHere.map((n) => (
                          <div key={n.id}>{n.label}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: 'rgba(232,238,245,0.5)' }}
              formatter={(value) => {
                const sc = scenarios.find((s) => s.id === value || s.name === value)
                return sc?.name ?? String(value)
              }}
            />
            {scenarios.map((sc) => (
              <Line
                key={sc.id}
                type="monotone"
                dataKey={sc.id}
                name={sc.name}
                stroke={colorById.get(sc.id) ?? '#94a3b8'}
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload, index } = props as {
                    cx?: number
                    cy?: number
                    payload?: { isNow?: boolean }
                    index?: number
                  }
                  if (cx == null || cy == null) return null
                  const fill = colorById.get(sc.id) ?? '#94a3b8'
                  const isNow = payload?.isNow === true
                  return (
                    <circle
                      key={`dot-${sc.id}-${index}`}
                      cx={cx}
                      cy={cy}
                      r={isNow ? 5 : 3}
                      fill={fill}
                      stroke={isNow ? 'rgba(255,255,255,0.7)' : undefined}
                      strokeWidth={isNow ? 2 : 0}
                    />
                  )
                }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
            {showRecorded ? (
              <Line
                type="monotone"
                dataKey={RECORDED_ACTUAL_KEY}
                name="Recorded"
                stroke="#fbbf24"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3, fill: '#fbbf24' }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

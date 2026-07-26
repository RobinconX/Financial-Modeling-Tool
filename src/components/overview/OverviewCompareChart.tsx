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
import type { OverviewScenario } from '../../types'

type Props = {
  scenarios: OverviewScenario[]
  /** Shared X range for comparison */
  startYear: number
  endYear: number
  deps: OverviewBuildDeps
  fillContainer?: boolean
}

export function OverviewCompareChart({
  scenarios,
  startYear,
  endYear,
  deps,
  fillContainer = false,
}: Props) {
  const rows = useMemo(
    () => buildOverviewCompareRows(scenarios, deps, { startYear, endYear }),
    [scenarios, deps, startYear, endYear],
  )

  const colorById = useMemo(() => assignScenarioCompareColors(scenarios), [scenarios])

  if (scenarios.length === 0) {
    return (
      <div
        className={
          fillContainer
            ? 'flex h-full min-h-[16rem] items-center justify-center text-sm text-white/40'
            : 'flex h-72 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40'
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
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const kind = (payload[0]?.payload as { kind?: string } | undefined)?.kind
                return (
                  <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <span>{String(label ?? '')}</span>
                      {kind === 'projected' ? (
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
                dot={{ r: 3, strokeWidth: 0, fill: colorById.get(sc.id) ?? '#94a3b8' }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-white/35">
        Each line is the total net worth of a scenario (enabled series only), in{' '}
        {OVERVIEW_CURRENCY}.
      </p>
    </div>
  )
}

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../lib/format'
import {
  formatGoalSpeedDate,
  formatGoalSpeedDuration,
  mergeGoalSpeedSeries,
  splitMonths,
  type GoalSpeedTableRow,
} from '../../lib/goalSpeed'

const PATH_COLORS = ['#94a3b8', '#34d399', '#38bdf8', '#fbbf24', '#a78bfa', '#f472b6']
const GOAL_COLOR = '#ef4444'

type Props = {
  rows: GoalSpeedTableRow[]
  goal: number
  currency: string
  today: Date
  /** Label for t ≈ 0 (Now, or a projected year-end). */
  originTick?: string
}

function tickYear(t: number, today: Date, originTick: string): string {
  if (t < 0.05) return originTick
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return String(new Date(start + t * 365.25 * 86_400_000).getUTCFullYear())
}

/** Time saved in each gap between consecutive hit markers (left = sooner). */
function hitGapLabels(rows: GoalSpeedTableRow[]) {
  const hits = rows
    .map((row, i) =>
      row.hit.reached
        ? { i, t: row.hit.t, months: row.hit.duration.totalMonths }
        : null,
    )
    .filter((h): h is { i: number; t: number; months: number } => h != null)
    .sort((a, b) => a.t - b.t)
  const gaps: { mid: number; label: string; color: string }[] = []
  for (let i = 0; i < hits.length - 1; i++) {
    const left = hits[i]!
    const right = hits[i + 1]!
    const saved = right.months - left.months
    if (saved <= 0 || right.t - left.t < 1e-6) continue
    gaps.push({
      mid: (left.t + right.t) / 2,
      label: formatGoalSpeedDuration(splitMonths(saved)),
      color: PATH_COLORS[left.i % PATH_COLORS.length],
    })
  }
  return gaps
}

export function GoalSpeedChart({
  rows,
  goal,
  currency,
  today,
  originTick = 'Now',
}: Props) {
  const data = mergeGoalSpeedSeries(rows, goal)
  const gaps = hitGapLabels(rows)
  if (data.length < 2) {
    const already = rows.some((r) => r.hit.reached && r.hit.already)
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        {already
          ? 'Already at the goal.'
          : 'Enter a goal and rate to see contribution effectiveness.'}
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="h-72 w-full min-w-0 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickFormatter={(t: number) => tickYear(t, today, originTick)}
              axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickFormatter={(v: number) => formatMoney(v, currency)}
              width={72}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#121820',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(_, pts) => {
                const date = (pts?.[0]?.payload as { date?: string } | undefined)?.date
                return date ? formatGoalSpeedDate(date) : ''
              }}
              formatter={(value, name) => [
                typeof value === 'number' ? formatMoney(value, currency) : '—',
                String(name),
              ]}
            />
            <ReferenceLine
              y={goal}
              stroke={GOAL_COLOR}
              strokeDasharray="4 4"
              label={{
                value: 'Goal',
                fill: GOAL_COLOR,
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
            {rows.map((row, i) =>
              row.hit.reached ? (
                <ReferenceLine
                  key={`hit-${row.key}`}
                  x={row.hit.t}
                  stroke={PATH_COLORS[i % PATH_COLORS.length]}
                  strokeDasharray="3 3"
                  strokeOpacity={0.55}
                />
              ) : null,
            )}
            {rows.map((row, i) => (
              <Line
                key={row.key}
                type="linear"
                dataKey={row.key}
                name={row.label}
                stroke={PATH_COLORS[i % PATH_COLORS.length]}
                strokeWidth={row.key === 'base' ? 2 : 2.25}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {rows.map((row, i) =>
              row.hit.reached ? (
                <ReferenceDot
                  key={`dot-${row.key}`}
                  x={row.hit.t}
                  y={goal}
                  r={4}
                  fill={PATH_COLORS[i % PATH_COLORS.length]}
                  stroke="#0b0f14"
                  strokeWidth={1.25}
                />
              ) : null,
            )}
            {gaps.map((g) => (
              <ReferenceDot
                key={`gap-${g.mid}`}
                x={g.mid}
                y={goal}
                r={0}
                fill="none"
                stroke="none"
                label={{
                  value: g.label,
                  position: 'bottom',
                  fill: g.color,
                  fontSize: 11,
                  offset: 8,
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {rows.map((row, i) => {
          const color = PATH_COLORS[i % PATH_COLORS.length]
          return (
            <li key={row.key} className="flex min-w-0 items-center gap-1.5 text-[11px]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              <span className="font-medium text-white/70">{row.label}</span>
              {row.hit.reached ? (
                <>
                  <span className="tabular-nums text-white/90">
                    {formatGoalSpeedDuration(row.hit.duration)}
                  </span>
                  <span className="text-white/40">{formatGoalSpeedDate(row.hit.date)}</span>
                </>
              ) : (
                <span className="text-white/40">does not reach</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

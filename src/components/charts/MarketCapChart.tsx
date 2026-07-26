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
import type { SeriesPoint } from '../../types'

type Props = {
  data: SeriesPoint[]
  mode: 'easy' | 'advanced'
  currency?: string
}

type DotProps = {
  cx?: number
  cy?: number
  payload?: SeriesPoint
}

function ActualDot({
  cx,
  cy,
  payload,
  seriesKey,
  color,
}: DotProps & { seriesKey: 'easy' | 'ps' | 'pfcf' | 'pe'; color: string }) {
  if (cx == null || cy == null || !payload) return null
  const actualKey = `${seriesKey}Actual` as keyof SeriesPoint
  if (!payload[actualKey]) return null
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#0b0f14" strokeWidth={1.5} />
}

type ChartProps = Props & {
  /** Grow to parent height (fullscreen overlay) */
  fillContainer?: boolean
}

export function MarketCapChart({
  data,
  mode,
  currency = 'USD',
  fillContainer = false,
}: ChartProps) {
  const hasSeries =
    mode === 'easy'
      ? data.some((d) => d.easy != null)
      : data.some((d) => d.ps != null || d.pfcf != null || d.pe != null)

  if (data.length < 2 || !hasSeries) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        Enter projections to see market cap evolution
      </div>
    )
  }

  const years = data.map((d) => d.year)
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  // One tick per year when range is small; otherwise step so labels stay readable
  const span = maxYear - minYear
  const tickStep = span <= 12 ? 1 : span <= 24 ? 2 : 5
  const ticks: number[] = []
  for (let y = minYear; y <= maxYear; y += tickStep) ticks.push(y)
  if (ticks[ticks.length - 1] !== maxYear) ticks.push(maxYear)

  return (
    <div className={fillContainer ? 'h-full min-h-0 w-full' : 'h-72 w-full'}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            type="number"
            domain={[minYear, maxYear]}
            ticks={ticks}
            allowDecimals={false}
            stroke="rgba(255,255,255,0.35)"
            tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }}
            tickLine={false}
            tickFormatter={(v: number) => String(v)}
          />
          <YAxis
            stroke="rgba(255,255,255,0.35)"
            tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v: number) => formatMoney(v, currency)}
            width={72}
          />
          <Tooltip
            contentStyle={{
              background: '#121820',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            labelFormatter={(label) => `Year ${label}`}
            formatter={(value, name) => {
              const n = typeof value === 'number' ? value : Number(value)
              return [formatMoney(n, currency), String(name)]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

          {mode === 'easy' ? (
            <Line
              type="monotone"
              dataKey="easy"
              name="Projected mcap"
              stroke="#34d399"
              strokeWidth={2.5}
              dot={(props) => (
                <ActualDot {...props} seriesKey="easy" color="#34d399" />
              )}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
          ) : (
            <>
              <Line
                type="monotone"
                dataKey="ps"
                name="P/S"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={(props) => <ActualDot {...props} seriesKey="ps" color="#38bdf8" />}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="pfcf"
                name="P/FCF"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={(props) => <ActualDot {...props} seriesKey="pfcf" color="#a78bfa" />}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="pe"
                name="P/E"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={(props) => <ActualDot {...props} seriesKey="pe" color="#fbbf24" />}
                connectNulls
                isAnimationActive={false}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

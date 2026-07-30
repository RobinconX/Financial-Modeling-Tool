import { useMemo, useState } from 'react'
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
import { formatMoney, formatPrice } from '../../lib/format'
import type { SeriesPoint } from '../../types'

export type ChartMetric = 'mcap' | 'price'

type Props = {
  data: SeriesPoint[]
  mode: 'easy' | 'advanced'
  currency?: string
  /** Required to show share-price mode (mcap ÷ shares) */
  sharesOutstanding?: number | null
  /** Controlled metric; omit for internal toggle state */
  metric?: ChartMetric
  onMetricChange?: (m: ChartMetric) => void
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

function scalePoint(p: SeriesPoint, shares: number): SeriesPoint {
  const div = (v: number | undefined) =>
    v != null && Number.isFinite(v) ? v / shares : undefined
  return {
    ...p,
    current: div(p.current),
    easy: div(p.easy),
    ps: div(p.ps),
    pfcf: div(p.pfcf),
    pe: div(p.pe),
  }
}

type ChartProps = Props & {
  /** Grow to parent height (fullscreen overlay) */
  fillContainer?: boolean
}

export function MarketCapChart({
  data,
  mode,
  currency = 'USD',
  sharesOutstanding = null,
  metric: metricProp,
  onMetricChange,
  fillContainer = false,
}: ChartProps) {
  const [metricLocal, setMetricLocal] = useState<ChartMetric>('mcap')
  const metric = metricProp ?? metricLocal
  const setMetric = (m: ChartMetric) => {
    onMetricChange?.(m)
    if (metricProp == null) setMetricLocal(m)
  }

  const canShowPrice =
    sharesOutstanding != null && Number.isFinite(sharesOutstanding) && sharesOutstanding > 0

  const effectiveMetric: ChartMetric =
    metric === 'price' && canShowPrice ? 'price' : 'mcap'

  const chartData = useMemo(() => {
    if (effectiveMetric !== 'price' || !canShowPrice) return data
    return data.map((p) => scalePoint(p, sharesOutstanding!))
  }, [data, effectiveMetric, canShowPrice, sharesOutstanding])

  const hasSeries =
    mode === 'easy'
      ? chartData.some((d) => d.easy != null)
      : chartData.some((d) => d.ps != null || d.pfcf != null || d.pe != null)

  const formatY = (v: number) =>
    effectiveMetric === 'price' ? formatPrice(v, currency) : formatMoney(v, currency)

  const easyLineName =
    effectiveMetric === 'price' ? 'Projected price' : 'Projected mcap'

  if (data.length < 2 || !hasSeries) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        Enter projections to see evolution
      </div>
    )
  }

  const years = chartData.map((d) => d.year)
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const span = maxYear - minYear
  const tickStep = span <= 12 ? 1 : span <= 24 ? 2 : 5
  const ticks: number[] = []
  for (let y = minYear; y <= maxYear; y += tickStep) ticks.push(y)
  if (ticks[ticks.length - 1] !== maxYear) ticks.push(maxYear)

  return (
    <div className={fillContainer ? 'flex h-full min-h-0 w-full flex-col gap-2' : 'w-full'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5"
          role="group"
          aria-label="Chart metric"
        >
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              effectiveMetric === 'mcap'
                ? 'bg-white text-black shadow'
                : 'text-white/55 hover:text-white'
            }`}
            onClick={() => setMetric('mcap')}
            aria-pressed={effectiveMetric === 'mcap'}
          >
            Market cap
          </button>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              effectiveMetric === 'price'
                ? 'bg-white text-black shadow'
                : canShowPrice
                  ? 'text-white/55 hover:text-white'
                  : 'cursor-not-allowed text-white/25'
            }`}
            onClick={() => {
              if (canShowPrice) setMetric('price')
            }}
            disabled={!canShowPrice}
            title={
              canShowPrice
                ? 'Share price = market cap ÷ shares outstanding'
                : 'Needs shares outstanding (refresh quote)'
            }
            aria-pressed={effectiveMetric === 'price'}
          >
            Share price
          </button>
        </div>
        {!canShowPrice && (
          <span className="text-[10px] text-white/35">
            Share price needs shares outstanding
          </span>
        )}
      </div>

      <div className={fillContainer ? 'min-h-0 flex-1' : 'h-72 w-full'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
              tickFormatter={(v: number) => formatY(v)}
              width={effectiveMetric === 'price' ? 64 : 72}
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
                return [formatY(n), String(name)]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

            {mode === 'easy' ? (
              <Line
                type="monotone"
                dataKey="easy"
                name={easyLineName}
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
                  name={effectiveMetric === 'price' ? 'P/S price' : 'P/S'}
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={(props) => <ActualDot {...props} seriesKey="ps" color="#38bdf8" />}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="pfcf"
                  name={effectiveMetric === 'price' ? 'P/FCF price' : 'P/FCF'}
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={(props) => <ActualDot {...props} seriesKey="pfcf" color="#a78bfa" />}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="pe"
                  name={effectiveMetric === 'price' ? 'P/E price' : 'P/E'}
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
    </div>
  )
}

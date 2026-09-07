import { useEffect, useMemo, useRef, useState } from 'react'
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
import { formatPercent } from '../../lib/format'
import { mergeUpsideSeries, type GoalPathMetric, type UpsidePoint } from '../../lib/goalGap'

export type GoalGapChartSeries = {
  key: string
  name: string
  color: string
  points: UpsidePoint[]
}

type Props = {
  series: GoalGapChartSeries[]
  metric?: GoalPathMetric
  loading?: boolean
  error?: string | null
  fillContainer?: boolean
}

type DateWindow = { from: string; to: string }

const MIN_SPAN = 20
const Y_AXIS_PX = 56
const RIGHT_PX = 12

function tickPct(v: number): string {
  return formatPercent(v, v >= 1 || v <= -0.5 ? 0 : 1)
}

function zoomIndexWindow(
  length: number,
  start: number,
  end: number,
  anchorFrac: number,
  zoomIn: boolean,
  minSpan = MIN_SPAN,
): { start: number; end: number } {
  if (length < 2) return { start: 0, end: Math.max(0, length - 1) }
  const last = length - 1
  const span = Math.max(1, end - start)
  const frac = Math.min(1, Math.max(0, anchorFrac))
  const factor = 0.75
  let nextSpan = zoomIn ? Math.floor(span * factor) : Math.ceil(span / factor)
  nextSpan = Math.max(minSpan, Math.min(last, nextSpan))
  if (!zoomIn && start <= 0 && end >= last) return { start: 0, end: last }
  const center = start + frac * span
  let nextStart = Math.round(center - frac * nextSpan)
  let nextEnd = nextStart + nextSpan
  if (nextStart < 0) {
    nextEnd -= nextStart
    nextStart = 0
  }
  if (nextEnd > last) {
    nextStart -= nextEnd - last
    nextEnd = last
  }
  nextStart = Math.max(0, nextStart)
  nextEnd = Math.min(last, Math.max(nextStart + 1, nextEnd))
  return { start: nextStart, end: nextEnd }
}

function formatTimeTick(date: string, from: string, to: string): string {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (!Number.isFinite(days) || days > 500) return date.slice(0, 4)
  if (days > 80) return date.slice(0, 7)
  return date.slice(5)
}

function pickTicks(dates: string[], count = 5): string[] {
  if (dates.length <= count) return dates
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * (dates.length - 1))
    const d = dates[idx]
    if (d && out[out.length - 1] !== d) out.push(d)
  }
  return out
}

export function GoalGapChart({
  series,
  metric = 'upside',
  loading,
  error,
  fillContainer = false,
}: Props) {
  const valueLabel = metric === 'cagr' ? 'CAGR' : 'Remaining upside'
  const plot = useMemo(
    () => series.filter((s) => s.points.length >= 2),
    [series],
  )
  const data = useMemo(() => mergeUpsideSeries(plot), [plot])
  const [win, setWin] = useState<DateWindow | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const last = Math.max(0, data.length - 1)
  let start = 0
  let end = last
  if (win && data.length > 0) {
    const lo = data.findIndex((d) => d.date >= win.from)
    start = lo < 0 ? 0 : lo
    end = start
    for (let i = data.length - 1; i >= start; i--) {
      if (data[i]!.date <= win.to) {
        end = i
        break
      }
    }
    if (end <= start) end = Math.min(last, start + 1)
  }
  const visible = data.length > 0 ? data.slice(start, end + 1) : data
  const zoomed = data.length > 1 && (start > 0 || end < last)

  useEffect(() => {
    const node = chartRef.current
    if (!node || data.length < 2) return
    const host: HTMLDivElement = node
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      e.stopPropagation()
      const rect = host.getBoundingClientRect()
      const plotW = Math.max(1, rect.width - Y_AXIS_PX - RIGHT_PX)
      const frac = (e.clientX - rect.left - Y_AXIS_PX) / plotW
      const zoomIn = e.deltaY < 0
      setWin((w) => {
        let curStart = 0
        let curEnd = data.length - 1
        if (w) {
          const lo = data.findIndex((d) => d.date >= w.from)
          curStart = lo < 0 ? 0 : lo
          curEnd = curStart
          for (let i = data.length - 1; i >= curStart; i--) {
            if (data[i]!.date <= w.to) {
              curEnd = i
              break
            }
          }
        }
        const next = zoomIndexWindow(data.length, curStart, curEnd, frac, zoomIn)
        const from = data[next.start]?.date
        const to = data[next.end]?.date
        if (!from || !to) return w
        if (next.start <= 0 && next.end >= data.length - 1) return null
        return { from, to }
      })
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [data])

  if (loading && data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-white/40">Loading price history…</p>
    )
  }
  if (error && data.length < 2) {
    return <p className="py-10 text-center text-sm text-red-300">{error}</p>
  }
  if (data.length < 2) {
    const symbols = [...new Set(series.map((s) => s.name.split(' / ')[0] ?? s.name))]
    const onlyAcme = symbols.length === 1 && symbols[0] === 'ACME'
    return (
      <p className="py-10 text-center text-sm text-white/40">
        No price history for {symbols.join(', ') || 'this ticker'}
        {onlyAcme ? ' (demo ticker)' : ''}.
      </p>
    )
  }

  const min = visible[0]!.date
  const max = visible[visible.length - 1]!.date
  const ticks = pickTicks(
    visible.map((p) => p.date),
    visible.length > 400 ? 5 : 6,
  )

  return (
    <div
      className={
        fillContainer
          ? 'flex h-full min-h-0 w-full min-w-0 flex-col'
          : 'h-72 w-full min-w-0'
      }
    >
      <div
        ref={chartRef}
        className={fillContainer ? 'min-h-0 w-full flex-1' : 'h-full w-full'}
        onDoubleClick={() => setWin(null)}
      >
        <ResponsiveContainer width="100%" height="100%" debounce={50}>
          <LineChart data={visible} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              type="category"
              ticks={ticks}
              tickFormatter={(v: string) => formatTimeTick(String(v), min, max)}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
              tickLine={false}
              tickFormatter={tickPct}
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: '#121820',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
              formatter={(value, name) => {
                const n = typeof value === 'number' ? value : Number(value)
                return [formatPercent(n), `${String(name)} · ${valueLabel}`]
              }}
              labelFormatter={(label) => String(label)}
            />
            {plot.length > 1 ? (
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            ) : null}
            {plot.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-[10px] text-white/30">
        <span>
          {min} → {max}
          {zoomed ? '' : ' · scroll to zoom'}
        </span>
        {zoomed ? (
          <button
            type="button"
            className="text-emerald-300/80 hover:text-emerald-200"
            onClick={() => setWin(null)}
          >
            Reset
          </button>
        ) : null}
      </p>
    </div>
  )
}

export { zoomIndexWindow }

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../lib/format'
import type { ReturnProgressionPoint } from '../../lib/portfolioPerformanceStats'

export type ReturnChartMode = 'pct' | 'usd'

type Props = {
  points: ReturnProgressionPoint[]
  mode: ReturnChartMode
  missingNote: string | null
  onModeChange: (mode: ReturnChartMode) => void
}

function formatTick(date: string): string {
  const [y, m] = date.split('-')
  if (!m) return date
  return `${y}-${m}`
}

export function PortfolioReturnChart({
  points,
  mode,
  missingNote,
  onModeChange,
}: Props) {
  const data = points.map((p) => ({
    date: p.date,
    value:
      mode === 'pct'
        ? p.returnPct != null
          ? p.returnPct * 100
          : null
        : p.totalPnl,
  }))

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
        <div
          className="inline-flex gap-0.5 rounded-md border border-white/10 p-0.5"
          role="group"
          aria-label="Return chart units"
        >
          {(
            [
              { id: 'pct' as const, label: '%' },
              { id: 'usd' as const, label: '$' },
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
      {missingNote ? (
        <p className="text-[11px] text-amber-200/75">{missingNote}</p>
      ) : null}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatTick}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              minTickGap={48}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              width={mode === 'pct' ? 44 : 52}
              tickFormatter={(v: number) =>
                mode === 'pct' ? `${v.toFixed(0)}%` : formatMoney(v, 'USD')
              }
            />
            <Tooltip
              contentStyle={{
                background: '#121820',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(l) => String(l)}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : Number(value)
                if (!Number.isFinite(n)) return ['—', mode === 'pct' ? 'Return' : 'P&L']
                return mode === 'pct'
                  ? [`${n.toFixed(2)}%`, 'Return on buys']
                  : [formatMoney(n, 'USD'), 'Total P&L']
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
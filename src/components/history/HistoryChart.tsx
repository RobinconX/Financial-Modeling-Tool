import {
  Area,
  AreaChart,
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
import type { HistoryChartRow, HistorySeries } from '../../lib/history'

export type HistoryChartKind = 'line' | 'stacked'
export type HistoryChartSplit = 'total' | 'assets'

type Props = {
  rows: HistoryChartRow[]
  series: HistorySeries[]
  kind: HistoryChartKind
  split: HistoryChartSplit
}

const TOTAL_COLOR = '#a78bfa'

function tickMoney(v: number): string {
  return formatMoney(v, 'CHF')
}

export function HistoryChart({ rows, series, kind, split }: Props) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-white/40">
        No actuals in this period.
      </p>
    )
  }

  const showAssets = split === 'assets'
  const plotSeries = showAssets ? series : []

  const tooltip = (
    <Tooltip
      contentStyle={{
        background: '#121820',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        fontSize: 12,
      }}
      content={({ active, label, payload }) => {
        if (!active || !payload?.length) return null
        const row = payload[0]?.payload as HistoryChartRow | undefined
        const total = row?.total
        const showTotalRow = showAssets && total != null
        return (
          <div className="rounded-lg border border-white/15 bg-[#121820] px-2.5 py-2 text-xs">
            <div className="mb-1.5 font-medium text-white/80">{String(label ?? '')}</div>
            {payload.map((p) => (
              <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-white/60">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-sm"
                    style={{ background: String(p.color ?? '#fff') }}
                  />
                  {String(p.name ?? '')}
                </span>
                <span className="tabular-nums text-white/85">
                  {formatMoney(typeof p.value === 'number' ? p.value : null, 'CHF')}
                </span>
              </div>
            ))}
            {showTotalRow ? (
              <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-white/10 pt-1.5 font-medium">
                <span className="text-white/70">Total</span>
                <span className="tabular-nums text-white">{formatMoney(total, 'CHF')}</span>
              </div>
            ) : null}
          </div>
        )
      }}
    />
  )

  if (kind === 'stacked' && showAssets) {
    return (
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickFormatter={tickMoney}
              width={72}
            />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {plotSeries.map((s) => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stackId="nw"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.35}
                connectNulls={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (kind === 'stacked' && !showAssets) {
    return (
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickFormatter={tickMoney}
              width={72}
            />
            {tooltip}
            <Area
              type="monotone"
              dataKey="total"
              name="Total"
              stroke={TOTAL_COLOR}
              fill={TOTAL_COLOR}
              fillOpacity={0.3}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
            tickFormatter={tickMoney}
            width={72}
          />
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {showAssets ? (
            plotSeries.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 2.5, fill: s.color }}
                connectNulls={false}
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey="total"
              name="Total"
              stroke={TOTAL_COLOR}
              strokeWidth={2.5}
              dot={{ r: 3, fill: TOTAL_COLOR }}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

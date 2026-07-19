import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../lib/format'
import type { PortfolioGrid, SavedPortfolio } from '../types'
import { buildPortfolioChartData } from '../lib/portfolio'

const HOLDING_COLORS = [
  '#38bdf8',
  '#a78bfa',
  '#fbbf24',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#818cf8',
  '#e879f9',
]
const CASH_COLOR = '#64748b'
const NOW_CASH_COLOR = '#94a3b8'

type Props = {
  grid: PortfolioGrid
  portfolio: SavedPortfolio
  currency?: string
}

export function PortfolioChart({ grid, portfolio, currency = 'USD' }: Props) {
  const data = buildPortfolioChartData(grid, portfolio)
  const equityRows = grid.rows.filter((r) => r.kind === 'equity')
  const hasCash =
    getCurrentCashSafe(portfolio) > 0 ||
    data.some((d) => typeof d.cash === 'number' && d.cash > 0)

  if (data.length < 1 || !data.some((d) => d.total > 0)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        Portfolio value chart appears once you have shares or cash
      </div>
    )
  }

  const barCategoryGap = data.length > 14 ? '12%' : data.length > 8 ? '18%' : '28%'
  const maxBarSize = data.length > 14 ? 28 : data.length > 8 ? 40 : 52

  // Tick labels: always Now + first/last year; step intermediate years
  const tickKeys = new Set<string>(['now'])
  const yearPoints = data.filter((d) => !d.isNow)
  const tickStep = yearPoints.length <= 12 ? 1 : yearPoints.length <= 24 ? 2 : 5
  yearPoints.forEach((d, i) => {
    if (i % tickStep === 0 || i === yearPoints.length - 1 || d.isCurrentYear) {
      tickKeys.add(String(d.xKey))
    }
  })

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
          barCategoryGap={barCategoryGap}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="xKey"
            stroke="rgba(255,255,255,0.35)"
            tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            interval={0}
            tickFormatter={(key: string) => {
              if (!tickKeys.has(key)) return ''
              if (key === 'now') return 'Now'
              return key
            }}
          />
          <YAxis
            stroke="rgba(255,255,255,0.35)"
            tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v: number) => formatMoney(v, currency)}
            width={72}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#121820',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(_label, payload) => {
              const p = payload?.[0]?.payload as
                | { isNow?: boolean; isCurrentYear?: boolean; isEmpty?: boolean; yearLabel?: string }
                | undefined
              if (p?.isNow) return 'Now — current positions (live prices + current cash)'
              if (p?.isEmpty) return `Year ${p.yearLabel} (no projection)`
              if (p?.isCurrentYear) {
                return `Year ${p.yearLabel} — end of year (incl. deposits through this year)`
              }
              return `Year ${p?.yearLabel ?? ''}`
            }}
            formatter={(value, name) => {
              if (value == null || value === '') return ['—', String(name)]
              const n = typeof value === 'number' ? value : Number(value)
              if (!Number.isFinite(n) || n === 0) return ['—', String(name)]
              return [formatMoney(n, currency), String(name)]
            }}
            itemSorter={(item) => {
              if (item.dataKey === 'cash') return 999
              const idx = equityRows.findIndex((r) => r.key === item.dataKey)
              return idx >= 0 ? idx : 0
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

          {equityRows.map((row, i) => (
            <Bar
              key={row.key}
              dataKey={row.key}
              name={row.label}
              stackId="portfolio"
              fill={HOLDING_COLORS[i % HOLDING_COLORS.length]}
              isAnimationActive={false}
              maxBarSize={maxBarSize}
            >
              {data.map((entry) => (
                <Cell
                  key={`${row.key}-${entry.xKey}`}
                  fill={HOLDING_COLORS[i % HOLDING_COLORS.length]}
                  fillOpacity={
                    entry.isEmpty ? 0 : entry.isNow ? 1 : entry.isCurrentYear ? 0.95 : 0.88
                  }
                  stroke={entry.isNow ? 'rgba(255,255,255,0.35)' : undefined}
                  strokeWidth={entry.isNow ? 1 : 0}
                />
              ))}
            </Bar>
          ))}
          {hasCash && (
            <Bar
              dataKey="cash"
              name="Cash"
              stackId="portfolio"
              fill={CASH_COLOR}
              isAnimationActive={false}
              maxBarSize={maxBarSize}
              radius={[3, 3, 0, 0]}
            >
              {data.map((entry) => (
                <Cell
                  key={`cash-${entry.xKey}`}
                  fill={entry.isNow ? NOW_CASH_COLOR : CASH_COLOR}
                  fillOpacity={entry.isEmpty ? 0 : 1}
                  stroke={entry.isNow ? 'rgba(255,255,255,0.35)' : undefined}
                  strokeWidth={entry.isNow ? 1 : 0}
                />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-[11px] text-white/35">
        <span className="text-white/55">Now</span> = live holdings + current cash ·{' '}
        <span className="text-white/55">{new Date().getFullYear()}</span> and later = year view
        (deposits cumulative). Empty years keep calendar spacing.
      </p>
    </div>
  )
}

function getCurrentCashSafe(portfolio: SavedPortfolio): number {
  return portfolio.currentCash != null && portfolio.currentCash > 0 ? portfolio.currentCash : 0
}

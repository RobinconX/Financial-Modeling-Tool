import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { formatMoney, formatPercent } from '../../lib/format'
import {
  investedForRoiDisplay,
  simpleRoi,
} from '../../lib/portfolioContributions'
import type {
  DisplayCurrency,
  PortfolioContributionsState,
  SavedPortfolio,
} from '../../types'
import {
  PORTFOLIO_ACTUAL_COLOR,
  type PortfolioChartBreakdownRow,
  type PortfolioChartPoint,
} from '../../lib/portfolio'

type Props = {
  point: PortfolioChartPoint
  currency: DisplayCurrency
  colorByKey: Map<string, string>
  contributions: PortfolioContributionsState | null
  usdToChf: number | null
  portfolio: SavedPortfolio
  showCashInvested: boolean
  onClose: () => void
}

export function pointTitle(point: PortfolioChartPoint): string {
  if (point.isNow) return 'Now — live positions'
  if (point.isActual) return `${point.yearLabel} — actual (year-end)`
  if (point.isPerpetualGrowth) return `${point.yearLabel} — growth`
  return point.yearLabel
}

function rowPrice(row: PortfolioChartBreakdownRow): number | null {
  if (row.isCash || row.shares == null || row.shares === 0) return null
  if (!Number.isFinite(row.value)) return null
  return row.value / row.shares
}

function formatSharePrice(value: number | null, currency: string): string {
  if (value == null || !Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function sliceColor(
  row: PortfolioChartBreakdownRow,
  colorByKey: Map<string, string>,
): string {
  if (row.key === 'actual') return PORTFOLIO_ACTUAL_COLOR
  return colorByKey.get(row.key) ?? '#94a3b8'
}

export function PortfolioYearDetail({
  point,
  currency,
  colorByKey,
  contributions,
  usdToChf,
  portfolio,
  showCashInvested,
  onClose,
}: Props) {
  const rows = (point.breakdown ?? []).filter((r) => r.value !== 0)
  const total = point.total
  const year = point.year ?? new Date().getFullYear()
  const invested =
    contributions != null
      ? investedForRoiDisplay(
          contributions,
          year,
          currency,
          usdToChf,
          portfolio,
          new Date().getFullYear(),
          point.isNow,
        )
      : null
  const roi =
    invested != null && invested > 0 && Number.isFinite(total)
      ? simpleRoi(total, invested)
      : null

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-white/85">{pointTitle(point)}</div>
          <div className="mt-0.5 tabular-nums text-emerald-300">
            {formatMoney(total, currency)}
          </div>
        </div>
        <button
          type="button"
          className="text-[11px] text-white/40 hover:text-white/70"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {roi ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-white/55">
          <span>
            Invested{' '}
            <span className="tabular-nums text-white/80">
              {formatMoney(roi.invested, currency)}
            </span>
          </span>
          <span>
            Gain{' '}
            <span
              className={`tabular-nums ${roi.gain >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'}`}
            >
              {formatMoney(roi.gain, currency)}
            </span>
          </span>
          <span>
            ROI{' '}
            <span
              className={`tabular-nums ${roi.roi >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'}`}
            >
              {formatPercent(roi.roi)}
            </span>
          </span>
        </div>
      ) : null}

      {showCashInvested &&
      typeof point.cashSharePct === 'number' &&
      typeof point.investedSharePct === 'number' ? (
        <div className="mt-1 text-[11px] text-white/70">
          <span className="text-emerald-300/90">
            {point.investedSharePct.toFixed(0)}% invested
          </span>
          <span className="text-white/30"> · </span>
          <span className="text-sky-300/90">{point.cashSharePct.toFixed(0)}% cash</span>
        </div>
      ) : null}

      {point.isActual ? (
        <p className="mt-1 text-[10px] text-amber-300/80">
          Year-end actual is a single total — no per-position split.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        {rows.length > 0 && total > 0 ? (
          <div className="mx-auto h-44 w-44 shrink-0 sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="ticker"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={68}
                  paddingAngle={1}
                  isAnimationActive={false}
                >
                  {rows.map((r) => (
                    <Cell key={r.key} fill={sliceColor(r, colorByKey)} stroke="rgba(11,15,20,0.6)" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        <div className="min-w-0 flex-1 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-[11px] text-white/40">No positions this year</p>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-white/35">
                <tr>
                  <th className="py-0.5 pr-3 font-medium">Position</th>
                  <th className="py-0.5 pr-3 text-right font-medium">Shares</th>
                  <th className="py-0.5 pr-3 text-right font-medium">
                    {point.isNow ? 'Price' : 'Projected'}
                  </th>
                  <th className="py-0.5 pr-3 text-right font-medium">Value</th>
                  <th className="py-0.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="text-white/70">
                    <td className="py-0.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ background: sliceColor(r, colorByKey) }}
                        />
                        <span className="truncate">{r.ticker}</span>
                      </span>
                    </td>
                    <td className="py-0.5 pr-3 text-right tabular-nums text-white/45">
                      {r.shares != null ? r.shares : '—'}
                    </td>
                    <td className="py-0.5 pr-3 text-right tabular-nums text-white/70">
                      {formatSharePrice(rowPrice(r), currency)}
                    </td>
                    <td className="py-0.5 pr-3 text-right tabular-nums">
                      {formatMoney(r.value, currency)}
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-white/80">
                      {total > 0 ? formatPercent(r.value / total) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

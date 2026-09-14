import { useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { formatMoney, formatPercent } from '../../lib/format'
import { fromDisplay, toDisplay } from '../../lib/fx'
import {
  contributionInYearDisplay,
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
  cagrExCashFromStart as cagrExCash,
  growthExCash,
  targetCashInYear,
  targetCompoundStep,
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
  showTarget?: boolean
  lastStatedYear?: number
  /** Year-end totals in the active display currency (no Now). */
  yearTotals?: Map<number, number>
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

/** Stocks, then options, then other manuals, then cash. */
function breakdownRank(
  row: PortfolioChartBreakdownRow,
  holdingsById: Map<string, SavedPortfolio['holdings'][number]>,
): number {
  if (row.isCash) return 3
  const h = holdingsById.get(row.key)
  if (h?.option) return 1
  if (h?.manualOnly) return 2
  return 0
}

function sortBreakdown(
  rows: PortfolioChartBreakdownRow[],
  holdings: SavedPortfolio['holdings'],
  valueDir: 'asc' | 'desc',
): PortfolioChartBreakdownRow[] {
  const byId = new Map(holdings.map((h) => [h.id, h]))
  const sign = valueDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const kr = breakdownRank(a, byId) - breakdownRank(b, byId)
    if (kr !== 0) return kr
    if (a.value !== b.value) return (a.value - b.value) * sign
    return a.ticker.localeCompare(b.ticker, undefined, { sensitivity: 'base' })
  })
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
  showTarget = false,
  lastStatedYear,
  yearTotals,
  onClose,
}: Props) {
  const [valueDir, setValueDir] = useState<'asc' | 'desc'>('desc')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const rows = useMemo(
    () =>
      sortBreakdown(
        (point.breakdown ?? []).filter((r) => r.value !== 0),
        portfolio.holdings,
        valueDir,
      ),
    [point.breakdown, portfolio.holdings, valueDir],
  )

  useEffect(() => {
    setSelectedKey(null)
  }, [point.xKey])

  function toggleKey(key: string) {
    setSelectedKey((cur) => (cur === key ? null : key))
  }

  const total = point.total
  const currentYear = new Date().getFullYear()
  const year = point.year ?? currentYear
  const invested =
    contributions != null
      ? investedForRoiDisplay(
          contributions,
          year,
          currency,
          usdToChf,
          portfolio,
          currentYear,
          point.isNow,
        )
      : null
  const roi =
    invested != null && invested > 0 && Number.isFinite(total)
      ? simpleRoi(total, invested)
      : null

  const tc = showTarget ? portfolio.targetCompound : null
  const targetStep =
    tc != null && point.year != null && !point.isNow
      ? targetCompoundStep(
          fromDisplay(tc.amount, tc.currency, usdToChf),
          tc.ratePercent,
          tc.year,
          currentYear,
          point.year,
          portfolio,
          lastStatedYear ?? currentYear,
          contributions,
          usdToChf,
        )
      : null
  const money = (usd: number) => formatMoney(toDisplay(usd, currency, usdToChf), currency)
  const statedYear = lastStatedYear ?? currentYear
  const cashDispFor = (y: number) => {
    if (y < currentYear) {
      return contributionInYearDisplay(contributions, y, currency, usdToChf)
    }
    return toDisplay(
      targetCashInYear(
        portfolio,
        y,
        currentYear,
        statedYear,
        contributions,
        usdToChf,
      ),
      currency,
      usdToChf,
    )
  }
  const anchorDisp =
    tc != null
      ? toDisplay(fromDisplay(tc.amount, tc.currency, usdToChf), currency, usdToChf)
      : 0
  const priorTotal =
    point.year != null ? yearTotals?.get(point.year - 1) : undefined
  const priorForYear =
    priorTotal ??
    (tc != null && point.year === tc.year ? anchorDisp : undefined)
  const vsTypedAnchor =
    priorTotal == null && tc != null && point.year === tc.year
  const yearPerf =
    !point.isNow &&
    priorForYear != null &&
    Number.isFinite(total) &&
    point.year != null
      ? growthExCash(
          total,
          priorForYear,
          vsTypedAnchor ? 0 : cashDispFor(point.year),
        )
      : null
  const cagr =
    !point.isNow &&
    tc != null &&
    point.year != null &&
    point.year >= tc.year &&
    yearTotals != null
      ? cagrExCash(
          anchorDisp,
          yearTotals,
          cashDispFor,
          tc.year,
          point.year,
        )
      : null

  return (
    <div
      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"
      onClick={() => setSelectedKey(null)}
    >
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

      {targetStep ? (
        <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-2 text-[11px] text-white/55">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-300/80">
            Target
          </div>
          {targetStep.isAnchor ? (
            <div className="flex justify-between gap-4">
              <span>Anchor {targetStep.year}</span>
              <span className="tabular-nums text-red-300/90">
                {money(targetStep.targetUsd)}
              </span>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-4">
                <span>Prior year-end</span>
                <span className="tabular-nums">{money(targetStep.priorUsd ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Prior year-end × {targetStep.ratePercent}%</span>
                <span className="tabular-nums">{money(targetStep.grownUsd ?? 0)}</span>
              </div>
              {targetStep.cashLabel ? (
                <div className="flex justify-between gap-4">
                  <span>+ {targetStep.cashLabel}</span>
                  <span className="tabular-nums">{money(targetStep.cashUsd)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 text-white/80">
                <span>Target {targetStep.year}</span>
                <span className="tabular-nums text-red-300/90">
                  {money(targetStep.targetUsd)}
                </span>
              </div>
            </>
          )}
          {Number.isFinite(total) ? (
            <div className="flex justify-between gap-4">
              <span>vs this year</span>
              <span
                className={`tabular-nums ${
                  total - toDisplay(targetStep.targetUsd, currency, usdToChf) >= 0
                    ? 'text-emerald-300/90'
                    : 'text-rose-300/90'
                }`}
              >
                {formatMoney(
                  total - toDisplay(targetStep.targetUsd, currency, usdToChf),
                  currency,
                )}
              </span>
            </div>
          ) : null}
          {yearPerf != null ? (
            <div className="flex justify-between gap-4">
              <span>This year</span>
              <span
                className={`tabular-nums ${
                  yearPerf >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'
                }`}
              >
                {formatPercent(yearPerf)}
              </span>
            </div>
          ) : null}
          {cagr != null && tc != null ? (
            <div className="flex justify-between gap-4">
              <span>CAGR from {tc.year}</span>
              <span
                className={`tabular-nums ${
                  cagr >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'
                }`}
              >
                {formatPercent(cagr)}
              </span>
            </div>
          ) : null}
          <div className="border-b border-white/[0.06] pt-2" />
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        {rows.length > 0 && total > 0 ? (
          <div
            className="mx-auto h-44 w-44 shrink-0 sm:mx-0"
            onClick={(e) => {
              const tag = (e.target as Element).tagName
              if (tag === 'path') e.stopPropagation()
            }}
          >
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
                  cursor="pointer"
                  onClick={(_, index, e) => {
                    const ev = e as unknown as { stopPropagation?: () => void }
                    ev?.stopPropagation?.()
                    const r = rows[index]
                    if (r) toggleKey(r.key)
                  }}
                >
                  {rows.map((r) => {
                    const on = selectedKey === r.key
                    const dim = selectedKey != null && !on
                    return (
                      <Cell
                        key={r.key}
                        fill={sliceColor(r, colorByKey)}
                        fillOpacity={dim ? 0.28 : 1}
                        stroke={on ? 'rgba(255,255,255,0.85)' : 'rgba(11,15,20,0.6)'}
                        strokeWidth={on ? 2 : 1}
                      />
                    )
                  })}
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
                  <th className="py-0.5 pr-3 text-right font-medium">
                    <button
                      type="button"
                      className="font-medium text-emerald-300/90 hover:text-emerald-200"
                      onClick={(e) => {
                        e.stopPropagation()
                        setValueDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                      }}
                      title={valueDir === 'desc' ? 'Largest first' : 'Smallest first'}
                    >
                      Value{valueDir === 'desc' ? ' ↓' : ' ↑'}
                    </button>
                  </th>
                  <th className="py-0.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = selectedKey === r.key
                  const dim = selectedKey != null && !on
                  return (
                  <tr
                    key={r.key}
                    className={`cursor-pointer ${
                      on
                        ? 'bg-white/[0.12] text-white'
                        : dim
                          ? 'text-white/35 hover:bg-white/[0.04]'
                          : 'text-white/70 hover:bg-white/[0.04]'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleKey(r.key)
                    }}
                  >
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
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

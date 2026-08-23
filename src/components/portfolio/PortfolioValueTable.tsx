import { useMemo } from 'react'
import { formatMoney, formatPercent } from '../../lib/format'
import { InfoTip } from '../common/InfoTip'
import { toDisplay } from '../../lib/fx'
import {
  actionTradePrice,
  depositInYear,
  getActions,
  getOpeningCash,
  holdingDisplayName,
  holdingLiveValue,
} from '../../lib/portfolio'
import { investedForRoiDisplay, simpleRoi } from '../../lib/portfolioContributions'
import type {
  DisplayCurrency,
  PortfolioAction,
  PortfolioContributionsState,
  PortfolioGrid,
  PortfolioGridRow,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
} from '../../types'

type Props = {
  grid: PortfolioGrid
  portfolio?: SavedPortfolio | null
  scenarios?: SavedScenario[]
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
  contributions?: PortfolioContributionsState | null
}

/** Live "Now" values: opening cash + live holding values (matches chart Now bar). */
function buildNowValues(
  grid: PortfolioGrid,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
): (number | null)[] {
  const byScenario = new Map(scenarios.map((s) => [s.id, s]))
  const holdingsById = new Map(portfolio.holdings.map((h) => [h.id, h]))
  const opening = getOpeningCash(portfolio)
  const byKey = new Map<string, number | null>()

  let equitySum = 0
  for (const row of grid.rows) {
    if (row.kind === 'equity' && row.holdingId) {
      const h = holdingsById.get(row.holdingId)
      if (!h) {
        byKey.set(row.key, null)
        continue
      }
      const sc =
        h.scenarioId && !h.manualOnly ? (byScenario.get(h.scenarioId) ?? null) : null
      const v = holdingLiveValue(h, sc)
      byKey.set(row.key, v)
      if (v != null && Number.isFinite(v)) equitySum += v
    } else if (row.kind === 'cash') {
      byKey.set(row.key, opening)
    } else if (row.kind === 'growth') {
      byKey.set(row.key, null)
    }
  }

  for (const row of grid.rows) {
    if (row.kind === 'total') byKey.set(row.key, equitySum + opening)
  }

  return grid.rows.map((row) => byKey.get(row.key) ?? null)
}

export function PortfolioValueTable({
  grid,
  portfolio = null,
  scenarios = [],
  displayCurrency = 'USD',
  usdToChf = null,
  contributions = null,
}: Props) {
  const currentYear = new Date().getFullYear()
  const showNow = portfolio != null

  const nowValues = useMemo(() => {
    if (!portfolio) return null
    return buildNowValues(grid, portfolio, scenarios)
  }, [grid, portfolio, scenarios])

  if (grid.years.length === 0 && !showNow) {
    return (
      <p className="text-sm text-white/40">
        Add holdings with shares (or cash) to see portfolio values by year.
      </p>
    )
  }

  const cashRow = grid.rows.find((r) => r.kind === 'cash')
  const hasNegativeCash = cashRow?.values.some((v) => v != null && v < 0) ?? false

  // Column order: past years → Now → current/future years (matches chart)
  const pastYears = grid.years
    .map((y, i) => ({ y, i }))
    .filter(({ y }) => y < currentYear)
  const futureYears = grid.years
    .map((y, i) => ({ y, i }))
    .filter(({ y }) => y >= currentYear)

  function fmt(v: number) {
    return formatMoney(toDisplay(v, displayCurrency, usdToChf), displayCurrency)
  }

  function cellClass(row: PortfolioGridRow, v: number | null, isNowCol = false) {
    const negative = v != null && v < 0
    return `px-3 py-2 tabular-nums ${isNowCol ? 'bg-white/[0.04] ' : ''}${
      row.kind === 'total'
        ? 'text-emerald-300'
        : negative
          ? 'text-amber-300'
          : isNowCol
            ? 'text-white/90'
            : 'text-white/80'
    }`
  }

  function renderValue(
    v: number | null,
    hint?: string,
    side: 'top' | 'bottom' = 'bottom',
  ) {
    return (
      <span className="inline-flex items-center gap-1">
        {v == null ? <span className="text-white/20">—</span> : fmt(v)}
        {hint ? (
          <InfoTip
            label="Planned action this year"
            align="end"
            side={side}
            trigger="▸"
            panelClassName="!w-52 max-h-36 overflow-y-auto"
          >
            {hint.split('\n').map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </InfoTip>
        ) : null}
      </span>
    )
  }

  function cellTitle(
    row: PortfolioGridRow,
    year: number | null,
    isNow: boolean,
  ): string | undefined {
    if (!portfolio) return undefined
    return valueCellHint(row, year, isNow, portfolio, scenarios, fmt)
  }

  return (
    <div className="space-y-2">
      {hasNegativeCash && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Cash is negative in one or more years — planned buys exceed cash + deposits.
        </p>
      )}
      <div className="table-shell">
        <table className="min-w-[480px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-white/45">
            <tr>
              <th className="sticky left-0 z-10 bg-[#141a22] px-3 py-2 font-medium">Position</th>
              {pastYears.map(({ y }) => (
                <th key={y} className="px-3 py-2 font-medium tabular-nums">
                  {y}
                </th>
              ))}
              {showNow && (
                <th className="bg-white/[0.06] px-3 py-2 font-medium tabular-nums text-white/70">
                  Now
                </th>
              )}
              {futureYears.map(({ y }) => (
                <th key={y} className="px-3 py-2 font-medium tabular-nums">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, rowIdx) => (
              <tr
                key={`${row.key}::${row.label}`}
                className={`border-t border-white/5 ${
                  row.kind === 'total'
                    ? 'bg-emerald-500/10 font-semibold'
                    : row.kind === 'growth'
                      ? 'bg-emerald-500/5'
                      : row.kind === 'cash'
                        ? hasNegativeCash
                          ? 'bg-amber-500/5'
                          : 'bg-white/[0.02]'
                        : ''
                }`}
              >
                <td className="sticky left-0 z-10 bg-[#0f141b] px-3 py-2">
                  <div
                    className={
                      row.kind === 'total' || row.kind === 'growth'
                        ? 'text-emerald-300'
                        : 'text-white/90'
                    }
                    title={row.label}
                  >
                    {row.label}
                  </div>
                  {row.warning && (
                    <div className="text-[11px] text-amber-300/90">{row.warning}</div>
                  )}
                </td>
                {pastYears.map(({ y, i }) => {
                  const v = row.values[i] ?? null
                  const title = cellTitle(row, y, false)
                  const tipSide = row.kind === 'equity' ? 'bottom' : 'top'
                  return (
                    <td key={`${row.key}-${y}`} className={cellClass(row, v)}>
                      {renderValue(v, title, tipSide)}
                    </td>
                  )
                })}
                {showNow && nowValues && (
                  <td className={cellClass(row, nowValues[rowIdx] ?? null, true)}>
                    {renderValue(nowValues[rowIdx] ?? null)}
                  </td>
                )}
                {futureYears.map(({ y, i }) => {
                  const v = row.values[i] ?? null
                  const title = cellTitle(row, y, false)
                  const tipSide = row.kind === 'equity' ? 'bottom' : 'top'
                  return (
                    <td key={`${row.key}-${y}`} className={cellClass(row, v)}>
                      {renderValue(v, title, tipSide)}
                    </td>
                  )
                })}
              </tr>
            ))}
            {contributions ? (
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="sticky left-0 z-10 bg-[#0f141b] px-3 py-2 text-white/70">ROI</td>
                {pastYears.map(({ y, i }) => {
                  const total = grid.rows.find((r) => r.kind === 'total')?.values[i] ?? null
                  return (
                    <td key={`roi-${y}`} className="px-3 py-2 tabular-nums text-white/70">
                      {roiCell(total, contributions, y, displayCurrency, usdToChf, portfolio, false)}
                    </td>
                  )
                })}
                {showNow && nowValues ? (
                  <td className="bg-white/[0.04] px-3 py-2 tabular-nums text-white/80">
                    {roiCell(
                      nowValues[grid.rows.findIndex((r) => r.kind === 'total')] ?? null,
                      contributions,
                      currentYear,
                      displayCurrency,
                      usdToChf,
                      portfolio,
                      true,
                    )}
                  </td>
                ) : null}
                {futureYears.map(({ y, i }) => {
                  const total = grid.rows.find((r) => r.kind === 'total')?.values[i] ?? null
                  return (
                    <td key={`roi-${y}`} className="px-3 py-2 tabular-nums text-white/70">
                      {roiCell(total, contributions, y, displayCurrency, usdToChf, portfolio, false)}
                    </td>
                  )
                })}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmtQty(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function describeAction(
  a: PortfolioAction,
  holding: PortfolioHolding,
  scenarios: SavedScenario[],
  currentYear: number,
  fmt: (v: number) => string,
): string {
  const sc =
    holding.scenarioId && !holding.manualOnly
      ? (scenarios.find((s) => s.id === holding.scenarioId) ?? null)
      : null
  const px = actionTradePrice(a, holding, sc, currentYear)
  const name = holdingDisplayName(holding)
  const unit = holding.option ? 'contract' : 'sh'
  const cash = px != null && px > 0 ? a.shares * px : null
  if (a.type === 'sell') {
    return cash != null
      ? `Sell ${fmtQty(a.shares)} ${unit} of ${name} at ${fmt(px!)} → ${fmt(cash)} to Cash`
      : `Sell ${fmtQty(a.shares)} ${unit} of ${name} → proceeds to Cash`
  }
  return cash != null
    ? `Buy ${fmtQty(a.shares)} ${unit} of ${name} at ${fmt(px!)} → ${fmt(cash)} from Cash`
    : `Buy ${fmtQty(a.shares)} ${unit} of ${name} → paid from Cash`
}

function valueCellHint(
  row: PortfolioGridRow,
  year: number | null,
  isNow: boolean,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  fmt: (v: number) => string,
): string | undefined {
  if (isNow || year == null) return undefined
  const currentYear = new Date().getFullYear()
  const actions = getActions(portfolio)
  const holdingsById = new Map(portfolio.holdings.map((h) => [h.id, h]))
  const lines: string[] = []

  if (row.kind === 'equity' && row.holdingId) {
    const h = holdingsById.get(row.holdingId)
    if (!h) return undefined
    for (const a of actions) {
      if (a.holdingId !== h.id || a.year !== year || !(a.shares > 0)) continue
      lines.push(describeAction(a, h, scenarios, currentYear, fmt))
    }
  } else if (row.kind === 'cash') {
    const dep = depositInYear(portfolio, year, currentYear)
    if (dep > 0) lines.push(`Deposit ${fmt(dep)} this year`)
    const trades = actions.filter((a) => a.year === year && a.shares > 0)
    if (trades.some((a) => a.type === 'sell')) {
      lines.push('Sells add proceeds here')
    }
    if (trades.some((a) => a.type === 'buy')) {
      lines.push('Buys spend Cash')
    }
  }

  return lines.length ? lines.join('\n') : undefined
}

function roiCell(
  valueUsd: number | null,
  contributions: PortfolioContributionsState,
  year: number,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
  portfolio: SavedPortfolio | null,
  asOfNow: boolean,
): string {
  if (valueUsd == null || !Number.isFinite(valueUsd)) return '—'
  const invested = investedForRoiDisplay(
    contributions,
    year,
    displayCurrency,
    usdToChf,
    portfolio,
    new Date().getFullYear(),
    asOfNow,
  )
  if (invested == null || !(invested > 0)) return '—'
  const value = toDisplay(valueUsd, displayCurrency, usdToChf)
  const r = simpleRoi(value, invested)
  return r ? formatPercent(r.roi) : '—'
}

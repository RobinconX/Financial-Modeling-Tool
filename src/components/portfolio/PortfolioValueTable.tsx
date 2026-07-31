import { useMemo } from 'react'
import { formatMoney } from '../../lib/format'
import { toDisplay } from '../../lib/fx'
import { getOpeningCash, holdingLiveValue } from '../../lib/portfolio'
import type {
  DisplayCurrency,
  PortfolioGrid,
  PortfolioGridRow,
  SavedPortfolio,
  SavedScenario,
} from '../../types'

type Props = {
  grid: PortfolioGrid
  portfolio?: SavedPortfolio | null
  scenarios?: SavedScenario[]
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
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

  function renderValue(v: number | null) {
    if (v == null) return <span className="text-white/20">—</span>
    return fmt(v)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/40">
        <span className="text-white/55">Now</span> = live holdings + opening cash. Later columns are
        projections (cash includes deposits − buys + sells). Empty equity cells mean no projection
        that year. Values in {displayCurrency}.
      </p>
      {hasNegativeCash && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Cash is negative in one or more years — planned buys exceed cash + deposits. Allowed, but
          review your actions.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/45">
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
                  return (
                    <td key={`${row.key}-${y}`} className={cellClass(row, v)}>
                      {renderValue(v)}
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
                  return (
                    <td key={`${row.key}-${y}`} className={cellClass(row, v)}>
                      {renderValue(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

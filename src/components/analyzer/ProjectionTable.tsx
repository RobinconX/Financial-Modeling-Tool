import { useEffect, useMemo, useState } from 'react'
import { formatMoney, formatPercent, formatPrice } from '../../lib/format'
import {
  projectionYearsInPeriod,
  pruneProjectionFilterYears,
  sortProjectionRows,
  uniqueProjectionYears,
  visibleProjectionYears,
  type ProjectionSortDir,
  type ProjectionSortKey,
} from '../../lib/projectionRows'
import { impliedSharePrice } from '../../lib/sharePrice'
import type { ProjectionRow } from '../../types'

const BASIS_LABEL: Record<string, string> = {
  easy: 'Easy',
  ps: 'P/S',
  pfcf: 'P/FCF',
  pe: 'P/E',
}

type Props = {
  rows: ProjectionRow[]
  currency?: string
  sharesOutstanding?: number | null
}

export function ProjectionTable({
  rows,
  currency = 'USD',
  sharesOutstanding = null,
}: Props) {
  const allYears = useMemo(() => uniqueProjectionYears(rows), [rows])
  const [filterYears, setFilterYears] = useState<number[] | null>(null)
  const [sortKey, setSortKey] = useState<ProjectionSortKey>('year')
  const [sortDir, setSortDir] = useState<ProjectionSortDir>('asc')
  const [fromDraft, setFromDraft] = useState('')
  const [toDraft, setToDraft] = useState('')

  const yearsKey = allYears.join(',')
  useEffect(() => {
    setFilterYears((prev) => pruneProjectionFilterYears(prev, allYears))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prune when the year set changes
  }, [yearsKey])

  const selectedYears = useMemo(
    () => visibleProjectionYears(allYears, filterYears),
    [allYears, filterYears],
  )

  useEffect(() => {
    const lo = selectedYears[0]
    const hi = selectedYears[selectedYears.length - 1]
    setFromDraft(lo != null ? String(lo) : '')
    setToDraft(hi != null ? String(hi) : '')
  }, [yearsKey, selectedYears.join(',')])

  const visibleRows = useMemo(() => {
    const want = new Set(selectedYears)
    return sortProjectionRows(
      rows.filter((r) => want.has(r.year)),
      sortKey,
      sortDir,
    )
  }, [rows, selectedYears, sortKey, sortDir])

  if (rows.length === 0) {
    return (
      <p className="text-sm text-white/40">No projection rows yet — fill in the inputs above.</p>
    )
  }

  const showDilution = rows.some((r) => r.basis !== 'easy' && Math.abs(r.dilutionFactor - 1) >= 1e-9)
  const showPrice = sharesOutstanding != null && sharesOutstanding > 0
  const noneSelected = selectedYears.length === 0

  function applyPeriod(fromRaw: string, toRaw: string) {
    if (allYears.length === 0) return
    const from = Number(fromRaw)
    const to = Number(toRaw)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return
    const next = projectionYearsInPeriod(allYears, from, to)
    setFilterYears(next.length === allYears.length ? null : next)
  }

  function toggleYear(year: number) {
    const next = selectedYears.includes(year)
      ? selectedYears.filter((y) => y !== year)
      : [...selectedYears, year].sort((a, b) => a - b)
    setFilterYears(next.length === allYears.length ? null : next)
  }

  function handleSort(key: ProjectionSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'roi' ? 'desc' : 'asc')
  }

  function sortLabel(key: ProjectionSortKey, label: string) {
    if (sortKey !== key) return label
    return `${label}${sortDir === 'asc' ? ' ↑' : ' ↓'}`
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-white/40">
            Years
          </span>
          <label className="flex items-center gap-1 text-xs text-white/50">
            From
            <input
              className="input !w-[4.5rem] !py-1 !text-xs tabular-nums"
              type="number"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              onBlur={() => applyPeriod(fromDraft, toDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPeriod(fromDraft, toDraft)
              }}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-white/50">
            To
            <input
              className="input !w-[4.5rem] !py-1 !text-xs tabular-nums"
              type="number"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              onBlur={() => applyPeriod(fromDraft, toDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPeriod(fromDraft, toDraft)
              }}
            />
          </label>
          {allYears.map((y) => {
            const on = selectedYears.includes(y)
            return (
              <button
                key={y}
                type="button"
                className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums transition ${
                  on
                    ? 'bg-white/10 text-white/80'
                    : 'bg-transparent text-white/30 hover:text-white/55'
                }`}
                onClick={() => toggleYear(y)}
                aria-pressed={on}
              >
                {y}
              </button>
            )
          })}
          {selectedYears.length < allYears.length ? (
            <button
              type="button"
              className="btn-ghost !py-0.5 !text-[11px]"
              onClick={() => setFilterYears(null)}
            >
              All
            </button>
          ) : null}
          {selectedYears.length > 0 ? (
            <button
              type="button"
              className="btn-ghost !py-0.5 !text-[11px]"
              onClick={() => setFilterYears([])}
            >
              None
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-xs text-white/50">
            Sort
            <select
              className="input !w-auto !py-1 !text-xs"
              value={sortKey}
              onChange={(e) => handleSort(e.target.value as ProjectionSortKey)}
            >
              <option value="year">Year</option>
              <option value="basis">Basis</option>
              <option value="roi">ROI p.a.</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title={sortDir === 'asc' ? 'Low to high' : 'High to low'}
          >
            {sortDir === 'asc' ? 'Lowest' : 'Highest'}
          </button>
        </div>
      </div>

      {noneSelected ? (
        <p className="px-1 py-6 text-center text-sm text-white/40">
          No years selected — pick years above.
        </p>
      ) : (
        <div className="table-shell">
          <table className="min-w-[480px] text-sm">
            <thead className="text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    className={`uppercase tracking-wider ${
                      sortKey === 'year' ? 'text-emerald-300' : 'hover:text-white/70'
                    }`}
                    onClick={() => handleSort('year')}
                    title="Sort by year"
                  >
                    {sortLabel('year', 'Year')}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    className={`uppercase tracking-wider ${
                      sortKey === 'basis' ? 'text-emerald-300' : 'hover:text-white/70'
                    }`}
                    onClick={() => handleSort('basis')}
                    title="Sort by valuation basis"
                  >
                    {sortLabel('basis', 'Basis')}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Implied mcap</th>
                {showPrice && <th className="px-3 py-2 font-medium">Share price</th>}
                {showDilution && (
                  <>
                    <th className="px-3 py-2 font-medium">Shares vs today</th>
                    <th className="px-3 py-2 font-medium">Equity value</th>
                  </>
                )}
                <th className="px-3 py-2 font-medium">Total return</th>
                <th className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    className={`uppercase tracking-wider ${
                      sortKey === 'roi' ? 'text-emerald-300' : 'hover:text-white/70'
                    }`}
                    onClick={() => handleSort('roi')}
                    title="Sort by ROI p.a."
                  >
                    {sortLabel('roi', 'ROI p.a.')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const px = showPrice
                  ? impliedSharePrice(row.equityValue, sharesOutstanding)
                  : null
                return (
                  <tr
                    key={`${row.basis}-${row.year}`}
                    className="border-t border-white/5 text-white/85"
                  >
                    <td className="px-3 py-2 tabular-nums">{row.year}</td>
                    <td className="px-3 py-2">{BASIS_LABEL[row.basis] ?? row.basis}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatMoney(row.marketCap, currency)}
                    </td>
                    {showPrice && (
                      <td className="px-3 py-2 tabular-nums text-white/80">
                        {formatPrice(px, currency)}
                      </td>
                    )}
                    {showDilution && (
                      <>
                        <td className="px-3 py-2 tabular-nums text-white/70">
                          {row.basis === 'easy' || Math.abs(row.dilutionFactor - 1) < 1e-9
                            ? '—'
                            : `${row.dilutionFactor.toFixed(2)}×`}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.basis === 'easy' || Math.abs(row.dilutionFactor - 1) < 1e-9
                            ? '—'
                            : formatMoney(row.equityValue, currency)}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 tabular-nums">{formatPercent(row.totalReturn)}</td>
                    <td
                      className={`px-3 py-2 font-semibold tabular-nums ${
                        row.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {formatPercent(row.cagr)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

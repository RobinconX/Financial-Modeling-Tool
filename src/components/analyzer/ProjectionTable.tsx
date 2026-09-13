import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, formatPercent, formatPrice } from '../../lib/format'
import { normalizeFilterYears } from '../../lib/comparables'
import {
  normalizeFilterBases,
  sortProjectionRows,
  uniqueProjectionBases,
  uniqueProjectionYears,
  type ProjectionBasis,
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
  const allBases = useMemo(() => uniqueProjectionBases(rows), [rows])
  const [filterYears, setFilterYears] = useState<number[]>(() => uniqueProjectionYears(rows))
  const [filterBases, setFilterBases] = useState<ProjectionBasis[]>(() =>
    uniqueProjectionBases(rows),
  )
  const [sortKey, setSortKey] = useState<ProjectionSortKey>('year')
  const [sortDir, setSortDir] = useState<ProjectionSortDir>('asc')
  const [yearMenuOpen, setYearMenuOpen] = useState(false)
  const [basisMenuOpen, setBasisMenuOpen] = useState(false)
  const yearMenuRef = useRef<HTMLDivElement>(null)
  const basisMenuRef = useRef<HTMLDivElement>(null)

  const yearsKey = allYears.join(',')
  const basesKey = allBases.join(',')
  useEffect(() => {
    setFilterYears((prev) =>
      prev.length === 0 ? allYears : normalizeFilterYears(prev, allYears),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed / prune when the year set changes
  }, [yearsKey])

  useEffect(() => {
    setFilterBases((prev) =>
      prev.length === 0 ? allBases : normalizeFilterBases(prev, allBases),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed / prune when the basis set changes
  }, [basesKey])

  const selectedYears = useMemo(
    () => normalizeFilterYears(filterYears, allYears),
    [allYears, filterYears],
  )
  const selectedBases = useMemo(
    () => normalizeFilterBases(filterBases, allBases),
    [allBases, filterBases],
  )
  const addableYears = allYears.filter((y) => !selectedYears.includes(y))

  useEffect(() => {
    if (addableYears.length === 0) setYearMenuOpen(false)
  }, [addableYears.length])

  useEffect(() => {
    if (!yearMenuOpen && !basisMenuOpen) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (yearMenuRef.current?.contains(t) || basisMenuRef.current?.contains(t)) return
      setYearMenuOpen(false)
      setBasisMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setYearMenuOpen(false)
        setBasisMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [yearMenuOpen, basisMenuOpen])

  const visibleRows = useMemo(() => {
    const years = new Set(selectedYears)
    const bases = new Set(selectedBases)
    return sortProjectionRows(
      rows.filter((r) => years.has(r.year) && bases.has(r.basis)),
      sortKey,
      sortDir,
    )
  }, [rows, selectedYears, selectedBases, sortKey, sortDir])

  if (rows.length === 0) {
    return (
      <p className="text-sm text-white/40">No projection rows yet — fill in the inputs above.</p>
    )
  }

  const showDilution = visibleRows.some(
    (r) => r.basis !== 'easy' && Math.abs(r.dilutionFactor - 1) >= 1e-9,
  )
  const showPrice = sharesOutstanding != null && sharesOutstanding > 0
  const yearGroupOf: number[] = []
  {
    let g = 0
    for (let i = 0; i < visibleRows.length; i++) {
      if (i > 0 && visibleRows[i]!.year !== visibleRows[i - 1]!.year) g++
      yearGroupOf.push(g)
    }
  }
  const noneSelected = selectedYears.length === 0 || selectedBases.length === 0
  const emptyHint =
    selectedYears.length === 0 && selectedBases.length === 0
      ? 'No years or bases selected — pick filters above.'
      : selectedYears.length === 0
        ? 'No years selected — pick years above.'
        : 'No bases selected — pick bases above.'

  function toggleYear(year: number) {
    const next = selectedYears.includes(year)
      ? selectedYears.filter((y) => y !== year)
      : [...selectedYears, year].sort((a, b) => a - b)
    setFilterYears(next)
  }

  function toggleBasis(basis: ProjectionBasis) {
    const next = selectedBases.includes(basis)
      ? selectedBases.filter((b) => b !== basis)
      : [...selectedBases, basis]
    setFilterBases(normalizeFilterBases(next, allBases))
  }

  const basisSummary =
    selectedBases.length === 0
      ? 'None'
      : selectedBases.length === allBases.length
        ? 'All'
        : selectedBases.map((b) => BASIS_LABEL[b]).join(', ')

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
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/40">
          Years
        </span>
        {selectedYears.map((y) => (
          <button
            key={y}
            type="button"
            className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] tabular-nums text-white/80 transition hover:bg-white/15"
            onClick={() => toggleYear(y)}
            title={`Hide ${y}`}
          >
            {y}
            <span className="ml-1 text-white/35">×</span>
          </button>
        ))}
        {addableYears.length > 0 ? (
          <div className="relative" ref={yearMenuRef}>
            <button
              type="button"
              className="btn-ghost !py-0.5 !text-[11px]"
              aria-haspopup="listbox"
              aria-expanded={yearMenuOpen}
              aria-label="Add year"
              onClick={() => setYearMenuOpen((open) => !open)}
            >
              Add year
            </button>
            {yearMenuOpen ? (
              <ul
                className="absolute left-0 z-20 mt-1 max-h-56 min-w-[7rem] overflow-y-auto rounded-lg border border-white/10 bg-[#1a222c] py-1 shadow-xl"
                role="listbox"
                aria-label="Years to add"
              >
                {addableYears.map((y) => (
                  <li key={y} role="option">
                    <button
                      type="button"
                      className="w-full px-3 py-1 text-left text-[11px] tabular-nums text-white/80 hover:bg-white/10"
                      onClick={() => toggleYear(y)}
                    >
                      {y}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {allBases.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-white/40">
            Basis
          </span>
          <div className="relative" ref={basisMenuRef}>
            <button
              type="button"
              className="input !w-auto !py-0.5 !text-[11px]"
              aria-haspopup="listbox"
              aria-expanded={basisMenuOpen}
              aria-label="Filter valuation basis"
              onClick={() => setBasisMenuOpen((open) => !open)}
            >
              {basisSummary}
              <span className="ml-1.5 text-white/35">▾</span>
            </button>
            {basisMenuOpen ? (
              <ul
                className="absolute left-0 z-20 mt-1 min-w-[8.5rem] overflow-y-auto rounded-lg border border-white/10 bg-[#1a222c] py-1 shadow-xl"
                role="listbox"
                aria-multiselectable="true"
                aria-label="Valuation bases"
              >
                {allBases.map((b) => {
                  const on = selectedBases.includes(b)
                  return (
                    <li key={b} role="option" aria-selected={on}>
                      <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/10">
                        <input
                          type="checkbox"
                          className="h-3 w-3 accent-emerald-500"
                          checked={on}
                          onChange={() => toggleBasis(b)}
                        />
                        {BASIS_LABEL[b]}
                      </label>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {noneSelected ? (
        <p className="px-1 py-6 text-center text-sm text-white/40">{emptyHint}</p>
      ) : (
        <div className="table-shell overflow-x-auto">
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
                    title="Sort by CAGR"
                  >
                    {sortLabel('roi', 'CAGR')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => {
                const px = showPrice
                  ? impliedSharePrice(row.equityValue, sharesOutstanding)
                  : null
                const yearStart = i === 0 || visibleRows[i - 1]!.year !== row.year
                const yearGroup = yearGroupOf[i] ?? 0
                return (
                  <tr
                    key={`${row.basis}-${row.year}`}
                    className={`${
                      yearStart && i > 0
                        ? 'border-t-2 border-white/20'
                        : 'border-t border-white/[0.06]'
                    } ${yearGroup % 2 === 1 ? 'bg-white/[0.035]' : ''} text-white/85`}
                  >
                    <td
                      className={`px-3 py-2 tabular-nums ${
                        yearStart ? 'font-medium text-white' : 'text-transparent'
                      }`}
                    >
                      {row.year}
                    </td>
                    <td className="px-3 py-2">{BASIS_LABEL[row.basis] ?? row.basis}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatMoney(row.marketCap, currency)}
                    </td>
                    {showPrice && (
                      <td className="px-3 py-2 tabular-nums text-white/80">
                        {formatPrice(px, currency, 2)}
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
                    <td className="px-3 py-2 tabular-nums">{formatPercent(row.totalReturn, 2)}</td>
                    <td
                      className={`px-3 py-2 font-semibold tabular-nums ${
                        row.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {formatPercent(row.cagr, 2)}
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

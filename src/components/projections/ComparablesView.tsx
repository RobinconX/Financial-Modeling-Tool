import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ComparableBasis, SavedComparable, SavedScenario } from '../../types'
import {
  availableBases,
  buildComparableTable,
  defaultBasisForScenario,
  normalizeFilterYears,
  pruneComparableEntries,
  sortComparableRows,
  visibleComparableYears,
  yearsInPeriod,
} from '../../lib/comparables'
import {
  buildGoalGapTable,
  resolveGoalYear,
  unionEasyYears,
} from '../../lib/goalGap'
import {
  fetchPriceHistoryClient,
  isHistoryFresh,
  type CachedPriceHistory,
} from '../../lib/priceHistory'
import {
  loadCachedPriceHistory,
  saveCachedPriceHistory,
} from '../../lib/priceHistoryStorage'
import { groupScenariosByTicker } from '../../lib/storage'
import { formatPercent, formatPrice } from '../../lib/format'
import { InfoTip } from '../common/InfoTip'
import { GoalGapSection, OVERLAY_COLORS } from './GoalGapSection'

const SELECTED_KEY = 'grok-lab-selected-comparable'

const BASIS_LABEL: Record<ComparableBasis, string> = {
  easy: 'Easy',
  ps: 'P/S',
  pfcf: 'P/FCF',
  pe: 'P/E',
}

type Props = {
  scenarios: SavedScenario[]
  comparables: SavedComparable[]
  storageError: string | null
  createComparable: (name?: string) => SavedComparable | null
  updateComparable: (id: string, patch: Partial<SavedComparable>) => boolean
  deleteComparable: (id: string) => boolean
  onOpenProjection?: (scenarioId: string, basis: ComparableBasis) => void
}

function readSelectedId(list: SavedComparable[]): string | null {
  try {
    const v = localStorage.getItem(SELECTED_KEY)
    if (v && list.some((c) => c.id === v)) return v
  } catch {
    /* ignore */
  }
  return list[0]?.id ?? null
}

export function ComparablesView({
  scenarios,
  comparables,
  storageError,
  createComparable,
  updateComparable,
  deleteComparable,
  onOpenProjection,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedId(comparables))
  const [query, setQuery] = useState('')
  const [overlayIds, setOverlayIds] = useState<string[]>([])
  const [histories, setHistories] = useState<Record<string, CachedPriceHistory>>({})
  const [histLoading, setHistLoading] = useState<Set<string>>(() => new Set())
  const [histErrors, setHistErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (selectedId && comparables.some((c) => c.id === selectedId)) return
    setSelectedId(comparables[0]?.id ?? null)
  }, [comparables, selectedId])

  useEffect(() => {
    if (!selectedId) return
    try {
      localStorage.setItem(SELECTED_KEY, selectedId)
    } catch {
      /* ignore */
    }
  }, [selectedId])

  const selected = comparables.find((c) => c.id === selectedId) ?? null
  const entries = selected?.entries ?? []
  const selectedIds = useMemo(() => new Set(entries.map((e) => e.scenarioId)), [entries])

  const table = useMemo(
    () => buildComparableTable(entries, scenarios),
    [entries, scenarios],
  )
  const selectedYears = useMemo(
    () => visibleComparableYears(table.years, selected?.filterYears),
    [table.years, selected?.filterYears],
  )
  const sortYear =
    selected?.sortYear != null && table.years.includes(selected.sortYear)
      ? selected.sortYear
      : null
  const visibleYears = useMemo(() => {
    if (sortYear != null && !selectedYears.includes(sortYear)) {
      return [...selectedYears, sortYear].sort((a, b) => a - b)
    }
    return selectedYears
  }, [selectedYears, sortYear])
  const sortDir = selected?.sortDir ?? 'desc'
  const sortedRows = useMemo(
    () => sortComparableRows(table.rows, sortYear, sortDir),
    [table.rows, sortYear, sortDir],
  )

  const horizonYears = useMemo(
    () => unionEasyYears(entries, scenarios),
    [entries, scenarios],
  )
  const goalYear = resolveGoalYear(selected?.goalYear, horizonYears)
  const gapRows = useMemo(
    () => buildGoalGapTable(entries, scenarios, goalYear),
    [entries, scenarios, goalYear],
  )
  const gapSymbols = useMemo(
    () => [...new Set(gapRows.map((r) => r.symbol.toUpperCase()).filter(Boolean))],
    [gapRows],
  )

  useEffect(() => {
    setOverlayIds([])
  }, [selectedId])

  useEffect(() => {
    if (gapSymbols.length === 0) return
    let cancelled = false
    const stale: string[] = []
    const next: Record<string, CachedPriceHistory> = {}
    for (const symbol of gapSymbols) {
      const cached = loadCachedPriceHistory(symbol)
      if (cached) next[symbol] = cached
      if (!cached || !isHistoryFresh(cached.fetchedAt)) stale.push(symbol)
    }
    setHistories((prev) => ({ ...prev, ...next }))
    if (stale.length === 0) return

    setHistLoading((prev) => {
      const s = new Set(prev)
      for (const symbol of stale) s.add(symbol)
      return s
    })
    void Promise.all(
      stale.map(async (symbol) => {
        try {
          const result = await fetchPriceHistoryClient(symbol)
          if (cancelled) return
          const cached: CachedPriceHistory = {
            ...result,
            fetchedAt: new Date().toISOString(),
          }
          saveCachedPriceHistory(cached)
          setHistories((prev) => ({ ...prev, [symbol]: cached }))
          setHistErrors((prev) => {
            const n = { ...prev }
            delete n[symbol]
            return n
          })
        } catch (err) {
          if (cancelled) return
          const message = err instanceof Error ? err.message : `No history for ${symbol}`
          if (/VITE_API_BASE|Network error|dev server/i.test(message)) {
            setHistErrors((prev) => ({ ...prev, [symbol]: message }))
          }
        } finally {
          if (cancelled) return
          setHistLoading((prev) => {
            const s = new Set(prev)
            s.delete(symbol)
            return s
          })
        }
      }),
    )
    return () => {
      cancelled = true
    }
  }, [gapSymbols.join(',')])

  const [fromDraft, setFromDraft] = useState('')
  const [toDraft, setToDraft] = useState('')
  useEffect(() => {
    const years = visibleComparableYears(table.years, selected?.filterYears)
    const lo = years[0]
    const hi = years[years.length - 1]
    setFromDraft(lo != null ? String(lo) : '')
    setToDraft(hi != null ? String(hi) : '')
  }, [selected?.id, table.years.join(',')])

  const grouped = useMemo(() => groupScenariosByTicker(scenarios), [scenarios])
  const q = query.trim().toLowerCase()
  const filteredGroups = useMemo(() => {
    if (!q) return grouped
    return grouped
      .map((g) => ({
        ...g,
        scenarios: g.scenarios.filter(
          (s) =>
            s.symbol.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            (s.companyName ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.scenarios.length > 0 || g.symbol.toLowerCase().includes(q))
  }, [grouped, q])

  function patchSelected(patch: Partial<SavedComparable>) {
    if (!selected) return
    updateComparable(selected.id, patch)
  }

  function handleNew() {
    const created = createComparable(`Comparable ${comparables.length + 1}`)
    if (created) setSelectedId(created.id)
  }

  function toggleScenario(sc: SavedScenario) {
    if (!selected) return
    if (selectedIds.has(sc.id)) {
      patchSelected({ entries: entries.filter((e) => e.scenarioId !== sc.id) })
      return
    }
    patchSelected({
      entries: pruneComparableEntries(
        [...entries, { scenarioId: sc.id, basis: defaultBasisForScenario(sc) }],
        scenarios,
      ),
    })
  }

  function setBasis(scenarioId: string, basis: ComparableBasis) {
    patchSelected({
      entries: entries.map((e) => (e.scenarioId === scenarioId ? { ...e, basis } : e)),
    })
  }

  function handleSort(year: number) {
    if (!selected) return
    if (selected.sortYear === year) {
      patchSelected({ sortYear: year, sortDir: sortDir === 'desc' ? 'asc' : 'desc' })
      return
    }
    patchSelected({ sortYear: year, sortDir: 'desc' })
  }

  function applyPeriod(fromRaw: string, toRaw: string) {
    if (!selected || table.years.length === 0) return
    const from = Number(fromRaw)
    const to = Number(toRaw)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return
    const start = Math.min(from, to)
    const end = Math.max(from, to)
    patchSelected({
      filterYears: normalizeFilterYears(yearsInPeriod(table.years, start, end), table.years),
    })
  }

  function toggleYear(year: number) {
    if (!selected) return
    const next = selectedYears.includes(year)
      ? selectedYears.filter((y) => y !== year)
      : [...selectedYears, year].sort((a, b) => a - b)
    patchSelected({ filterYears: normalizeFilterYears(next, table.years) })
  }

  function showAllYears() {
    if (!selected) return
    patchSelected({ filterYears: [...table.years] })
  }

  function clearYears() {
    if (!selected) return
    patchSelected({ filterYears: [] })
  }

  if (scenarios.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-white/40">
        Save a projection in Analyze first — they appear here to compare.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {storageError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {storageError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-white/50">
          Set
          <select
            className="input !w-[14rem] !max-w-full !py-1 !text-xs"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
            aria-label="Comparable set"
          >
            {comparables.length === 0 ? (
              <option value="">No sets yet</option>
            ) : (
              comparables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </label>
        <InfoTip label="About comparables">
          Pick saved projections to compare. Add year columns you want (none are on by default).
          Year figures are year-end. Sort by a year’s ROI to rank names. Click a row for remaining
          upside vs the Easy goal; click the name to open the projection.
        </InfoTip>
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={handleNew}>
          + New
        </button>
        {selected ? (
          <>
            <input
              className="input !w-[10rem] !py-1 !text-xs"
              value={selected.name}
              onChange={(e) => patchSelected({ name: e.target.value })}
              aria-label="Rename comparable set"
            />
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs text-red-300/80"
              onClick={() => {
                if (!confirm(`Delete comparable “${selected.name}”?`)) return
                deleteComparable(selected.id)
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <span className="text-[11px] text-white/40">Create a comparable to pick scenarios.</span>
        )}
      </div>

      {selected ? (
        <>
          <div>
            <label className="label !mb-1">Scenarios</label>
            <input
              className="input mb-2 !max-w-xs !py-1.5 !text-xs"
              placeholder="Filter ticker or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/20 px-2 py-2">
              {filteredGroups.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-white/40">No matching projections.</p>
              ) : (
                filteredGroups.map((g) => (
                  <div key={g.symbol}>
                    <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
                      {g.symbol}
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                      {g.scenarios.map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs text-white/80 hover:bg-white/5"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-emerald-500"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleScenario(s)}
                          />
                          <span className="truncate">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {sortedRows.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-white/40">
              Pick scenarios above to build the table.
            </p>
          ) : (
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
                  {table.years.map((y) => {
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
                  {selectedYears.length < table.years.length ? (
                    <button
                      type="button"
                      className="btn-ghost !py-0.5 !text-[11px]"
                      onClick={showAllYears}
                    >
                      All
                    </button>
                  ) : null}
                  {selectedYears.length > 0 ? (
                    <button
                      type="button"
                      className="btn-ghost !py-0.5 !text-[11px]"
                      onClick={clearYears}
                    >
                      None
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-white/50">
                    Sort by ROI
                    <select
                      className="input !w-auto !py-1 !text-xs"
                      value={sortYear ?? ''}
                      disabled={table.years.length === 0}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (!raw) {
                          patchSelected({ sortYear: null })
                          return
                        }
                        const y = Number(raw)
                        if (!Number.isFinite(y)) return
                        patchSelected({ sortYear: y, sortDir: 'desc' })
                      }}
                    >
                      <option value="">—</option>
                      {table.years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-ghost !py-1 !text-xs"
                    disabled={sortYear == null}
                    onClick={() => sortYear != null && handleSort(sortYear)}
                    title={sortDir === 'asc' ? 'Lowest first' : 'Highest first'}
                  >
                    {sortDir === 'asc' ? 'Lowest' : 'Highest'}
                  </button>
                </div>
              </div>

              <div className="table-shell overflow-x-auto">
                <table className="min-w-[640px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-white/45">
                    <tr>
                      <th className="sticky left-0 z-10 bg-[#121820] px-3 py-2 text-left font-medium">
                        Ticker / scenario
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Price now</th>
                      {visibleYears.map((y, yi) => {
                        const active = sortYear === y
                        return (
                          <th
                            key={y}
                            className={`border-l px-3 py-2 text-right font-medium ${
                              yi % 2 === 1 ? 'bg-white/[0.03]' : ''
                            } ${
                              active
                                ? 'border-emerald-500/25 text-emerald-300/90'
                                : 'border-white/12'
                            }`}
                            colSpan={active ? 3 : 2}
                          >
                            <span className="tabular-nums">{y}</span>
                            {active ? (
                              <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-emerald-300/70">
                                EOY
                              </span>
                            ) : null}
                          </th>
                        )
                      })}
                    </tr>
                    <tr className="text-[10px] text-white/35">
                      <th className="sticky left-0 z-10 bg-[#121820]" />
                      <th />
                      {visibleYears.map((y, yi) => {
                        const active = sortYear === y
                        const tone = `${yi % 2 === 1 ? 'bg-white/[0.03]' : ''} ${
                          active ? 'border-emerald-500/25' : 'border-white/12'
                        }`
                        return (
                          <Fragment key={`h-${y}`}>
                            <th
                              className={`border-l px-3 py-1 text-right font-normal ${tone}`}
                            >
                              <span className="mr-1 tabular-nums text-white/30">{y}</span>
                              Price
                            </th>
                            <th className={`px-3 py-1 text-right font-normal ${tone}`}>
                              <button
                                type="button"
                                className={`uppercase tracking-wide ${
                                  active
                                    ? 'font-semibold text-emerald-300'
                                    : 'text-white/40 hover:text-white/70'
                                }`}
                                onClick={() => handleSort(y)}
                                title="Sort by ROI this year"
                              >
                                ROI{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                              </button>
                            </th>
                            {active ? (
                              <th
                                className={`px-3 py-1 text-right font-normal text-emerald-300/80 ${tone}`}
                              >
                                ROI p.a.
                              </th>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => {
                      const sc = scenarios.find((s) => s.id === row.scenarioId)
                      const bases = sc ? availableBases(sc) : [row.basis]
                      const on = overlayIds.includes(row.scenarioId)
                      const colorIdx = overlayIds.indexOf(row.scenarioId)
                      return (
                        <tr
                          key={row.scenarioId}
                          className={`group cursor-pointer border-t border-white/5 text-white/85 hover:bg-white/[0.04] ${
                            on ? 'bg-emerald-500/[0.08]' : ''
                          }`}
                          onClick={() => {
                            setOverlayIds((prev) =>
                              prev.includes(row.scenarioId)
                                ? prev.filter((id) => id !== row.scenarioId)
                                : [...prev, row.scenarioId],
                            )
                          }}
                        >
                          <td className="sticky left-0 z-10 bg-[#121820] px-3 py-2 group-hover:bg-[#141a22]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {on ? (
                                <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                                  style={{
                                    background:
                                      OVERLAY_COLORS[colorIdx % OVERLAY_COLORS.length],
                                  }}
                                />
                              ) : null}
                              <button
                                type="button"
                                className="font-medium text-left hover:underline"
                                title="Open projection"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onOpenProjection?.(row.scenarioId, row.basis)
                                }}
                              >
                                {row.label}
                              </button>
                              {bases.length > 1 ? (
                                <select
                                  className="input !w-auto !py-0.5 !text-[10px]"
                                  value={row.basis}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setBasis(row.scenarioId, e.target.value as ComparableBasis)
                                  }
                                  aria-label={`Basis for ${row.label}`}
                                >
                                  {bases.map((b) => (
                                    <option key={b} value={b}>
                                      {BASIS_LABEL[b]}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[10px] text-white/35">
                                  {BASIS_LABEL[row.basis]}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatPrice(row.priceNow, row.currency)}
                          </td>
                          {visibleYears.map((y, yi) => {
                            const cell = row.byYear[y]
                            const isSort = sortYear === y
                            const tone = `${yi % 2 === 1 ? 'bg-white/[0.03]' : ''} ${
                              isSort ? 'border-emerald-500/20' : 'border-white/10'
                            }`
                            return (
                              <Fragment key={`${row.scenarioId}-${y}`}>
                                <td
                                  className={`border-l px-3 py-2 text-right tabular-nums text-white/80 ${tone}`}
                                >
                                  {formatPrice(cell?.price ?? null, row.currency)}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right tabular-nums ${tone} ${
                                    isSort ? 'text-emerald-300/90' : ''
                                  }`}
                                >
                                  {formatPercent(cell?.roi ?? null)}
                                </td>
                                {isSort ? (
                                  <td
                                    className={`px-3 py-2 text-right tabular-nums text-emerald-300/90 ${tone}`}
                                  >
                                    {formatPercent(cell?.cagr ?? null)}
                                  </td>
                                ) : null}
                              </Fragment>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {overlayIds.length === 0 ? (
                <p className="text-[11px] text-white/35">
                  Click a row for remaining upside. Click the name to open the projection.
                </p>
              ) : (
                <GoalGapSection
                  overlayIds={overlayIds}
                  onClear={() => setOverlayIds([])}
                  rows={gapRows}
                  scenarios={scenarios}
                  goalYear={goalYear}
                  histories={histories}
                  loadingSymbols={histLoading}
                  errors={histErrors}
                />
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ComparableBasis, SavedComparable, SavedScenario } from '../../types'
import {
  availableBases,
  buildComparableTable,
  defaultBasisForScenario,
  nextSortYear,
  normalizeFilterYears,
  pruneComparableEntries,
  sortComparableRows,
  visibleComparableYears,
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
import { ConfirmDialog } from '../common/ConfirmDialog'
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
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const [yearMenuOpen, setYearMenuOpen] = useState(false)
  const yearMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedId && comparables.some((c) => c.id === selectedId)) return
    setSelectedId(comparables[0]?.id ?? null)
    setRenaming(false)
  }, [comparables, selectedId])

  useEffect(() => {
    if (!renaming) return
    const el = renameRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renaming])

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
    selected?.sortYear != null && selectedYears.includes(selected.sortYear)
      ? selected.sortYear
      : null
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
    setYearMenuOpen(false)
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

  function startRename() {
    if (!selected) return
    setRenameDraft(selected.name)
    setRenaming(true)
  }

  function commitRename() {
    const trimmed = renameDraft.trim()
    if (trimmed && selected) patchSelected({ name: trimmed })
    setRenaming(false)
  }

  function handleNew() {
    const created = createComparable(`Comparable ${comparables.length + 1}`)
    if (created) {
      setSelectedId(created.id)
      setRenameDraft(created.name)
      setRenaming(true)
    }
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

  function toggleOverlay(id: string) {
    setOverlayIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function toggleYear(year: number) {
    if (!selected) return
    const removing = selectedYears.includes(year)
    const next = removing
      ? selectedYears.filter((y) => y !== year)
      : [...selectedYears, year].sort((a, b) => a - b)
    const patch: Partial<SavedComparable> = {
      filterYears: normalizeFilterYears(next, table.years),
    }
    if (removing && selected.sortYear === year) {
      patch.sortYear = nextSortYear(next, year)
    }
    patchSelected(patch)
  }

  const addableYears = table.years.filter((y) => !selectedYears.includes(y))

  useEffect(() => {
    if (addableYears.length === 0) setYearMenuOpen(false)
  }, [addableYears.length])

  useEffect(() => {
    if (!yearMenuOpen) return
    function onDoc(e: MouseEvent) {
      if (yearMenuRef.current?.contains(e.target as Node)) return
      setYearMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setYearMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [yearMenuOpen])

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
          {renaming && selected ? (
            <input
              ref={renameRef}
              className="input !w-[14rem] !max-w-full !py-1 !text-xs"
              value={renameDraft}
              aria-label="Rename comparable set"
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  setRenameDraft(selected.name)
                  setRenaming(false)
                }
              }}
            />
          ) : (
            <select
              className="input !w-[14rem] !max-w-full !cursor-text !py-1 !text-xs"
              value={selectedId ?? ''}
              onChange={(e) => {
                setRenaming(false)
                setSelectedId(e.target.value || null)
              }}
              onDoubleClick={(e) => {
                e.preventDefault()
                startRename()
              }}
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
          )}
        </label>
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={handleNew}>
          + New
        </button>
        {selected ? (
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs text-red-300/80"
            onClick={() => setPendingDelete({ id: selected.id, name: selected.name })}
          >
            Delete
          </button>
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

              <div className="table-shell overflow-x-auto">
                <table className="min-w-[640px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-white/45">
                    <tr>
                      <th className="sticky left-0 z-10 bg-[#121820] px-3 py-2 text-left font-medium">
                        Ticker / scenario
                        <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-white/40">
                          Tick to chart remaining upside
                        </span>
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Price now</th>
                      {selectedYears.map((y, yi) => {
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
                      {selectedYears.map((y, yi) => {
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
                                CAGR
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
                          onClick={() => toggleOverlay(row.scenarioId)}
                        >
                          <td className="sticky left-0 z-10 bg-[#121820] px-3 py-2 group-hover:bg-[#141a22]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 shrink-0 accent-emerald-500"
                                checked={on}
                                title="Chart remaining upside"
                                aria-label={`Chart remaining upside for ${row.label}`}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleOverlay(row.scenarioId)}
                              />
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
                            {formatPrice(row.priceNow, row.currency, 2)}
                          </td>
                          {selectedYears.map((y, yi) => {
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
                                  {formatPrice(cell?.price ?? null, row.currency, 2)}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right tabular-nums ${tone} ${
                                    isSort ? 'text-emerald-300/90' : ''
                                  }`}
                                >
                                  {formatPercent(cell?.roi ?? null, 2)}
                                </td>
                                {isSort ? (
                                  <td
                                    className={`px-3 py-2 text-right tabular-nums text-emerald-300/90 ${tone}`}
                                  >
                                    {formatPercent(cell?.cagr ?? null, 2)}
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
                <p className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-sm text-white/55">
                  Tick a row to chart remaining upside vs today. Click the name to open the
                  projection.
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

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete comparable"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteComparable(pendingDelete.id)
            setPendingDelete(null)
          }}
        >
          <p>
            <span className="font-semibold text-white">{pendingDelete.name}</span>
          </p>
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

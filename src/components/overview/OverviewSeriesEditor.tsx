import { useMemo, useState } from 'react'
import type {
  CashflowScenario,
  OverviewSeries,
  OverviewSeriesType,
  OverviewYearBinding,
  SavedPortfolio,
  SavingsAccount,
} from '../../types'
import { scenarioDisplayName } from '../../lib/incomeCost'
import {
  assignOverviewSeriesColors,
  getYearBindings,
  isPermanentLeftover,
  normalizeHexColor,
  shadesForType,
  sourceLabel,
} from '../../lib/overview'

type Props = {
  series: OverviewSeries[]
  portfolios: SavedPortfolio[]
  savingsAccounts: SavingsAccount[]
  incomeCostScenarios?: CashflowScenario[]
  onAdd: (type: OverviewSeriesType) => void
  /** Add a specific savings account as an overview series */
  onAddSavings: (accountId: string) => void
  onUpdate: (id: string, patch: Partial<OverviewSeries>) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  /** Reorder groups: "savings" or series id — matches bar chart stack order */
  onReorderGroups: (groupKeys: string[]) => void
  /** Reorder savings accounts within the savings group */
  onReorderSavings: (orderedIds: string[]) => void
}

type DisplayGroup =
  | { key: string; kind: 'savings'; series: OverviewSeries[] }
  | { key: string; kind: 'series'; series: OverviewSeries }

function buildDisplayGroups(series: OverviewSeries[]): DisplayGroup[] {
  const savings = series
    .filter((s) => s.type === 'savings')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const others = series.filter((s) => s.type !== 'savings')
  type Row = { order: number; group: DisplayGroup }
  const rows: Row[] = []
  if (savings.length > 0) {
    rows.push({
      order: Math.min(...savings.map((s) => s.sortOrder)),
      group: { key: 'savings', kind: 'savings', series: savings },
    })
  }
  for (const s of others) {
    rows.push({
      order: s.sortOrder,
      group: { key: s.id, kind: 'series', series: s },
    })
  }
  return rows.sort((a, b) => a.order - b.order).map((r) => r.group)
}

function YearBindingsEditor({
  series,
  incomeCostScenarios,
  withPercent,
  onChange,
}: {
  series: OverviewSeries
  incomeCostScenarios: CashflowScenario[]
  withPercent: boolean
  onChange: (bindings: OverviewYearBinding[]) => void
}) {
  const bindings = getYearBindings(series)

  function setBindings(next: OverviewYearBinding[]) {
    onChange([...next].sort((a, b) => a.year - b.year))
  }

  return (
    <div className="sm:col-span-2 lg:col-span-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="label !mb-0 !text-[10px]">
          {withPercent ? 'Year → Income/Cost → % for this position' : 'Year → Income/Cost (feeds pool)'}
        </label>
        <button
          type="button"
          className="btn-ghost !py-0.5 !text-[11px]"
          onClick={() => {
            const lastY =
              bindings.length > 0
                ? bindings[bindings.length - 1]!.year
                : (series.baseYear ?? new Date().getFullYear())
            const sc =
              incomeCostScenarios.find((c) => c.year === lastY + 1) ?? incomeCostScenarios[0]
            setBindings([
              ...bindings,
              {
                year: lastY + 1,
                incomeCostScenarioId: sc?.id ?? '',
                ...(withPercent ? { percent: 100 } : {}),
              },
            ])
          }}
        >
          + Year
        </button>
      </div>
      {bindings.length === 0 ? (
        <p className="text-[11px] text-white/40">
          {withPercent
            ? 'Add year rows to allocate IC cash to this position (unclaimed % → leftover).'
            : 'Optional: bind years so leftover receives IC residual not claimed by manuals.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {bindings.map((b, idx) => (
            <div
              key={`${b.year}-${b.incomeCostScenarioId}-${idx}`}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                className="input !w-20 !py-1 !text-xs tabular-nums"
                type="number"
                value={b.year}
                onChange={(e) => {
                  const y = Math.floor(Number(e.target.value))
                  setBindings(
                    bindings.map((row, i) =>
                      i === idx ? { ...row, year: Number.isFinite(y) ? y : row.year } : row,
                    ),
                  )
                }}
              />
              <select
                className="input min-w-[9rem] flex-1 !py-1 !text-xs"
                value={b.incomeCostScenarioId}
                onChange={(e) => {
                  const id = e.target.value
                  const sc = incomeCostScenarios.find((c) => c.id === id)
                  setBindings(
                    bindings.map((row, i) =>
                      i === idx
                        ? {
                            ...row,
                            year: sc?.year ?? row.year,
                            incomeCostScenarioId: id,
                          }
                        : row,
                    ),
                  )
                }}
              >
                <option value="">Select…</option>
                {incomeCostScenarios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {scenarioDisplayName(c)}
                  </option>
                ))}
              </select>
              {withPercent && (
                <div className="relative w-16 shrink-0">
                  <input
                    className="input !py-1 !pr-5 !text-xs tabular-nums"
                    type="text"
                    inputMode="decimal"
                    placeholder="%"
                    value={b.percent != null && b.percent !== 0 ? String(b.percent) : ''}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/%/g, ''))
                      setBindings(
                        bindings.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                percent: Number.isFinite(n)
                                  ? Math.max(0, Math.min(100, n))
                                  : 0,
                              }
                            : row,
                        ),
                      )
                    }}
                  />
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/35">
                    %
                  </span>
                </div>
              )}
              <button
                type="button"
                className="btn-ghost !py-0.5 !text-[11px] text-red-300/80"
                onClick={() => setBindings(bindings.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OverviewSeriesEditor({
  series,
  portfolios,
  savingsAccounts,
  incomeCostScenarios = [],
  onAdd,
  onAddSavings,
  onUpdate,
  onToggle,
  onRemove,
  onReorderGroups,
  onReorderSavings,
}: Props) {
  const resolvedColors = assignOverviewSeriesColors(series)
  const hasPortfolioSeries = series.some(
    (s) => s.enabled && s.type === 'portfolio' && s.portfolioId,
  )
  const displayGroups = useMemo(() => buildDisplayGroups(series), [series])
  const usedSavingsIds = new Set(
    series
      .filter((s) => s.type === 'savings')
      .map((s) => s.savingsAccountId)
      .filter(Boolean) as string[],
  )
  const availableSavings = savingsAccounts.filter((a) => !usedSavingsIds.has(a.id))

  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null)
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null)
  const [dragSavingsId, setDragSavingsId] = useState<string | null>(null)
  const [dragOverSavingsId, setDragOverSavingsId] = useState<string | null>(null)
  /** Group keys that are expanded (default: collapsed for cleaner list). */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function isGroupOpen(key: string): boolean {
    return expanded[key] === true
  }

  function toggleGroupOpen(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function updateBindings(seriesId: string, bindings: OverviewYearBinding[]) {
    onUpdate(seriesId, {
      yearBindings: [...bindings].sort((a, b) => a.year - b.year),
      incomeCostScenarioId: null,
    })
  }

  function dropGroupOn(targetKey: string) {
    if (!dragGroupKey || dragGroupKey === targetKey) {
      setDragGroupKey(null)
      setDragOverGroupKey(null)
      return
    }
    const keys = displayGroups.map((g) => g.key)
    const from = keys.indexOf(dragGroupKey)
    const to = keys.indexOf(targetKey)
    if (from < 0 || to < 0) {
      setDragGroupKey(null)
      setDragOverGroupKey(null)
      return
    }
    const next = [...keys]
    next.splice(from, 1)
    next.splice(to, 0, dragGroupKey)
    onReorderGroups(next)
    setDragGroupKey(null)
    setDragOverGroupKey(null)
  }

  function dropSavingsOn(targetId: string, savingsList: OverviewSeries[]) {
    if (!dragSavingsId || dragSavingsId === targetId) {
      setDragSavingsId(null)
      setDragOverSavingsId(null)
      return
    }
    const ids = savingsList.map((s) => s.id)
    const from = ids.indexOf(dragSavingsId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) {
      setDragSavingsId(null)
      setDragOverSavingsId(null)
      return
    }
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragSavingsId)
    onReorderSavings(next)
    setDragSavingsId(null)
    setDragOverSavingsId(null)
  }

  function renderSavingsGroup(savingsSeries: OverviewSeries[], groupKey: string) {
    const isDragOver = dragOverGroupKey === groupKey && dragGroupKey !== groupKey
    const open = isGroupOpen(groupKey)
    const names = savingsSeries
      .filter((s) => s.enabled)
      .map((s) => s.name.trim() || 'Untitled')
      .slice(0, 3)
    const extra = Math.max(0, savingsSeries.filter((s) => s.enabled).length - names.length)
    return (
      <div
        key={groupKey}
        draggable
        onDragStart={(e) => {
          setDragGroupKey(groupKey)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', groupKey)
        }}
        onDragEnd={() => {
          setDragGroupKey(null)
          setDragOverGroupKey(null)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dragOverGroupKey !== groupKey) setDragOverGroupKey(groupKey)
        }}
        onDragLeave={() => {
          if (dragOverGroupKey === groupKey) setDragOverGroupKey(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dropGroupOn(groupKey)
        }}
        className={`rounded-xl border bg-black/20 px-3 py-2.5 transition ${
          isDragOver
            ? 'border-sky-500/50 bg-sky-500/10'
            : 'border-white/10'
        } ${dragGroupKey === groupKey ? 'opacity-50' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span
              className="cursor-grab text-white/30 active:cursor-grabbing"
              title="Drag to reorder stack"
              aria-hidden
            >
              ⋮⋮
            </span>
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs text-white/60 transition hover:bg-white/10"
              onClick={() => toggleGroupOpen(groupKey)}
              onMouseDown={(e) => e.stopPropagation()}
              aria-expanded={open}
              title={open ? 'Collapse' : 'Expand'}
            >
              <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>
                ▸
              </span>
            </button>
            <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300/90">
              Savings
            </span>
            <span className="truncate text-[11px] text-white/45">
              {savingsSeries.length === 0
                ? 'No accounts mapped'
                : open
                  ? `${savingsSeries.filter((s) => s.enabled).length}/${savingsSeries.length} included`
                  : names.length > 0
                    ? `${names.join(', ')}${extra > 0 ? ` +${extra}` : ''}`
                    : 'None included'}
            </span>
          </div>
          {open && availableSavings.length > 0 ? (
            <select
              className="input !w-auto !min-w-[10rem] !py-1 !text-xs"
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value
                if (!id) return
                onAddSavings(id)
                e.target.value = ''
              }}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Add savings account"
            >
              <option value="">+ Add account…</option>
              {availableSavings.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name.trim() || 'Untitled'}
                </option>
              ))}
            </select>
          ) : open ? (
            <span className="text-[11px] text-white/30">
              {savingsAccounts.length === 0 ? 'No savings accounts yet' : 'All accounts mapped'}
            </span>
          ) : null}
        </div>
        {open && (
          <div className="mt-2">
            {savingsSeries.length === 0 ? (
              <p className="text-[11px] text-white/40">
                Add savings accounts from the menu. Name and deselect each without leaving this row.
              </p>
            ) : (
              <div className="space-y-1.5">
                {savingsSeries.map((s) => {
                  const missing =
                    !!s.savingsAccountId &&
                    !savingsAccounts.some((a) => a.id === s.savingsAccountId)
                  const acct = savingsAccounts.find((a) => a.id === s.savingsAccountId)
                  const over = dragOverSavingsId === s.id && dragSavingsId !== s.id
                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        setDragSavingsId(s.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', s.id)
                      }}
                      onDragEnd={(e) => {
                        e.stopPropagation()
                        setDragSavingsId(null)
                        setDragOverSavingsId(null)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = 'move'
                        if (dragOverSavingsId !== s.id) setDragOverSavingsId(s.id)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        dropSavingsOn(s.id, savingsSeries)
                      }}
                      className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${
                        over
                          ? 'border-sky-500/40 bg-sky-500/10'
                          : s.enabled
                            ? 'border-white/10 bg-white/[0.03]'
                            : 'border-white/5 bg-black/20 opacity-60'
                      } ${dragSavingsId === s.id ? 'opacity-50' : ''}`}
                    >
                      <span
                        className="cursor-grab text-[10px] text-white/25 active:cursor-grabbing"
                        title="Drag to reorder within savings"
                        aria-hidden
                      >
                        ⋮⋮
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-emerald-500"
                        checked={s.enabled}
                        onChange={() => onToggle(s.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        title={s.enabled ? 'Included in chart' : 'Excluded from chart'}
                        aria-label={`Include ${s.name || acct?.name || 'savings'}`}
                      />
                      <input
                        className="input min-w-[7rem] flex-1 !py-1 !text-xs"
                        value={s.name}
                        placeholder={acct?.name?.trim() || 'Label'}
                        onChange={(e) => onUpdate(s.id, { name: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <select
                        className="input !w-[9.5rem] !py-1 !text-xs"
                        value={s.savingsAccountId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null
                          const a = savingsAccounts.find((x) => x.id === id)
                          onUpdate(s.id, {
                            savingsAccountId: id,
                            name: s.name.trim() ? s.name : a?.name?.trim() || '',
                          })
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <option value="">Account…</option>
                        {savingsAccounts.map((a) => (
                          <option
                            key={a.id}
                            value={a.id}
                            disabled={a.id !== s.savingsAccountId && usedSavingsIds.has(a.id)}
                          >
                            {a.name.trim() || 'Untitled'}
                          </option>
                        ))}
                      </select>
                      <input
                        type="color"
                        className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                        value={resolvedColors.get(s.id) ?? '#38bdf8'}
                        onChange={(e) =>
                          onUpdate(s.id, { color: normalizeHexColor(e.target.value) })
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Stack color"
                      />
                      <button
                        type="button"
                        className="btn-ghost !py-0.5 !text-[11px] text-red-300/80"
                        onClick={() => onRemove(s.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Remove from overview"
                      >
                        ×
                      </button>
                      {missing ? (
                        <span className="w-full text-[10px] text-amber-300/90">
                          Linked account missing — re-select or remove.
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Asset series
          </h3>
          <p className="mt-0.5 text-xs text-white/35">
            Drag groups (⋮⋮) to set stack order; expand (▸) to edit. Leftover is permanent; manuals
            take year → IC → %; remainder goes to leftover.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => onAdd('portfolio')}>
            + Portfolio
          </button>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => onAdd('manual')}>
            + Manual
          </button>
        </div>
      </div>

      {displayGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
          Add a portfolio or manual series to build the net-worth chart.
        </div>
      ) : (
        <div className="space-y-2">
          {displayGroups.map((g) => {
            if (g.kind === 'savings') {
              return renderSavingsGroup(g.series, g.key)
            }
            const s = g.series
            const locked = isPermanentLeftover(s)
            const missing =
              s.type === 'portfolio' &&
              s.portfolioId &&
              !portfolios.some((p) => p.id === s.portfolioId)
            const isDragOver = dragOverGroupKey === g.key && dragGroupKey !== g.key
            const open = isGroupOpen(g.key)
            const displayName = s.name.trim() || sourceLabel(s.type)
            return (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => {
                  setDragGroupKey(g.key)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', g.key)
                }}
                onDragEnd={() => {
                  setDragGroupKey(null)
                  setDragOverGroupKey(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverGroupKey !== g.key) setDragOverGroupKey(g.key)
                }}
                onDragLeave={() => {
                  if (dragOverGroupKey === g.key) setDragOverGroupKey(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  dropGroupOn(g.key)
                }}
                className={`rounded-xl border px-3 py-2.5 ${
                  isDragOver
                    ? 'border-sky-500/50 bg-sky-500/10'
                    : s.enabled || locked
                      ? 'border-white/10 bg-black/20'
                      : 'border-white/5 bg-black/10 opacity-60'
                } ${dragGroupKey === g.key ? 'opacity-50' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span
                      className="cursor-grab text-white/30 active:cursor-grabbing"
                      title="Drag to reorder stack"
                      aria-hidden
                    >
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs text-white/60 transition hover:bg-white/10"
                      onClick={() => toggleGroupOpen(g.key)}
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-expanded={open}
                      title={open ? 'Collapse' : 'Expand'}
                    >
                      <span
                        className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}
                      >
                        ▸
                      </span>
                    </button>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-500"
                      checked={locked ? true : s.enabled}
                      disabled={locked}
                      onChange={() => onToggle(s.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={
                        locked
                          ? 'Leftover cash is always included'
                          : s.enabled
                            ? 'Included in chart'
                            : 'Excluded from chart'
                      }
                      aria-label={`Include ${displayName}`}
                    />
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
                      {sourceLabel(s.type)}
                    </span>
                    {!open && (
                      <span className="truncate text-sm text-white/75">{displayName}</span>
                    )}
                    {!open && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: resolvedColors.get(s.id) ?? '#94a3b8' }}
                        title="Stack color"
                      />
                    )}
                  </div>
                  {!locked && (
                    <button
                      type="button"
                      className="btn-ghost !py-1 !text-xs text-red-300/80"
                      onClick={() => onRemove(s.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {open && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="label !mb-0.5 !text-[10px]">Label</label>
                      <input
                        className="input !py-1.5 !text-xs"
                        value={s.name}
                        onChange={(e) => onUpdate(s.id, { name: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder={
                          s.type === 'manual'
                            ? 'Series name'
                            : s.type === 'portfolio'
                              ? 'Portfolio name'
                              : s.type === 'incomeLeftover'
                                ? 'Leftover cash'
                                : 'Account name'
                        }
                      />
                    </div>

                    <div>
                      <label className="label !mb-0.5 !text-[10px]">Color</label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="color"
                          className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                          value={resolvedColors.get(s.id) ?? '#94a3b8'}
                          onChange={(e) =>
                            onUpdate(s.id, { color: normalizeHexColor(e.target.value) })
                          }
                          onMouseDown={(e) => e.stopPropagation()}
                          title="Pick stack color"
                          aria-label={`Color for ${s.name}`}
                        />
                        <div className="flex flex-wrap gap-1">
                          {shadesForType(s.type).slice(0, 6).map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              className={`h-5 w-5 rounded-sm border transition ${
                                (s.color ?? '').toLowerCase() === hex.toLowerCase()
                                  ? 'border-white ring-1 ring-white/50'
                                  : 'border-white/15 hover:border-white/40'
                              }`}
                              style={{ background: hex }}
                              title={hex}
                              onClick={() => onUpdate(s.id, { color: hex })}
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                          ))}
                        </div>
                        {s.color ? (
                          <button
                            type="button"
                            className="text-[10px] text-white/40 hover:text-white/70"
                            onClick={() => onUpdate(s.id, { color: null })}
                            onMouseDown={(e) => e.stopPropagation()}
                            title="Use automatic color by origin"
                          >
                            Auto
                          </button>
                        ) : (
                          <span className="text-[10px] text-white/30">Auto</span>
                        )}
                      </div>
                    </div>

                    {s.type === 'portfolio' && (
                      <div className="sm:col-span-1 lg:col-span-2">
                        <label className="label !mb-0.5 !text-[10px]">Portfolio</label>
                        <select
                          className="input !py-1.5 !text-xs"
                          value={s.portfolioId ?? ''}
                          onChange={(e) => {
                            const id = e.target.value || null
                            const p = portfolios.find((x) => x.id === id)
                            onUpdate(s.id, {
                              portfolioId: id,
                              name: p?.name?.trim() || '',
                            })
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <option value="">Select portfolio…</option>
                          {portfolios.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {s.type === 'incomeLeftover' && (
                      <>
                        <div className="sm:col-span-2 lg:col-span-3">
                          <p className="rounded-md bg-pink-500/10 px-2 py-1.5 text-[11px] text-pink-100/80">
                            Permanent leftover: receives IC cash not claimed by manual positions
                            {hasPortfolioSeries
                              ? ' (after portfolio surplus deposits).'
                              : '.'}{' '}
                            After the last year binding on this scenario, perpetual CHF/yr applies.
                          </p>
                        </div>
                        <div>
                          <label className="label !mb-0.5 !text-[10px]">Now pile (CHF)</label>
                          <input
                            className="input !py-1.5 !text-xs tabular-nums"
                            type="text"
                            inputMode="decimal"
                            value={s.baseChf ? String(s.baseChf) : ''}
                            placeholder="0"
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/,/g, ''))
                              onUpdate(s.id, {
                                baseChf: Number.isFinite(n) && n >= 0 ? n : 0,
                              })
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="label !mb-0.5 !text-[10px]">Rate % / year</label>
                          <input
                            className="input !py-1.5 !text-xs tabular-nums"
                            type="text"
                            inputMode="decimal"
                            value={
                              s.annualRatePercent != null && s.annualRatePercent !== 0
                                ? String(s.annualRatePercent)
                                : ''
                            }
                            placeholder="0"
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/%/g, ''))
                              onUpdate(s.id, {
                                annualRatePercent: Number.isFinite(n) ? n : 0,
                              })
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="label !mb-0.5 !text-[10px]">Base year</label>
                          <input
                            className="input !py-1.5 !text-xs tabular-nums"
                            type="number"
                            value={s.baseYear ?? new Date().getFullYear()}
                            onChange={(e) =>
                              onUpdate(s.id, {
                                baseYear:
                                  Math.floor(Number(e.target.value)) ||
                                  new Date().getFullYear(),
                              })
                            }
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="label !mb-0.5 !text-[10px]">
                            Perpetual after last year (CHF/yr)
                          </label>
                          <input
                            className="input !py-1.5 !text-xs tabular-nums"
                            type="text"
                            inputMode="decimal"
                            value={
                              s.perpetualYearlyChf != null && s.perpetualYearlyChf !== 0
                                ? String(s.perpetualYearlyChf)
                                : ''
                            }
                            placeholder="0"
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/,/g, ''))
                              onUpdate(s.id, {
                                perpetualYearlyChf: Number.isFinite(n) && n >= 0 ? n : 0,
                              })
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <YearBindingsEditor
                          series={s}
                          incomeCostScenarios={incomeCostScenarios}
                          withPercent={false}
                          onChange={(b) => updateBindings(s.id, b)}
                        />
                      </>
                    )}

                    {s.type === 'manual' && (
                      <>
                        <div>
                          <label className="label !mb-0.5 !text-[10px]">Base (CHF)</label>
                          <input
                            className="input !py-1.5 !text-xs tabular-nums"
                            type="text"
                            inputMode="decimal"
                            value={s.baseChf ? String(s.baseChf) : ''}
                            placeholder="0"
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/,/g, ''))
                              onUpdate(s.id, {
                                baseChf: Number.isFinite(n) && n >= 0 ? n : 0,
                              })
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="label !mb-0.5 !text-[10px]">Rate % / year</label>
                          <input
                            className="input !py-1.5 !text-xs tabular-nums"
                            type="text"
                            inputMode="decimal"
                            value={
                              s.annualRatePercent != null && s.annualRatePercent !== 0
                                ? String(s.annualRatePercent)
                                : ''
                            }
                            placeholder="0"
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/%/g, ''))
                              onUpdate(s.id, {
                                annualRatePercent: Number.isFinite(n) ? n : 0,
                              })
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="label !mb-0.5 !text-[10px]">Base year</label>
                          <input
                            className="input !py-1.5 !text-xs tabular-nums"
                            type="number"
                            value={s.baseYear ?? new Date().getFullYear()}
                            onChange={(e) =>
                              onUpdate(s.id, {
                                baseYear:
                                  Math.floor(Number(e.target.value)) ||
                                  new Date().getFullYear(),
                              })
                            }
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <YearBindingsEditor
                          series={s}
                          incomeCostScenarios={incomeCostScenarios}
                          withPercent
                          onChange={(b) => updateBindings(s.id, b)}
                        />
                      </>
                    )}

                    {missing ? (
                      <p className="sm:col-span-3 text-[11px] text-amber-300/90">
                        Linked source is missing — this series contributes 0 until you re-link it.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

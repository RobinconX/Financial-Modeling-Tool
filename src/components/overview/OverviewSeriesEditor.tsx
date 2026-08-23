import { useEffect, useMemo, useState } from 'react'
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
  isPermanentSavingsSeries,
  normalizeHexColor,
  shadesForType,
  sourceLabel,
} from '../../lib/overview'
import { InfoTip } from '../common/InfoTip'
import { NumberInput } from '../common/MoneyInput'

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
  /** Include/exclude the whole savings block in the chart */
  onSetSavingsEnabled: (enabled: boolean) => void
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
  // Always show Savings group so accounts are visible even before first sync paints
  const savingsOrder =
    savings.length > 0
      ? Math.min(...savings.map((s) => s.sortOrder))
      : others
          .filter((s) => s.type !== 'incomeLeftover')
          .reduce((m, s) => Math.max(m, s.sortOrder), -1) + 0.5
  rows.push({
    order: savingsOrder,
    group: { key: 'savings', kind: 'savings', series: savings },
  })
  for (const s of others) {
    rows.push({
      order: s.sortOrder,
      group: { key: s.id, kind: 'series', series: s },
    })
  }
  return rows.sort((a, b) => a.order - b.order).map((r) => r.group)
}

function YearUntilInput({
  label,
  title,
  value,
  onCommit,
}: {
  label: string
  title: string
  value: number | null | undefined
  onCommit: (year: number | null) => void
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  useEffect(() => {
    setDraft(value != null ? String(value) : '')
  }, [value])

  function commit() {
    const raw = draft.trim()
    if (!raw) {
      onCommit(null)
      setDraft('')
      return
    }
    const y = Math.floor(Number(raw))
    if (!Number.isFinite(y) || y < 1900 || y > 2200) {
      setDraft(value != null ? String(value) : '')
      return
    }
    onCommit(y)
    setDraft(String(y))
  }

  return (
    <div>
      <label className="label !mb-0.5 !text-[10px]">{label}</label>
      <input
        className="input !py-1.5 !text-xs tabular-nums"
        type="number"
        value={draft}
        placeholder="—"
        title={title}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function DraftTextField({
  label,
  value,
  onCommit,
  placeholder,
  className = 'input !py-1.5 !text-xs',
}: {
  label?: string
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])

  function commit() {
    if (draft !== value) onCommit(draft)
  }

  return (
    <div>
      {label ? <label className="label !mb-0.5 !text-[10px]">{label}</label> : null}
      <input
        className={className}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function parseDraftNumber(raw: string, fallback: number, min?: number): number {
  const n = Number(raw.replace(/[,%]/g, '').trim())
  if (!Number.isFinite(n)) return fallback
  if (min != null && n < min) return fallback
  return n
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

  /** Sort only when finishing a year edit (or after add/remove/scenario pick). */
  function setBindings(next: OverviewYearBinding[], sort = true) {
    onChange(sort ? [...next].sort((a, b) => a.year - b.year) : next)
  }

  function patchAt(idx: number, patch: Partial<OverviewYearBinding>, sort = true) {
    setBindings(
      bindings.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
      sort,
    )
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
                ? Math.max(...bindings.map((b) => b.year))
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
              key={`bind-${idx}-${b.incomeCostScenarioId}`}
              className="flex flex-wrap items-center gap-2"
            >
              <NumberInput
                className="input !w-20 !py-1 !text-xs tabular-nums"
                value={b.year}
                step="1"
                commitOnBlur
                onChange={(year) => {
                  const y =
                    year != null && Number.isFinite(year) ? Math.floor(year) : b.year
                  patchAt(idx, { year: y }, true)
                }}
              />
              <select
                className="input min-w-[9rem] flex-1 !py-1 !text-xs"
                value={b.incomeCostScenarioId}
                onChange={(e) => {
                  const id = e.target.value
                  const sc = incomeCostScenarios.find((c) => c.id === id)
                  patchAt(
                    idx,
                    {
                      year: sc?.year ?? b.year,
                      incomeCostScenarioId: id,
                    },
                    true,
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
                  <DraftTextField
                    className="input !py-1 !pr-5 !text-xs tabular-nums"
                    value={b.percent != null && b.percent !== 0 ? String(b.percent) : ''}
                    placeholder="%"
                    onCommit={(raw) => {
                      const n = parseDraftNumber(raw, 0, 0)
                      patchAt(idx, { percent: Math.max(0, Math.min(100, n)) }, true)
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
  onAddSavings: _onAddSavings,
  onUpdate,
  onToggle,
  onSetSavingsEnabled,
  onRemove,
  onReorderGroups,
  onReorderSavings,
}: Props) {
  const resolvedColors = assignOverviewSeriesColors(series)
  const hasPortfolioSeries = series.some(
    (s) => s.enabled && s.type === 'portfolio' && s.portfolioId,
  )
  const displayGroups = useMemo(() => buildDisplayGroups(series), [series])

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
    const enabledCount = savingsSeries.filter((s) => s.enabled).length
    const allOn = savingsSeries.length > 0 && enabledCount === savingsSeries.length
    const someOn = enabledCount > 0
    const names = savingsSeries
      .filter((s) => s.enabled)
      .map((s) => s.name.trim() || 'Untitled')
      .slice(0, 3)
    const extra = Math.max(0, enabledCount - names.length)
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
        className={`rounded-xl border px-3 py-2.5 transition ${
          isDragOver
            ? 'border-sky-500/50 bg-sky-500/10'
            : someOn
              ? 'border-white/10 bg-black/20'
              : 'border-white/5 bg-black/10 opacity-60'
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
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-emerald-500"
              checked={allOn}
              ref={(el) => {
                if (el) el.indeterminate = someOn && !allOn
              }}
              disabled={savingsSeries.length === 0}
              onChange={() => onSetSavingsEnabled(!allOn)}
              onMouseDown={(e) => e.stopPropagation()}
              title={
                allOn
                  ? 'Exclude all savings from chart'
                  : someOn
                    ? 'Include all savings in chart'
                    : 'Include savings in chart'
              }
              aria-label="Include savings in chart"
            />
            <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300/90">
              Savings
            </span>
            <span className="truncate text-[11px] text-white/45">
              {savingsSeries.length === 0
                ? open
                  ? 'No accounts'
                  : ''
                : open
                  ? `${enabledCount}/${savingsSeries.length} included`
                  : names.length > 0
                    ? `${names.join(', ')}${extra > 0 ? ` +${extra}` : ''}`
                    : 'None included'}
            </span>
          </div>
        </div>
        {open && (
          <div className="mt-2">
            {savingsSeries.length === 0 ? null : (
              <div className="space-y-1.5">
                {savingsSeries.map((s) => {
                  const missing =
                    !!s.savingsAccountId &&
                    !savingsAccounts.some((a) => a.id === s.savingsAccountId)
                  const acct = savingsAccounts.find((a) => a.id === s.savingsAccountId)
                  const permanent = isPermanentSavingsSeries(s, savingsAccounts)
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
                      <span className="max-w-[9.5rem] truncate text-[11px] text-white/45">
                        {acct?.name?.trim() || (missing ? 'Missing account' : 'Account')}
                      </span>
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
                      {!permanent ? (
                        <button
                          type="button"
                          className="btn-ghost !py-0.5 !text-[11px] text-red-300/80"
                          onClick={() => onRemove(s.id)}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="Remove orphan series"
                        >
                          ×
                        </button>
                      ) : null}
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
      <div className="section-header">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-violet-300/90">Asset series</h3>
          <InfoTip label="About asset series">
            Drag groups (⋮⋮) to set stack order; expand (▸) to edit. Checkboxes include series in
            the chart (Savings group and each account). Leftover is always on; manuals take year →
            IC → %; remainder goes to leftover.
          </InfoTip>
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
        <div className="px-4 py-8 text-center text-sm text-white/40">
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
                    <DraftTextField
                      label="Label"
                      value={s.name}
                      onCommit={(name) => {
                        if (name !== s.name) onUpdate(s.id, { name })
                      }}
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

                    <YearUntilInput
                      label="Contribute until"
                      title="Last year this series still gets contributions (empty = always)"
                      value={s.contributeUntilYear}
                      onCommit={(y) => onUpdate(s.id, { contributeUntilYear: y })}
                    />
                    <YearUntilInput
                      label="Compound until"
                      title="Last year this series still grows (empty = always)"
                      value={s.compoundUntilYear}
                      onCommit={(y) => onUpdate(s.id, { compoundUntilYear: y })}
                    />

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
                        <DraftTextField
                          label="Now pile (CHF)"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={String(s.baseChf ?? 0)}
                          placeholder="0"
                          onCommit={(raw) => {
                            const n = parseDraftNumber(raw, 0, 0)
                            if (n !== (s.baseChf ?? 0)) onUpdate(s.id, { baseChf: n })
                          }}
                        />
                        <DraftTextField
                          label="Rate % / year"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={String(s.annualRatePercent ?? 0)}
                          placeholder="0"
                          onCommit={(raw) => {
                            const n = parseDraftNumber(raw, 0)
                            if (n !== (s.annualRatePercent ?? 0)) {
                              onUpdate(s.id, { annualRatePercent: n })
                            }
                          }}
                        />
                        <DraftTextField
                          label="Base year"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={String(s.baseYear ?? new Date().getFullYear())}
                          onCommit={(raw) => {
                            const y = Math.floor(parseDraftNumber(raw, s.baseYear ?? new Date().getFullYear()))
                            if (y !== (s.baseYear ?? new Date().getFullYear())) {
                              onUpdate(s.id, { baseYear: y })
                            }
                          }}
                        />
                        <DraftTextField
                          label="Perpetual after last year (CHF/yr)"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={
                            s.perpetualYearlyChf != null && s.perpetualYearlyChf !== 0
                              ? String(s.perpetualYearlyChf)
                              : ''
                          }
                          placeholder="0"
                          onCommit={(raw) => {
                            const n = parseDraftNumber(raw, 0, 0)
                            if (n !== (s.perpetualYearlyChf ?? 0)) {
                              onUpdate(s.id, { perpetualYearlyChf: n })
                            }
                          }}
                        />
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
                        <DraftTextField
                          label="Base (CHF)"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={String(s.baseChf ?? 0)}
                          placeholder="0"
                          onCommit={(raw) => {
                            const n = parseDraftNumber(raw, 0, 0)
                            if (n !== (s.baseChf ?? 0)) onUpdate(s.id, { baseChf: n })
                          }}
                        />
                        <DraftTextField
                          label="Rate % / year"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={String(s.annualRatePercent ?? 0)}
                          placeholder="0"
                          onCommit={(raw) => {
                            const n = parseDraftNumber(raw, 0)
                            if (n !== (s.annualRatePercent ?? 0)) {
                              onUpdate(s.id, { annualRatePercent: n })
                            }
                          }}
                        />
                        <DraftTextField
                          label="Base year"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={String(s.baseYear ?? new Date().getFullYear())}
                          onCommit={(raw) => {
                            const y = Math.floor(
                              parseDraftNumber(raw, s.baseYear ?? new Date().getFullYear()),
                            )
                            if (y !== (s.baseYear ?? new Date().getFullYear())) {
                              onUpdate(s.id, { baseYear: y })
                            }
                          }}
                        />
                        <DraftTextField
                          label="Perpetual after last year (CHF/yr)"
                          className="input !py-1.5 !text-xs tabular-nums"
                          value={
                            s.perpetualYearlyChf != null && s.perpetualYearlyChf !== 0
                              ? String(s.perpetualYearlyChf)
                              : ''
                          }
                          placeholder="0"
                          onCommit={(raw) => {
                            const n = parseDraftNumber(raw, 0, 0)
                            if (n !== (s.perpetualYearlyChf ?? 0)) {
                              onUpdate(s.id, { perpetualYearlyChf: n })
                            }
                          }}
                        />
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

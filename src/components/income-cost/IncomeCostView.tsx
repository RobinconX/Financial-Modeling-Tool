import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CashflowCadence,
  CashflowKind,
  CashflowLine,
  CashflowScenario,
} from '../../types'
import { scenarioTotals } from '../../lib/incomeCost'
import { YearOverview } from './YearOverview'
import { CashflowTable } from './CashflowTable'
import { YearSankey } from './YearSankey'
import { CopyScenarioDialog } from './CopyScenarioDialog'

type Props = {
  scenarios: CashflowScenario[]
  lines: CashflowLine[]
  storageError: string | null
  upsertLine: (line: CashflowLine) => boolean
  removeLine: (id: string) => boolean
  addLine: (
    scenarioId: string,
    kind: CashflowKind,
    cadence?: CashflowCadence,
  ) => CashflowLine | null
  addScenario: (name?: string, year?: number) => CashflowScenario | null
  renameScenario: (id: string, name: string) => boolean
  setScenarioYear: (id: string, year: number) => boolean
  removeScenario: (id: string) => boolean
  reorderScenariosByIds: (orderedIds: string[]) => boolean
  copyScenario: (fromId: string, newName: string) => CashflowScenario | null
}

export function IncomeCostView({
  scenarios,
  lines,
  storageError,
  upsertLine,
  removeLine,
  addLine,
  addScenario,
  renameScenario,
  setScenarioYear,
  removeScenario,
  reorderScenariosByIds,
  copyScenario,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => scenarios[0]?.id ?? null,
  )
  const [copyOpen, setCopyOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedId && scenarios.some((s) => s.id === selectedId)) return
    setSelectedId(scenarios[0]?.id ?? null)
  }, [scenarios, selectedId])

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0] ?? null
  const scenarioId = selected?.id ?? ''

  const totals = useMemo(
    () => (scenarioId ? scenarioTotals(lines, scenarioId) : null),
    [lines, scenarioId],
  )

  function startRename(s: CashflowScenario) {
    setRenamingId(s.id)
    setRenameDraft(s.name)
  }

  function commitRename() {
    if (!renamingId) return
    const trimmed = renameDraft.trim()
    if (trimmed) renameScenario(renamingId, trimmed)
    setRenamingId(null)
  }

  function handleAddScenario() {
    const sc = addScenario(`Scenario ${scenarios.length + 1}`)
    if (sc) {
      setSelectedId(sc.id)
      startRename(sc)
    }
  }

  function handleCopy(fromId: string, newName: string) {
    const sc = copyScenario(fromId, newName)
    if (sc) setSelectedId(sc.id)
    setCopyOpen(false)
  }

  function onDropOn(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const ids = scenarios.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragId)
    reorderScenariosByIds(next)
    setDragId(null)
    setDragOverId(null)
  }

  if (!selected || !totals) {
    return (
      <div className="card p-8 text-center text-sm text-white/40">
        No scenarios yet.
        <div className="mt-3">
          <button type="button" className="btn-primary" onClick={handleAddScenario}>
            + Scenario
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {storageError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {storageError}
        </p>
      )}

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
            Scenarios
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              onClick={() => setCopyOpen(true)}
            >
              Copy…
            </button>
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              onClick={handleAddScenario}
            >
              + Scenario
            </button>
          </div>
        </div>

        <ul className="flex flex-wrap gap-1.5">
          {scenarios.map((s) => {
            const active = s.id === selected.id
            const renaming = renamingId === s.id
            const isDragOver = dragOverId === s.id && dragId !== s.id
            return (
              <li
                key={s.id}
                draggable={!renaming}
                onDragStart={(e) => {
                  if (renaming) {
                    e.preventDefault()
                    return
                  }
                  setDragId(s.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', s.id)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDragOverId(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverId !== s.id) setDragOverId(s.id)
                }}
                onDragLeave={() => {
                  if (dragOverId === s.id) setDragOverId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  onDropOn(s.id)
                }}
                className={`flex cursor-grab items-center gap-0.5 rounded-lg border px-1.5 py-0.5 transition active:cursor-grabbing ${
                  active
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : isDragOver
                      ? 'border-sky-500/50 bg-sky-500/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                } ${dragId === s.id ? 'opacity-50' : ''}`}
              >
                {renaming ? (
                  <input
                    ref={renameRef}
                    className="input !w-28 !px-2 !py-1 !text-xs"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    type="button"
                    className={`max-w-[12rem] truncate px-2 py-1 text-left text-sm font-medium ${
                      active ? 'text-white' : 'text-white/70'
                    }`}
                    onClick={() => setSelectedId(s.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startRename(s)
                    }}
                    title="Drag to reorder · double-click to rename"
                  >
                    <span className="tabular-nums text-white/45">{s.year}</span>
                    <span className="mx-1 text-white/25">·</span>
                    {s.name}
                  </button>
                )}
                {scenarios.length > 1 && (
                  <button
                    type="button"
                    className="mr-0.5 rounded px-1 text-[10px] text-white/30 hover:bg-red-500/20 hover:text-red-300"
                    title="Delete scenario"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete scenario “${s.name}” and all its positions?`)) {
                        removeScenario(s.id)
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label !mb-0.5 !text-[10px]">Year for “{selected.name}”</label>
            <input
              className="input !w-24 !py-1 !text-xs tabular-nums"
              type="number"
              min={1970}
              max={2100}
              value={selected.year}
              onChange={(e) => {
                const y = Math.floor(Number(e.target.value))
                if (Number.isFinite(y)) setScenarioYear(selected.id, y)
              }}
              title="Calendar year this budget describes"
            />
          </div>
          <p className="pb-1 text-[10px] text-white/30">
            Drag scenarios to reorder · double-click to rename · amounts in CHF
          </p>
        </div>
      </div>

      <div className="card p-5">
        <YearOverview title={`${selected.year} · ${selected.name}`} totals={totals} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <CashflowTable
          kind="cost"
          scenarioId={selected.id}
          lines={lines}
          onChange={upsertLine}
          onRemove={removeLine}
          onAdd={(cadence) => addLine(selected.id, 'cost', cadence)}
        />
        <CashflowTable
          kind="income"
          scenarioId={selected.id}
          lines={lines}
          onChange={upsertLine}
          onRemove={removeLine}
          onAdd={(cadence) => addLine(selected.id, 'income', cadence)}
        />
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
          Cash flow · {selected.name}
        </h3>
        <YearSankey
          lines={lines}
          scenarioId={selected.id}
          scenarioName={selected.name}
        />
      </div>

      <CopyScenarioDialog
        open={copyOpen}
        scenarios={scenarios}
        defaultFromId={selected.id}
        onClose={() => setCopyOpen(false)}
        onCreate={handleCopy}
      />
    </div>
  )
}

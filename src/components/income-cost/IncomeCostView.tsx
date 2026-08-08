import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CashflowCadence,
  CashflowKind,
  CashflowLine,
  CashflowScenario,
  SavingsAccount,
  WorkingBalanceDraw,
} from '../../types'
import { scenarioTotals } from '../../lib/incomeCost'
import { FullscreenChart } from '../common/FullscreenChart'
import { InfoTip } from '../common/InfoTip'
import { YearOverview } from './YearOverview'
import { CashflowTable } from './CashflowTable'
import { YearSankey } from './YearSankey'
import { MonthlyBudgetView } from './MonthlyBudgetView'
import { CopyScenarioDialog } from './CopyScenarioDialog'

type WorkspaceTab = 'budget' | 'monthly'

type Props = {
  scenarios: CashflowScenario[]
  lines: CashflowLine[]
  draws: WorkingBalanceDraw[]
  savingsAccounts: SavingsAccount[]
  storageError: string | null
  upsertLine: (line: CashflowLine) => boolean
  removeLine: (id: string) => boolean
  addLine: (
    scenarioId: string,
    kind: CashflowKind,
    cadence?: CashflowCadence,
  ) => CashflowLine | null
  upsertDraw: (draw: WorkingBalanceDraw) => boolean
  removeDraw: (id: string) => boolean
  addDraw: (scenarioId: string) => WorkingBalanceDraw | null
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
  draws,
  savingsAccounts,
  storageError,
  upsertLine,
  removeLine,
  addLine,
  upsertDraw,
  removeDraw,
  addDraw,
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('budget')
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
      <div className="py-12 text-center text-sm text-white/40">
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
    <div className="space-y-8">
      {storageError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {storageError}
        </p>
      )}

      {/* Scenario strip — open, not a card */}
      <div className="section border-b border-white/5 pb-5">
        <div className="section-header">
          <div className="flex items-center gap-1.5">
            <span className="section-title">Scenarios</span>
            <InfoTip label="Scenario tips" align="start">
              Drag chips to reorder. Double-click a name to rename. Amounts are in CHF.
            </InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] uppercase tracking-wider text-white/40" htmlFor="ic-year">
                Year
              </label>
              <input
                id="ic-year"
                className="input !w-20 !py-1 !text-xs tabular-nums"
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

        <ul className="flex flex-wrap gap-1">
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
                className={`flex cursor-grab items-center gap-0.5 rounded-lg px-1 py-0.5 transition active:cursor-grabbing ${
                  active
                    ? 'bg-white/10 text-white'
                    : isDragOver
                      ? 'bg-sky-500/15 text-white/90'
                      : 'text-white/60 hover:bg-white/5 hover:text-white/80'
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
                      active ? 'text-white' : ''
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
      </div>

      {/* Light tabs */}
      <div
        className="inline-flex gap-1 border-b border-white/10"
        role="group"
        aria-label="Income/Cost view"
      >
        <button
          type="button"
          onClick={() => setWorkspaceTab('budget')}
          className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition ${
            workspaceTab === 'budget'
              ? 'border-emerald-400 text-white'
              : 'border-transparent text-white/50 hover:text-white/80'
          }`}
        >
          Budget
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceTab('monthly')}
          className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition ${
            workspaceTab === 'monthly'
              ? 'border-emerald-400 text-white'
              : 'border-transparent text-white/50 hover:text-white/80'
          }`}
        >
          Monthly
        </button>
      </div>

      {workspaceTab === 'budget' ? (
        <div className="space-y-5">
          <YearOverview title={`${selected.year} · ${selected.name}`} totals={totals} />

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

          <div className="panel space-y-3">
            <h3 className="section-title">
              Cash flow
              <span className="ml-2 font-normal text-white/40">· {selected.name}</span>
            </h3>
            <FullscreenChart title={`Cash flow · ${selected.name}`}>
              <YearSankey
                lines={lines}
                scenarioId={selected.id}
                scenarioName={selected.name}
              />
            </FullscreenChart>
          </div>
        </div>
      ) : (
        <MonthlyBudgetView
          scenario={selected}
          lines={lines}
          draws={draws}
          savingsAccounts={savingsAccounts}
          onUpsertDraw={(d) => {
            upsertDraw(d)
          }}
          onRemoveDraw={(id) => {
            removeDraw(id)
          }}
          onAddDraw={() => {
            addDraw(selected.id)
          }}
        />
      )}

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

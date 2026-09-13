import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ComparableBasis,
  SavedComparable,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import { portfoliosUsingScenario } from '../../lib/scenarioUsage'
import { groupScenariosByTicker } from '../../lib/storage'
import {
  buildProjectionPack,
  defaultImportSelection,
  downloadProjectionPack,
  formatImportMessage,
  readProjectionFileFromFile,
  type ProjectionCandidate,
} from '../../lib/projectionPack'
import { ProjectionPanel } from './ProjectionPanel'
import { ComparablesView } from './ComparablesView'
import { ProjectionPickDialog } from './ProjectionPickDialog'
import { ConfirmDialog } from '../common/ConfirmDialog'

type SaveInput = Omit<SavedScenario, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

const DRAFT = '__draft__'
const MODE_KEY = 'grok-lab-projections-mode'

type PageMode = 'analyze' | 'comps'

type Props = {
  scenarios: SavedScenario[]
  portfolios: SavedPortfolio[]
  storageError: string | null
  upsertScenario: (
    input: SaveInput,
  ) => { scenario: SavedScenario; overwritten: boolean } | { error: string }
  updateScenario: (id: string, patch: Partial<SavedScenario>) => boolean
  deleteScenario: (id: string) => boolean
  importScenarios: (
    incoming: SavedScenario[],
  ) => { imported: SavedScenario[] } | { error: string }
  comparables: SavedComparable[]
  comparablesError: string | null
  createComparable: (name?: string) => SavedComparable | null
  updateComparable: (id: string, patch: Partial<SavedComparable>) => boolean
  deleteComparable: (id: string) => boolean
}

function readMode(): PageMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    if (v === 'comps' || v === 'analyze') return v
  } catch {
    /* ignore */
  }
  return 'analyze'
}

function sortScenariosByTicker(list: SavedScenario[]): SavedScenario[] {
  return [...list].sort(
    (a, b) =>
      a.symbol.localeCompare(b.symbol, undefined, { sensitivity: 'base' }) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  )
}

function ProjectionSelector({
  value,
  onChange,
  scenarios,
  id,
}: {
  value: string
  onChange: (v: string) => void
  scenarios: SavedScenario[]
  id: string
}) {
  const grouped = useMemo(() => groupScenariosByTicker(scenarios), [scenarios])
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const isDraft = value === DRAFT
  const selected = isDraft ? null : (scenarios.find((s) => s.id === value) ?? null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open || !selected) return
    setExpanded((prev) => ({ ...prev, [selected.symbol]: true }))
  }, [open, selected])

  function pick(id: string) {
    onChange(id)
    setOpen(false)
  }

  function toggleTicker(symbol: string, cases: SavedScenario[]) {
    if (cases.length === 1) {
      pick(cases[0]!.id)
      return
    }
    setExpanded((prev) => ({ ...prev, [symbol]: !prev[symbol] }))
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
      <div className="relative min-w-[12rem] flex-1" ref={rootRef}>
        <label className="label !mb-1" htmlFor={id}>
          Projection
        </label>
        <button
          id={id}
          type="button"
          className="input flex w-full items-center gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="min-w-0 flex-1 truncate">
            {isDraft
              ? 'New draft (unsaved)'
              : selected
                ? `${selected.symbol} · ${selected.name}`
                : 'Choose saved…'}
          </span>
          <span className="shrink-0 text-white/40" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <ul
            className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-white/15 bg-[#121820] py-1 shadow-xl shadow-black/50"
            role="listbox"
          >
            {grouped.length === 0 ? (
              <li className="px-3 py-2 text-sm text-white/40">No saved projections</li>
            ) : (
              grouped.map((g) => {
                const many = g.scenarios.length > 1
                const isOpen = !many || expanded[g.symbol] === true
                const company = g.scenarios.find((s) => s.companyName)?.companyName
                return (
                  <li key={g.symbol}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
                      onClick={() => toggleTicker(g.symbol, g.scenarios)}
                      aria-expanded={many ? isOpen : undefined}
                    >
                      {many ? (
                        <span
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-white/40 transition-transform ${
                            isOpen ? 'rotate-90' : ''
                          }`}
                          aria-hidden
                        >
                          ▸
                        </span>
                      ) : (
                        <span className="inline-block w-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{g.symbol}</span>
                        <span className="block truncate text-[11px] text-white/40">
                          {company ? `${company} · ` : ''}
                          {many
                            ? `${g.scenarios.length} projections`
                            : g.scenarios[0]!.name}
                        </span>
                      </span>
                    </button>
                    {many && isOpen
                      ? g.scenarios.map((sc) => (
                          <button
                            key={sc.id}
                            type="button"
                            role="option"
                            aria-selected={sc.id === value}
                            className={`flex w-full items-start px-3 py-1.5 pl-9 text-left text-sm hover:bg-white/5 ${
                              sc.id === value ? 'bg-emerald-500/15 text-white' : 'text-white/80'
                            }`}
                            onClick={() => pick(sc.id)}
                          >
                            {sc.name}
                          </button>
                        ))
                      : null}
                  </li>
                )
              })
            )}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="btn-primary shrink-0 !py-2 !text-sm"
        disabled={isDraft}
        onClick={() => onChange(DRAFT)}
        title={isDraft ? 'Already editing a new projection' : 'Start a new projection'}
      >
        New projection
      </button>
    </div>
  )
}

export function ProjectionsView({
  scenarios,
  portfolios,
  storageError,
  upsertScenario,
  updateScenario,
  deleteScenario,
  importScenarios,
  comparables,
  comparablesError,
  createComparable,
  updateComparable,
  deleteComparable,
}: Props) {
  const sorted = useMemo(() => sortScenariosByTicker(scenarios), [scenarios])

  const [mode, setMode] = useState<PageMode>(readMode)
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  const [compare, setCompare] = useState(false)
  /** Selection: DRAFT or scenario id */
  const [selA, setSelA] = useState<string>(() => sorted[0]?.id ?? DRAFT)
  const [selB, setSelB] = useState<string>(DRAFT)
  const [openBasis, setOpenBasis] = useState<ComparableBasis | undefined>(undefined)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importPick, setImportPick] = useState<ProjectionCandidate[] | null>(null)
  const [importChecked, setImportChecked] = useState<string[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Keep A valid when list changes
  useEffect(() => {
    if (selA === DRAFT) return
    if (scenarios.some((s) => s.id === selA)) return
    setSelA(sorted[0]?.id ?? DRAFT)
  }, [scenarios, selA, sorted])

  useEffect(() => {
    if (!compare) return
    if (selB === DRAFT) return
    if (scenarios.some((s) => s.id === selB)) return
    setSelB(DRAFT)
  }, [scenarios, selB, compare])

  const scenarioA = selA === DRAFT ? null : (scenarios.find((s) => s.id === selA) ?? null)
  const scenarioB = selB === DRAFT ? null : (scenarios.find((s) => s.id === selB) ?? null)

  function applyImported(incoming: SavedScenario[]) {
    const result = importScenarios(incoming)
    if ('error' in result) {
      setShareMessage(null)
      setShareError(result.error)
      return
    }
    setShareError(null)
    setShareMessage(formatImportMessage(result.imported))
    setImportPick(null)
    const first = result.imported[0]
    if (first) setSelA(first.id)
  }

  async function handleImportFile(file: File) {
    setShareError(null)
    setShareMessage(null)
    const parsed = await readProjectionFileFromFile(file)
    if ('error' in parsed) {
      setShareError(parsed.error)
      return
    }
    const openSymbol = scenarioA?.symbol ?? null
    setImportPick(parsed.candidates)
    setImportChecked(
      parsed.candidates.length === 1
        ? [parsed.candidates[0]!.key]
        : defaultImportSelection(parsed.candidates, openSymbol),
    )
  }

  function exportChecked(): string[] {
    const ids: string[] = []
    if (selA !== DRAFT && scenarios.some((s) => s.id === selA)) ids.push(selA)
    return ids
  }

  function handleExportChosen(ids: string[]) {
    const list = sorted.filter((s) => ids.includes(s.id))
    if (list.length === 0) return
    downloadProjectionPack(buildProjectionPack(list))
    setExportOpen(false)
  }

  function handleDelete(id: string) {
    if (!scenarios.some((s) => s.id === id)) return
    setPendingDeleteId(id)
  }

  function confirmPendingDelete() {
    const id = pendingDeleteId
    if (!id) return
    deleteScenario(id)
    if (selA === id) setSelA(DRAFT)
    if (selB === id) setSelB(DRAFT)
    setPendingDeleteId(null)
  }

  const pendingDelete = pendingDeleteId
    ? (scenarios.find((s) => s.id === pendingDeleteId) ?? null)
    : null
  const pendingUsage = pendingDelete
    ? portfoliosUsingScenario(pendingDelete.id, portfolios)
    : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10">
        <div className="inline-flex gap-1" role="tablist" aria-label="Projections">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'analyze'}
            onClick={() => setMode('analyze')}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition ${
              mode === 'analyze'
                ? 'border-emerald-400 text-white'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            Analyze
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'comps'}
            onClick={() => setMode('comps')}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition ${
              mode === 'comps'
                ? 'border-emerald-400 text-white'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            Comparables
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1.5">
          <button
            type="button"
            className="btn-ghost !py-1.5 !text-xs"
            onClick={() => importInputRef.current?.click()}
          >
            Import
          </button>
          <button
            type="button"
            className="btn-ghost !py-1.5 !text-xs"
            disabled={sorted.length === 0}
            onClick={() => setExportOpen(true)}
          >
            Export
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json,text/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void handleImportFile(f)
            }}
          />
        </div>
      </div>

      {shareError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {shareError}
        </p>
      ) : null}
      {shareMessage ? (
        <p className="text-sm text-emerald-300">{shareMessage}</p>
      ) : null}

      {mode === 'comps' ? (
        <ComparablesView
          scenarios={scenarios}
          comparables={comparables}
          storageError={comparablesError}
          createComparable={createComparable}
          updateComparable={updateComparable}
          deleteComparable={deleteComparable}
          onOpenProjection={(id, basis) => {
            setSelA(id)
            setOpenBasis(basis)
            setCompare(false)
            setMode('analyze')
          }}
        />
      ) : (
        <>
      <div className="section-header border-b border-white/5 pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <ProjectionSelector
            value={selA}
            onChange={(id) => {
              setOpenBasis(undefined)
              setSelA(id)
            }}
            scenarios={sorted}
            id="proj-select-a"
          />
          {compare && (
            <ProjectionSelector
              value={selB}
              onChange={setSelB}
              scenarios={sorted}
              id="proj-select-b"
            />
          )}
        </div>
        <div
          className="inline-flex gap-1 border-b border-white/10"
          role="group"
          aria-label="Layout"
        >
          <button
            type="button"
            onClick={() => setCompare(false)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition ${
              !compare
                ? 'border-emerald-400 text-white'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => setCompare(true)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition ${
              compare
                ? 'border-emerald-400 text-white'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            Compare
          </button>
        </div>
      </div>

      {storageError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {storageError}
        </p>
      )}

      <div className={`grid min-w-0 gap-5 ${compare ? 'xl:grid-cols-2' : ''}`}>
        <ProjectionPanel
          key={`a-${selA}`}
          title={compare ? 'Panel A' : undefined}
          scenario={scenarioA}
          initialBasis={openBasis}
          onUpsertScenario={upsertScenario}
          onUpdateScenario={updateScenario}
          onDraftSaved={(sc) => setSelA(sc.id)}
          onDelete={scenarioA ? handleDelete : undefined}
        />
        {compare && (
          <ProjectionPanel
            key={`b-${selB}`}
            title="Panel B"
            scenario={scenarioB}
            onUpsertScenario={upsertScenario}
            onUpdateScenario={updateScenario}
            onDraftSaved={(sc) => setSelB(sc.id)}
            onDelete={scenarioB ? handleDelete : undefined}
          />
        )}
      </div>
        </>
      )}

      {exportOpen ? (
        <ProjectionPickDialog
          title="Export projections"
          description="Choose which projections to pack into one file."
          items={sorted.map((s) => ({
            key: s.id,
            label: `${s.symbol} · ${s.name}`,
          }))}
          initialChecked={exportChecked()}
          confirmLabel="Export"
          onClose={() => setExportOpen(false)}
          onConfirm={(picked) => handleExportChosen(picked.map((p) => p.key))}
        />
      ) : null}

      {importPick ? (
        <ProjectionPickDialog
          title="Import projections"
          description="Name each one as it should appear under that ticker. If you already have that name, we add “ (imported)”."
          items={importPick.map((c) => ({
            key: c.key,
            label: c.scenario.symbol,
            hint: c.accountName ?? undefined,
            name: c.scenario.name,
          }))}
          initialChecked={importChecked}
          confirmLabel="Import"
          rename
          onClose={() => setImportPick(null)}
          onConfirm={(picked) => {
            const byKey = new Map(importPick.map((c) => [c.key, c]))
            const chosen = picked.flatMap((p) => {
              const c = byKey.get(p.key)
              if (!c) return []
              return [{ ...c.scenario, name: p.name }]
            })
            applyImported(chosen)
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete projection"
          confirmLabel="Delete"
          onClose={() => setPendingDeleteId(null)}
          onConfirm={confirmPendingDelete}
        >
          <p>
            <span className="font-semibold text-white">{pendingDelete.symbol}</span>
            <span> · {pendingDelete.name}</span>
          </p>
          {pendingUsage.length === 0 ? (
            <p>This cannot be undone.</p>
          ) : (
            <>
              <p>
                Used in {pendingUsage.length === 1 ? 'this portfolio' : 'these portfolios'}.
                Holdings will show a missing scenario until you re-link them.
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-white/80">
                {pendingUsage.map((u) => (
                  <li key={u.portfolioId}>
                    {u.portfolioName}
                    <span className="text-white/45">
                      {' '}
                      · {u.holdingCount} holding{u.holdingCount === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

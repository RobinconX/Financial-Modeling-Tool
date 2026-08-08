import { useEffect, useMemo, useState } from 'react'
import type { SavedPortfolio, SavedScenario } from '../../types'
import {
  deleteScenarioConfirmMessage,
  portfoliosUsingScenario,
} from '../../lib/scenarioUsage'
import { ProjectionPanel } from './ProjectionPanel'

type SaveInput = Omit<SavedScenario, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

const DRAFT = '__draft__'

type Props = {
  scenarios: SavedScenario[]
  portfolios: SavedPortfolio[]
  storageError: string | null
  upsertScenario: (
    input: SaveInput,
  ) => { scenario: SavedScenario; overwritten: boolean } | { error: string }
  updateScenario: (id: string, patch: Partial<SavedScenario>) => boolean
  deleteScenario: (id: string) => boolean
}

function sortScenariosByTicker(list: SavedScenario[]): SavedScenario[] {
  return [...list].sort(
    (a, b) =>
      a.symbol.localeCompare(b.symbol, undefined, { sensitivity: 'base' }) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  )
}

export function ProjectionsView({
  scenarios,
  portfolios,
  storageError,
  upsertScenario,
  updateScenario,
  deleteScenario,
}: Props) {
  const sorted = useMemo(() => sortScenariosByTicker(scenarios), [scenarios])

  const [compare, setCompare] = useState(false)
  /** Selection: DRAFT or scenario id */
  const [selA, setSelA] = useState<string>(() => sorted[0]?.id ?? DRAFT)
  const [selB, setSelB] = useState<string>(DRAFT)

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

  function handleDelete(id: string) {
    const sc = scenarios.find((s) => s.id === id)
    if (!sc) return
    const usage = portfoliosUsingScenario(id, portfolios)
    const msg = deleteScenarioConfirmMessage(sc.symbol, sc.name, usage)
    if (!confirm(msg)) return
    deleteScenario(id)
    if (selA === id) setSelA(DRAFT)
    if (selB === id) setSelB(DRAFT)
  }

  function Selector({
    value,
    onChange,
    id,
  }: {
    value: string
    onChange: (v: string) => void
    id: string
  }) {
    const isDraft = value === DRAFT
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label className="label !mb-1" htmlFor={id}>
            Projection
          </label>
          <select
            id={id}
            className="input w-full"
            value={isDraft ? '' : value}
            onChange={(e) => {
              const v = e.target.value
              if (v) onChange(v)
            }}
          >
            <option value="" disabled>
              {isDraft ? 'New draft (unsaved)' : 'Choose saved…'}
            </option>
            {sorted.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.symbol} · {sc.name}
              </option>
            ))}
          </select>
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

  return (
    <div className="space-y-5">
      <div className="section-header border-b border-white/5 pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <Selector value={selA} onChange={setSelA} id="proj-select-a" />
          {compare && <Selector value={selB} onChange={setSelB} id="proj-select-b" />}
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
    </div>
  )
}

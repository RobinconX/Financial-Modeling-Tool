import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CashflowLine,
  OverviewSeriesType,
  SavedPortfolio,
  SavedScenario,
  SavingsAccount,
} from '../../types'
import { useOverview } from '../../hooks/useOverview'
import { fetchFxRateClient } from '../../lib/fx'
import { OVERVIEW_CURRENCY, type OverviewBuildDeps } from '../../lib/overview'
import { FullscreenChart } from '../common/FullscreenChart'
import { OverviewChart } from './OverviewChart'
import { OverviewCompareChart } from './OverviewCompareChart'
import { OverviewSeriesEditor } from './OverviewSeriesEditor'

type Props = {
  portfolios: SavedPortfolio[]
  stockScenarios: SavedScenario[]
  savingsAccounts: SavingsAccount[]
  incomeCostLines: CashflowLine[]
}

type ChartMode = 'stack' | 'compare'

export function OverviewView({
  portfolios,
  stockScenarios,
  savingsAccounts,
  incomeCostLines,
}: Props) {
  const {
    scenarios,
    selectedScenarioId,
    selectedScenario,
    startYear,
    endYear,
    series,
    error,
    selectScenario,
    addScenario,
    saveAsScenario,
    renameScenario,
    removeScenario,
    setRange,
    addSeries,
    updateSeries,
    removeSeries,
    toggleSeries,
  } = useOverview()

  const [usdToChf, setUsdToChf] = useState<number | null>(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState<string | null>(null)
  const [saveAsName, setSaveAsName] = useState('')
  const [showSaveAs, setShowSaveAs] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('stack')
  /** Scenario ids included in compare line chart (defaults to all). */
  const [compareIds, setCompareIds] = useState<string[]>([])
  // Draft year inputs so typing multi-digit years doesn't clamp mid-edit
  const [fromDraft, setFromDraft] = useState(String(startYear))
  const [toDraft, setToDraft] = useState(String(endYear))

  useEffect(() => {
    setFromDraft(String(startYear))
    setToDraft(String(endYear))
  }, [startYear, endYear, selectedScenarioId])

  const loadFx = useCallback(async () => {
    setFxLoading(true)
    setFxError(null)
    try {
      const q = await fetchFxRateClient('USD', 'CHF')
      setUsdToChf(q.rate)
    } catch (err) {
      setFxError(err instanceof Error ? err.message : 'FX rate unavailable')
    } finally {
      setFxLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFx()
  }, [loadFx])

  // Keep compare selection in sync when scenarios are added/removed
  useEffect(() => {
    const ids = scenarios.map((s) => s.id)
    setCompareIds((prev) => {
      if (prev.length === 0) return ids
      const kept = prev.filter((id) => ids.includes(id))
      const added = ids.filter((id) => !prev.includes(id))
      // Drop deleted; auto-include newly created scenarios
      return [...kept, ...added]
    })
  }, [scenarios])

  const asOf = useMemo(() => new Date(), [])

  const deps: OverviewBuildDeps = useMemo(
    () => ({
      portfolios,
      stockScenarios,
      savingsAccounts,
      incomeCostLines,
      usdToChf,
      asOf,
    }),
    [portfolios, stockScenarios, savingsAccounts, incomeCostLines, usdToChf, asOf],
  )

  const compareScenarios = useMemo(
    () => scenarios.filter((s) => compareIds.includes(s.id)),
    [scenarios, compareIds],
  )

  /** Apply year range immediately when both values look like calendar years (spinner or finished typing). */
  function applyRangeDraft(fromStr: string, toStr: string) {
    const from = Number(fromStr)
    const to = Number(toStr)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return
    // Avoid clamping partial keystrokes like "20" / "203"
    if (from < 1000 || from > 9999 || to < 1000 || to > 9999) return
    if (from === startYear && to === endYear) return
    setRange(from, to)
  }

  const needsFx =
    chartMode === 'stack'
      ? series.some((s) => s.enabled && s.type === 'portfolio')
      : compareScenarios.some((sc) =>
          sc.series.some((s) => s.enabled && s.type === 'portfolio'),
        )

  function handleAdd(type: OverviewSeriesType) {
    if (type === 'portfolio') {
      const p = portfolios[0]
      addSeries({
        type: 'portfolio',
        // Default label = selected portfolio name (empty until one exists)
        name: p?.name?.trim() || '',
        portfolioId: p?.id ?? null,
      })
      return
    }
    if (type === 'savings') {
      const a = savingsAccounts[0]
      addSeries({
        type: 'savings',
        name: a?.name?.trim() || '',
        savingsAccountId: a?.id ?? null,
      })
      return
    }
    // Manual: no default text — grey placeholder only
    addSeries({
      type: 'manual',
      name: '',
      baseChf: 0,
      annualRatePercent: 0,
      baseYear: asOf.getFullYear(),
    })
  }

  function handleSaveAs() {
    const name = saveAsName.trim() || `Copy of ${selectedScenario?.name ?? 'scenario'}`
    const sc = saveAsScenario(name)
    if (sc) {
      setSaveAsName('')
      setShowSaveAs(false)
    }
  }

  function toggleCompareId(id: string) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {/* Scenario bar */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          Scenario
        </span>
        <select
          className="input !w-auto min-w-[10rem] !py-1.5 !text-xs"
          value={selectedScenarioId ?? ''}
          onChange={(e) => selectScenario(e.target.value)}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {selectedScenario ? (
          <input
            className="input !w-40 !py-1.5 !text-xs"
            value={selectedScenario.name}
            onChange={(e) => renameScenario(selectedScenario.id, e.target.value)}
            title="Rename scenario"
            aria-label="Scenario name"
          />
        ) : null}
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => addScenario()}>
          + New
        </button>
        <button
          type="button"
          className="btn-ghost !py-1 !text-xs"
          onClick={() => {
            setSaveAsName(`Copy of ${selectedScenario?.name ?? 'scenario'}`)
            setShowSaveAs((v) => !v)
          }}
        >
          Save as…
        </button>
        <button
          type="button"
          className="btn-ghost !py-1 !text-xs text-red-300/80 disabled:opacity-40"
          disabled={scenarios.length <= 1 || !selectedScenarioId}
          onClick={() => selectedScenarioId && removeScenario(selectedScenarioId)}
          title={scenarios.length <= 1 ? 'Keep at least one scenario' : 'Delete scenario'}
        >
          Delete
        </button>
        {showSaveAs ? (
          <div className="flex flex-wrap items-center gap-1.5 border-l border-white/10 pl-2">
            <input
              className="input !w-44 !py-1 !text-xs"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="Scenario name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAs()
              }}
            />
            <button type="button" className="btn-primary !py-1 !text-xs" onClick={handleSaveAs}>
              Save
            </button>
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              onClick={() => setShowSaveAs(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div className="card relative z-10 overflow-visible p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              {chartMode === 'stack' ? 'Net worth · stacked' : 'Compare scenarios · lines'}
              {chartMode === 'stack' && selectedScenario ? (
                <span className="ml-2 font-normal normal-case tracking-normal text-white/35">
                  · {selectedScenario.name}
                </span>
              ) : null}
            </h3>
            <p className="mt-0.5 text-xs text-white/35">
              {chartMode === 'stack'
                ? 'Past years → Now (live) → current / future. CHF. Portfolio greens, savings blues, manual amber/violet.'
                : 'Each line is total net worth for a scenario (enabled series only).'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {(
                [
                  { id: 'stack' as const, label: 'Stacked' },
                  { id: 'compare' as const, label: 'Compare' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChartMode(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    chartMode === opt.id
                      ? 'bg-white text-black shadow'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-white/50">
              From
              <input
                className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
                type="number"
                value={fromDraft}
                onChange={(e) => {
                  const v = e.target.value
                  setFromDraft(v)
                  applyRangeDraft(v, toDraft)
                }}
                onBlur={() => {
                  const from = Number(fromDraft)
                  const to = Number(toDraft)
                  if (!Number.isFinite(from) || !Number.isFinite(to)) {
                    setFromDraft(String(startYear))
                    setToDraft(String(endYear))
                    return
                  }
                  setRange(from, to)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-white/50">
              To
              <input
                className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
                type="number"
                value={toDraft}
                onChange={(e) => {
                  const v = e.target.value
                  setToDraft(v)
                  applyRangeDraft(fromDraft, v)
                }}
                onBlur={() => {
                  const from = Number(fromDraft)
                  const to = Number(toDraft)
                  if (!Number.isFinite(from) || !Number.isFinite(to)) {
                    setFromDraft(String(startYear))
                    setToDraft(String(endYear))
                    return
                  }
                  setRange(from, to)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
            </label>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/45">
              {OVERVIEW_CURRENCY}
            </span>
          </div>
        </div>

        {chartMode === 'compare' && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
              Show lines
            </span>
            {scenarios.map((s) => {
              const on = compareIds.includes(s.id)
              return (
                <label
                  key={s.id}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
                    on
                      ? 'border-white/20 bg-white/10 text-white/90'
                      : 'border-white/5 bg-transparent text-white/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-sky-400"
                    checked={on}
                    onChange={() => toggleCompareId(s.id)}
                  />
                  {s.name}
                </label>
              )
            })}
            {scenarios.length < 2 ? (
              <span className="text-[11px] text-white/35">
                Create another scenario (Save as…) to compare.
              </span>
            ) : null}
          </div>
        )}

        {needsFx && usdToChf == null && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
            <span>
              Portfolio series need a USD→CHF rate
              {fxError ? `: ${fxError}` : fxLoading ? ' (loading…)' : ''}.
            </span>
            <button
              type="button"
              className="btn-ghost !px-2 !py-0.5 !text-[11px]"
              onClick={() => void loadFx()}
              disabled={fxLoading}
            >
              Retry rate
            </button>
          </div>
        )}

        <FullscreenChart
          title={
            chartMode === 'stack'
              ? `Overview · ${selectedScenario?.name ?? 'net worth'}`
              : 'Overview · compare scenarios'
          }
        >
          {chartMode === 'stack' ? (
            <OverviewChart
              key={`stack-${selectedScenarioId}-${startYear}-${endYear}`}
              startYear={startYear}
              endYear={endYear}
              series={series}
              deps={deps}
            />
          ) : (
            <OverviewCompareChart
              key={`compare-${startYear}-${endYear}-${compareIds.join(',')}`}
              scenarios={compareScenarios}
              startYear={startYear}
              endYear={endYear}
              deps={deps}
            />
          )}
        </FullscreenChart>

        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/40">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-400/80" /> Actual (≤ this year)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-white/25" /> Projected (future years)
          </span>
        </div>
      </div>

      <div className="card p-5">
        {chartMode === 'compare' && selectedScenario ? (
          <p className="mb-3 text-xs text-white/40">
            Editing series for <span className="text-white/75">{selectedScenario.name}</span>
            — the compare chart uses each scenario’s total (enabled series only).
          </p>
        ) : null}
        <OverviewSeriesEditor
          series={series}
          portfolios={portfolios}
          savingsAccounts={savingsAccounts}
          onAdd={handleAdd}
          onUpdate={updateSeries}
          onToggle={toggleSeries}
          onRemove={removeSeries}
        />
      </div>
    </div>
  )
}

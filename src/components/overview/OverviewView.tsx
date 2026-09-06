import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CashflowLine,
  CashflowScenario,
  OverviewSeriesType,
  PortfolioActualsState,
  SavedPortfolio,
  SavedScenario,
  SavingsAccount,
} from '../../types'
import { useChartAnnotations } from '../../hooks/useChartAnnotations'
import { useGoals } from '../../hooks/useGoals'
import { useOverview } from '../../hooks/useOverview'
import { fetchFxRateClient } from '../../lib/fx'
import {
  assignOverviewSeriesColors,
  OVERVIEW_CURRENCY,
  recordedOverviewByYear,
  type OverviewBuildDeps,
} from '../../lib/overview'
import {
  buildRunwayModel,
  defaultRunwayConfig,
  runwayAssetSeries,
} from '../../lib/runway'
import { readShowGoals, writeShowGoals } from '../../lib/goals'
import { ChartGoals } from '../common/ChartGoals'
import { ChartNotes } from '../common/ChartNotes'
import { FullscreenChart } from '../common/FullscreenChart'
import { InfoTip } from '../common/InfoTip'
import { OverviewAreaChart } from './OverviewAreaChart'
import { OverviewChart } from './OverviewChart'
import { OverviewCompareChart } from './OverviewCompareChart'
import { OverviewSeriesEditor } from './OverviewSeriesEditor'
import { RunwayConfig } from './RunwayConfig'
import { RunwayYearFlowPanel } from './RunwayYearFlow'

type Props = {
  portfolios: SavedPortfolio[]
  stockScenarios: SavedScenario[]
  savingsAccounts: SavingsAccount[]
  incomeCostLines: CashflowLine[]
  incomeCostScenarios?: CashflowScenario[]
  portfolioActuals?: PortfolioActualsState | null
}

type ChartMode = 'bars' | 'area' | 'compare'
type PageTab = 'networth' | 'runway'

const PAGE_TAB_KEY = 'grok-lab-overview-page-tab'

const COMPARE_IDS_KEY = 'grok-lab-overview-compare-ids'
const RECORDED_KEY = 'grok-lab-overview-show-recorded'

function readCompareIds(): string[] | null {
  try {
    const raw = localStorage.getItem(COMPARE_IDS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return null
  }
}

export function OverviewView({
  portfolios,
  stockScenarios,
  savingsAccounts,
  incomeCostLines,
  incomeCostScenarios = [],
  portfolioActuals = null,
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
    updateScenario,
    removeScenario,
    setRange,
    addSeries,
    updateSeries,
    removeSeries,
    toggleSeries,
    setSavingsGroupEnabled,
    syncSavingsToScenarios,
    reorderSeriesGroups,
    reorderSavingsSeries,
  } = useOverview()
  const {
    annotations,
    error: notesError,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
  } = useChartAnnotations()
  const { goals, error: goalsError, addGoal, updateGoal, removeGoal } = useGoals()
  const [showGoals, setShowGoals] = useState(() => readShowGoals())

  // Every overview scenario always includes all savings accounts (at least Cash).
  useEffect(() => {
    syncSavingsToScenarios(savingsAccounts)
  }, [savingsAccounts, syncSavingsToScenarios])

  const [usdToChf, setUsdToChf] = useState<number | null>(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState<string | null>(null)
  const [saveAsName, setSaveAsName] = useState('')
  const [showSaveAs, setShowSaveAs] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('bars')
  const [pageTab, setPageTab] = useState<PageTab>(() => {
    try {
      return localStorage.getItem(PAGE_TAB_KEY) === 'runway' ? 'runway' : 'networth'
    } catch {
      return 'networth'
    }
  })
  /** null = all scenarios (default). Explicit list is the user's compare set. */
  const [compareIds, setCompareIds] = useState<string[] | null>(() => readCompareIds())
  const [showRecorded, setShowRecorded] = useState(() => {
    try {
      const v = localStorage.getItem(RECORDED_KEY)
      if (v === '0') return false
      if (v === '1') return true
    } catch {
      /* ignore */
    }
    return true
  })
  // Draft year inputs so typing multi-digit years doesn't clamp mid-edit
  const [fromDraft, setFromDraft] = useState(String(startYear))
  const [toDraft, setToDraft] = useState(String(endYear))
  const [runwayYearKey, setRunwayYearKey] = useState<string | null>(null)

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

  useEffect(() => {
    if (compareIds == null) return
    try {
      localStorage.setItem(COMPARE_IDS_KEY, JSON.stringify(compareIds))
    } catch {
      /* ignore */
    }
  }, [compareIds])

  useEffect(() => {
    try {
      localStorage.setItem(RECORDED_KEY, showRecorded ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [showRecorded])

  useEffect(() => {
    writeShowGoals(showGoals)
  }, [showGoals])

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_TAB_KEY, pageTab)
    } catch {
      /* ignore */
    }
  }, [pageTab])

  useEffect(() => {
    setRunwayYearKey(null)
  }, [selectedScenarioId, pageTab, startYear, endYear])

  useEffect(() => {
    if (pageTab !== 'runway' || runwayYearKey == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setRunwayYearKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pageTab, runwayYearKey])

  const asOf = useMemo(() => new Date(), [])

  const deps: OverviewBuildDeps = useMemo(
    () => ({
      portfolios,
      stockScenarios,
      savingsAccounts,
      incomeCostLines,
      usdToChf,
      asOf,
      portfolioActuals,
    }),
    [portfolios, stockScenarios, savingsAccounts, incomeCostLines, usdToChf, asOf, portfolioActuals],
  )

  const shownCompareIds = useMemo(() => {
    const all = scenarios.map((s) => s.id)
    if (compareIds == null) return all
    return compareIds.filter((id) => all.includes(id))
  }, [scenarios, compareIds])

  const compareScenarios = useMemo(
    () => scenarios.filter((s) => shownCompareIds.includes(s.id)),
    [scenarios, shownCompareIds],
  )

  const recordedByYear = useMemo(() => {
    const src =
      chartMode === 'compare'
        ? compareScenarios.flatMap((s) => s.series)
        : series
    return recordedOverviewByYear(src, deps)
  }, [chartMode, compareScenarios, series, deps])
  const hasRecorded = recordedByYear.size > 0
  const overlayGoals = showGoals ? goals : []
  const runwayConfig = selectedScenario?.runway ?? defaultRunwayConfig()
  const runwaySeries = useMemo(() => runwayAssetSeries(series), [series])
  const runwayModel = useMemo(
    () =>
      buildRunwayModel(
        { startYear, endYear, series },
        deps,
        runwayConfig,
      ),
    [startYear, endYear, series, deps, runwayConfig],
  )
  const runwayRows = runwayModel.rows
  const runwayColors = useMemo(() => assignOverviewSeriesColors(runwaySeries), [runwaySeries])
  const selectedRunwayFlow =
    runwayYearKey != null && runwayYearKey !== 'now'
      ? (runwayModel.flows.get(Number(runwayYearKey)) ?? null)
      : null

  const selectRunwayYear = useCallback((xKey: string) => {
    setRunwayYearKey((cur) => (cur === xKey ? null : xKey))
  }, [])
  const chartSeries = pageTab === 'runway' ? runwaySeries : series
  const effectiveChartMode: ChartMode =
    pageTab === 'runway' && chartMode === 'compare' ? 'bars' : chartMode

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
    chartMode === 'compare'
      ? compareScenarios.some((sc) =>
          sc.series.some((s) => s.enabled && s.type === 'portfolio'),
        )
      : series.some((s) => s.enabled && s.type === 'portfolio')

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
      // Prefer unused account
      const used = new Set(
        series.filter((s) => s.type === 'savings').map((s) => s.savingsAccountId),
      )
      const a = savingsAccounts.find((x) => !used.has(x.id)) ?? savingsAccounts[0]
      if (!a) return
      addSeries({
        type: 'savings',
        name: a.name?.trim() || '',
        savingsAccountId: a.id,
      })
      return
    }
    // Manual: year → IC → % bindings (unclaimed → permanent leftover)
    addSeries({
      type: 'manual',
      name: '',
      baseChf: 0,
      annualRatePercent: 0,
      baseYear: asOf.getFullYear(),
      yearBindings: [],
    })
  }

  function handleSaveAs() {
    const name = saveAsName.trim() || `Copy of ${selectedScenario?.name ?? 'scenario'}`
    const sc = saveAsScenario(name, savingsAccounts)
    if (sc) {
      setCompareIds((prev) => (prev == null ? null : [...prev, sc.id]))
      setSaveAsName('')
      setShowSaveAs(false)
    }
  }

  function toggleCompareId(id: string) {
    setCompareIds((prev) => {
      const base = prev ?? scenarios.map((s) => s.id)
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    })
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {/* Scenario strip — open toolbar */}
      <div className="section border-b border-white/5 pb-5">
        <div className="section-header">
          <div className="flex items-center gap-1.5">
            <span className="section-title">Scenarios</span>
            <InfoTip label="About overview scenarios">
              Each scenario is a net-worth stack (portfolios, savings, manuals). Bars or area show
              one scenario; Compare plots totals as lines. Optional notes store assumptions only.
            </InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              onClick={() => {
                const sc = addScenario(undefined, savingsAccounts)
                if (sc) setCompareIds((prev) => (prev == null ? null : [...prev, sc.id]))
              }}
            >
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input !w-auto min-w-[10rem] !py-1.5 !text-xs"
            value={selectedScenarioId ?? ''}
            onChange={(e) => selectScenario(e.target.value)}
            aria-label="Select scenario"
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

        {selectedScenario ? (
          <textarea
            id="overview-scenario-description"
            className="input min-h-[2.75rem] w-full resize-y !py-1.5 !text-xs leading-relaxed"
            rows={2}
            value={selectedScenario.description ?? ''}
            placeholder="Notes / assumptions (optional)"
            onChange={(e) =>
              updateScenario(selectedScenario.id, { description: e.target.value })
            }
            aria-label="Scenario notes"
          />
        ) : null}
      </div>

      <div
        className="inline-flex gap-1 border-b border-white/10"
        role="group"
        aria-label="Overview page"
      >
        {(
          [
            { id: 'networth' as const, label: 'Net worth' },
            { id: 'runway' as const, label: 'Runway' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPageTab(t.id)}
            className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
              pageTab === t.id
                ? 'border-emerald-400 text-white'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="panel relative z-10 space-y-3 overflow-visible">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h3 className="section-title">
              {pageTab === 'runway' ? (
                <>
                  Runway
                  {selectedScenario ? (
                    <span className="ml-2 font-normal text-white/40">
                      · {selectedScenario.name}
                    </span>
                  ) : null}
                </>
              ) : chartMode === 'compare' ? (
                <>
                  Compare
                  <span className="ml-2 font-normal text-white/40">· scenarios</span>
                </>
              ) : (
                <>
                  Net worth
                  {selectedScenario ? (
                    <span className="ml-2 font-normal text-white/40">
                      · {selectedScenario.name}
                    </span>
                  ) : null}
                </>
              )}
            </h3>
            <InfoTip label="About overview chart">
              {effectiveChartMode === 'compare'
                ? 'Past years → Now (live) → future. Each line is total net worth for a scenario (enabled series only).'
                : 'Past years → Now (live) → future. CHF. Bars or stacked area. Portfolio greens, savings blues, manual amber/violet.'}
            </InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex gap-1 border-b border-white/10"
              role="group"
              aria-label="Chart mode"
            >
              {(
                pageTab === 'runway'
                  ? [
                      { id: 'bars' as const, label: 'Bars' },
                      { id: 'area' as const, label: 'Area' },
                    ]
                  : [
                      { id: 'bars' as const, label: 'Bars' },
                      { id: 'area' as const, label: 'Area' },
                      { id: 'compare' as const, label: 'Compare' },
                    ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (
                      pageTab === 'runway' &&
                      chartMode === 'compare' &&
                      opt.id === 'bars'
                    ) {
                      return
                    }
                    setChartMode(opt.id)
                  }}
                  className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                    effectiveChartMode === opt.id
                      ? 'border-emerald-400 text-white'
                      : 'border-transparent text-white/50 hover:text-white/80'
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
            <span className="text-[11px] text-white/40">{OVERVIEW_CURRENCY}</span>
          </div>
        </div>

        {pageTab === 'networth' && chartMode === 'compare' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-white/45">Show</span>
            {scenarios.map((s) => {
              const on = shownCompareIds.includes(s.id)
              return (
                <label
                  key={s.id}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
                    on
                      ? 'bg-white/10 text-white/90'
                      : 'text-white/40 hover:bg-white/5 hover:text-white/70'
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
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
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
            effectiveChartMode === 'compare'
              ? 'Overview · compare scenarios'
              : `Overview · ${selectedScenario?.name ?? 'net worth'}`
          }
        >
          {effectiveChartMode === 'bars' ? (
            <OverviewChart
              key={`bars-${pageTab}-${selectedScenarioId}-${startYear}-${endYear}`}
              startYear={startYear}
              endYear={endYear}
              series={chartSeries}
              deps={deps}
              recordedByYear={recordedByYear}
              showRecorded={pageTab === 'networth' && hasRecorded && showRecorded}
              annotations={pageTab === 'networth' ? annotations : []}
              goals={pageTab === 'networth' ? overlayGoals : []}
              prebuiltRows={pageTab === 'runway' ? runwayRows : undefined}
              selectedXKey={pageTab === 'runway' ? runwayYearKey : null}
              onSelectYear={pageTab === 'runway' ? selectRunwayYear : undefined}
            />
          ) : effectiveChartMode === 'area' ? (
            <OverviewAreaChart
              key={`area-${pageTab}-${selectedScenarioId}-${startYear}-${endYear}`}
              startYear={startYear}
              endYear={endYear}
              series={chartSeries}
              deps={deps}
              recordedByYear={recordedByYear}
              showRecorded={pageTab === 'networth' && hasRecorded && showRecorded}
              annotations={pageTab === 'networth' ? annotations : []}
              goals={pageTab === 'networth' ? overlayGoals : []}
              prebuiltRows={pageTab === 'runway' ? runwayRows : undefined}
              onSelectYear={pageTab === 'runway' ? selectRunwayYear : undefined}
            />
          ) : (
            <OverviewCompareChart
              key={`compare-${startYear}-${endYear}-${shownCompareIds.join(',')}`}
              scenarios={compareScenarios}
              startYear={startYear}
              endYear={endYear}
              deps={deps}
              recordedByYear={recordedByYear}
              showRecorded={hasRecorded && showRecorded}
              annotations={annotations}
              goals={overlayGoals}
            />
          )}
        </FullscreenChart>

        {pageTab === 'runway' ? (
          <RunwayYearFlowPanel
            selectedXKey={runwayYearKey}
            flow={selectedRunwayFlow}
            colorById={runwayColors}
            onClear={() => setRunwayYearKey(null)}
          />
        ) : null}

        {pageTab === 'runway' && selectedScenario ? (
          <RunwayConfig
            key={selectedScenario.id}
            config={runwayConfig}
            incomeCostScenarios={incomeCostScenarios}
            incomeCostLines={incomeCostLines}
            series={runwaySeries}
            savingsAccounts={savingsAccounts}
            onChange={(patch) =>
              updateScenario(selectedScenario.id, {
                runway: { ...runwayConfig, ...patch },
              })
            }
            onUpdateSeries={updateSeries}
          />
        ) : null}
        {pageTab === 'networth' ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <ChartNotes
              annotations={annotations}
              error={notesError}
              defaultYear={asOf.getFullYear()}
              onAdd={addAnnotation}
              onUpdate={updateAnnotation}
              onRemove={removeAnnotation}
            />
            <ChartGoals
              goals={goals}
              error={goalsError}
              defaultYear={endYear}
              show={showGoals}
              onShowChange={setShowGoals}
              onAdd={addGoal}
              onUpdate={updateGoal}
              onRemove={removeGoal}
              showToggle={false}
            />
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 text-[11px]">
            {hasRecorded ? (
              <label className="grid cursor-pointer grid-cols-[1rem_auto] items-center gap-1.5 text-white/55 hover:text-white/80">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 justify-self-center accent-amber-400"
                  checked={showRecorded}
                  onChange={() => setShowRecorded((v) => !v)}
                />
                <span>Show recorded actuals</span>
              </label>
            ) : null}
            {goals.length > 0 ? (
              <label className="grid cursor-pointer grid-cols-[1rem_auto] items-center gap-1.5 text-white/55 hover:text-white/80">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 justify-self-center accent-violet-400"
                  checked={showGoals}
                  onChange={() => setShowGoals(!showGoals)}
                />
                <span>Show Goals</span>
              </label>
            ) : null}
          </div>
        </div>
        ) : null}
      </div>

      {pageTab === 'networth' ? (
      <div className="panel space-y-3">
        {effectiveChartMode === 'compare' && selectedScenario ? (
          <p className="text-xs text-white/45">
            Editing series for <span className="text-white/75">{selectedScenario.name}</span>
          </p>
        ) : null}
        <OverviewSeriesEditor
          series={series}
          portfolios={portfolios}
          savingsAccounts={savingsAccounts}
          incomeCostScenarios={incomeCostScenarios}
          onAdd={handleAdd}
          onAddSavings={(accountId) => {
            const a = savingsAccounts.find((x) => x.id === accountId)
            if (!a) return
            if (series.some((s) => s.type === 'savings' && s.savingsAccountId === accountId)) {
              return
            }
            addSeries({
              type: 'savings',
              name: a.name?.trim() || '',
              savingsAccountId: a.id,
            })
          }}
          onUpdate={updateSeries}
          onToggle={(id) => toggleSeries(id, savingsAccounts)}
          onSetSavingsEnabled={setSavingsGroupEnabled}
          onRemove={(id) => removeSeries(id, savingsAccounts)}
          onReorderGroups={reorderSeriesGroups}
          onReorderSavings={reorderSavingsSeries}
        />
      </div>
      ) : null}
    </div>
  )
}

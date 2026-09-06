import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CashflowLine,
  CashflowScenario,
  DisplayCurrency,
  PortfolioContributionsState,
  PortfolioActualsState,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import {
  buildPortfolioGrid,
  earliestActualYear,
  withResolvedDepositAmounts,
  type PortfolioChartMode,
} from '../../lib/portfolio'
import { fetchFxRateClient } from '../../lib/fx'
import { parseMoney } from '../../lib/format'
import {
  loadSelectedPortfolioId,
  persistSelectedPortfolioId,
} from '../../lib/portfolioStorage'
import {
  PortfolioHoldingsEditor,
  type PortfolioEditorPanel,
} from './PortfolioHoldingsEditor'
import { PortfolioValueTable } from './PortfolioValueTable'
import { PortfolioChart } from './PortfolioChart'
import { PortfolioActualsEditor } from './PortfolioActualsEditor'
import { PortfolioMoneyIn } from './PortfolioMoneyIn'
import { FullscreenChart } from '../common/FullscreenChart'
import { InfoTip } from '../common/InfoTip'

const CURRENCY_KEY = 'grok-lab-portfolio-currency'
const PANEL_KEY = 'grok-lab-portfolio-panel'
const CHART_MODE_KEY = 'grok-lab-portfolio-chart-mode'
const CASH_INVESTED_KEY = 'grok-lab-portfolio-cash-invested'
const SHOW_ROI_KEY = 'grok-lab-portfolio-show-roi'
const SHOW_TARGET_KEY = 'grok-lab-portfolio-show-target'

type WorkspaceTab = 'chart' | 'actuals' | PortfolioEditorPanel

const TABS: { id: WorkspaceTab; label: string; short: string }[] = [
  { id: 'chart', label: 'Chart', short: 'Chart' },
  { id: 'actuals', label: 'Actuals', short: 'Act.' },
  { id: 'cash', label: 'Cash', short: 'Cash' },
  { id: 'positions', label: 'Positions', short: 'Pos.' },
  { id: 'growth', label: 'Growth', short: 'Growth' },
]

function readCurrency(): DisplayCurrency {
  try {
    const v = localStorage.getItem(CURRENCY_KEY)
    return v === 'CHF' ? 'CHF' : 'USD'
  } catch {
    return 'USD'
  }
}

function readSelectedPortfolioId(portfolios: SavedPortfolio[]): string | null {
  const v = loadSelectedPortfolioId()
  if (v && portfolios.some((p) => p.id === v)) return v
  return portfolios[0]?.id ?? null
}

function readPanel(): WorkspaceTab {
  try {
    const v = localStorage.getItem(PANEL_KEY)
    if (
      v === 'chart' ||
      v === 'actuals' ||
      v === 'cash' ||
      v === 'positions' ||
      v === 'growth'
    )
      return v
  } catch {
    /* ignore */
  }
  return 'positions'
}

function readChartMode(): PortfolioChartMode {
  try {
    const v = localStorage.getItem(CHART_MODE_KEY)
    if (v === 'total' || v === 'stacked') return v
  } catch {
    /* ignore */
  }
  return 'stacked'
}

function readCashInvested(): boolean {
  try {
    return localStorage.getItem(CASH_INVESTED_KEY) === '1'
  } catch {
    return false
  }
}

function readShowRoi(): boolean {
  try {
    return localStorage.getItem(SHOW_ROI_KEY) === '1'
  } catch {
    return false
  }
}

function readShowTarget(): boolean {
  try {
    return localStorage.getItem(SHOW_TARGET_KEY) === '1'
  } catch {
    return false
  }
}

type Props = {
  scenarios: SavedScenario[]
  portfolios: SavedPortfolio[]
  storageError: string | null
  createPortfolio: (name?: string) => SavedPortfolio | null
  updatePortfolio: (id: string, patch: Partial<SavedPortfolio>) => boolean
  deletePortfolio: (id: string) => boolean
  copyPortfolio: (id: string, name: string) => SavedPortfolio | null
  reorderPortfolios: (orderedIds: string[]) => boolean
  incomeCostScenarios?: CashflowScenario[]
  incomeCostLines?: CashflowLine[]
  contributions: PortfolioContributionsState
  contributionsError: string | null
  setContributionYear: (year: number, amount: number | null) => void
  setContributionsCurrency: (currency: DisplayCurrency) => void
  portfolioActuals: PortfolioActualsState
  actualsError: string | null
  setPortfolioActuals: (next: PortfolioActualsState) => void
}

export function PortfolioView({
  scenarios,
  portfolios,
  storageError,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  copyPortfolio,
  reorderPortfolios,
  incomeCostScenarios = [],
  incomeCostLines = [],
  contributions,
  contributionsError,
  setContributionYear,
  setContributionsCurrency,
  portfolioActuals,
  actualsError,
  setPortfolioActuals,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readSelectedPortfolioId(portfolios),
  )
  const [panel, setPanel] = useState<WorkspaceTab>(readPanel)
  const [actualsKind, setActualsKind] = useState<'value' | 'moneyin'>('value')
  const [chartMode, setChartMode] = useState<PortfolioChartMode>(readChartMode)
  const [showCashInvested, setShowCashInvested] = useState(readCashInvested)
  const [showRoi, setShowRoi] = useState(readShowRoi)
  const [showTarget, setShowTarget] = useState(readShowTarget)
  const [anchorDraft, setAnchorDraft] = useState('')
  const [rateDraft, setRateDraft] = useState('')
  const [yearDraft, setYearDraft] = useState('')
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(readCurrency)
  const [usdToChf, setUsdToChf] = useState<number | null>(null)
  const [fxAsOf, setFxAsOf] = useState<string | null>(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState<string | null>(null)
  const [focusNameId, setFocusNameId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const manageRef = useRef<HTMLDivElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_KEY, displayCurrency)
    } catch {
      /* ignore */
    }
  }, [displayCurrency])

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, panel)
    } catch {
      /* ignore */
    }
  }, [panel])

  useEffect(() => {
    try {
      localStorage.setItem(CHART_MODE_KEY, chartMode)
    } catch {
      /* ignore */
    }
  }, [chartMode])

  useEffect(() => {
    if (!selectedId) return
    if (loadSelectedPortfolioId() === selectedId) return
    persistSelectedPortfolioId(selectedId)
  }, [selectedId])

  const loadFx = useCallback(async () => {
    setFxLoading(true)
    setFxError(null)
    try {
      const q = await fetchFxRateClient('USD', 'CHF')
      setUsdToChf(q.rate)
      setFxAsOf(q.asOf)
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
    if (selectedId && portfolios.some((p) => p.id === selectedId)) return
    const stored = loadSelectedPortfolioId()
    if (stored && portfolios.some((p) => p.id === stored)) {
      setSelectedId(stored)
      return
    }
    setSelectedId(portfolios[0]?.id ?? null)
  }, [portfolios, selectedId])

  // Focus rename when creating/copying
  useEffect(() => {
    if (!focusNameId) return
    setManageOpen(true)
    const t = window.setTimeout(() => {
      renameRef.current?.focus()
      renameRef.current?.select()
    }, 80)
    return () => window.clearTimeout(t)
  }, [focusNameId])

  // Close dropdowns on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(t)) {
        setPickerOpen(false)
      }
      if (manageOpen && manageRef.current && !manageRef.current.contains(t)) {
        // keep open while focusing rename after create — only close if not focusing name
        if (focusNameId) return
        setManageOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pickerOpen, manageOpen, focusNameId])

  const selected = portfolios.find((p) => p.id === selectedId) ?? null
  const currentYear = new Date().getFullYear()

  // Period state must be declared with other hooks before any conditional returns
  // and keep a fixed dependency array size (React requirement).
  const [periodFrom, setPeriodFrom] = useState(currentYear)
  const [periodTo, setPeriodTo] = useState(currentYear)
  const [fromDraft, setFromDraft] = useState(String(currentYear))
  const [toDraft, setToDraft] = useState(String(currentYear))
  const [rangeCustom, setRangeCustom] = useState(false)

  const baseGrid = useMemo(() => {
    if (!selected) return null
    const resolved = withResolvedDepositAmounts(selected, {
      incomeCostLines,
      usdToChf,
    })
    return buildPortfolioGrid(resolved, scenarios, currentYear)
  }, [selected, scenarios, selected?.updatedAt, incomeCostLines, usdToChf, currentYear])

  const lastInputYear = baseGrid?.lastStatedYear ?? currentYear
  const firstInputYear =
    baseGrid && baseGrid.years.length > 0 ? baseGrid.years[0]! : currentYear

  const selectedPortfolioId = selected?.id ?? null

  useEffect(() => {
    const t = selected?.targetCompound
    setAnchorDraft(t != null && t.amount > 0 ? String(t.amount) : '')
    setRateDraft(t != null && Number.isFinite(t.ratePercent) ? String(t.ratePercent) : '')
    setYearDraft(
      t != null && Number.isFinite(t.year) ? String(t.year) : String(currentYear),
    )
  }, [
    selectedPortfolioId,
    selected?.targetCompound?.amount,
    selected?.targetCompound?.ratePercent,
    selected?.targetCompound?.currency,
    selected?.targetCompound?.year,
    currentYear,
  ])

  function commitTarget() {
    if (!selected) return
    const amount = parseMoney(anchorDraft)
    const rate = Number(rateDraft)
    if (amount == null || !(amount > 0) || !Number.isFinite(rate)) {
      if (selected.targetCompound) updatePortfolio(selected.id, { targetCompound: null })
      if (amount == null || !(amount > 0)) setAnchorDraft('')
      if (!Number.isFinite(rate)) setRateDraft('')
      return
    }
    const parsedYear = Number(yearDraft)
    const year =
      Number.isFinite(parsedYear) && parsedYear >= 1000 && parsedYear <= 9999
        ? Math.floor(parsedYear)
        : (selected.targetCompound?.year ?? currentYear)
    updatePortfolio(selected.id, {
      targetCompound: {
        amount,
        currency: displayCurrency,
        ratePercent: rate,
        year,
      },
    })
    setAnchorDraft(String(amount))
    setRateDraft(String(rate))
    setYearDraft(String(year))
  }

  function autoFromYear() {
    const earliest =
      selectedPortfolioId && selected
        ? earliestActualYear(portfolioActuals, firstInputYear)
        : firstInputYear
    return Math.min(earliest, firstInputYear)
  }

  function applyAutoRange() {
    const from = autoFromYear()
    setPeriodFrom(from)
    setPeriodTo(lastInputYear)
    setFromDraft(String(from))
    setToDraft(String(lastInputYear))
  }

  // Switching portfolio always takes the auto span.
  useEffect(() => {
    setRangeCustom(false)
    const earliest =
      selectedPortfolioId && selected
        ? earliestActualYear(portfolioActuals, firstInputYear)
        : firstInputYear
    const from = Math.min(earliest, firstInputYear)
    setPeriodFrom(from)
    setPeriodTo(lastInputYear)
    setFromDraft(String(from))
    setToDraft(String(lastInputYear))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- portfolio switch only
  }, [selectedPortfolioId])

  // Follow input-year span until the user sets a custom From–To.
  useEffect(() => {
    if (rangeCustom) return
    applyAutoRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-follow stated span
  }, [firstInputYear, lastInputYear, rangeCustom])

  function applyPeriod(fromStr: string, toStr: string) {
    const from = Number(fromStr)
    const to = Number(toStr)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return
    if (from < 1000 || from > 9999 || to < 1000 || to > 9999) return
    let a = Math.floor(from)
    let b = Math.floor(to)
    if (b < a) {
      const t = a
      a = b
      b = t
    }
    const autoFrom = autoFromYear()
    setRangeCustom(a !== autoFrom || b !== lastInputYear)
    setPeriodFrom(a)
    setPeriodTo(b)
    setFromDraft(String(a))
    setToDraft(String(b))
  }

  /** Deposits (incl. CHF / surplus) as USD book — must be used for chart cash math */
  const resolvedSelected = useMemo(() => {
    if (!selected) return null
    return withResolvedDepositAmounts(selected, {
      incomeCostLines,
      usdToChf,
    })
  }, [selected, selected?.updatedAt, incomeCostLines, usdToChf])

  const grid = useMemo(() => {
    if (!resolvedSelected) return null
    const throughYear = Math.max(periodTo, lastInputYear)
    const full = buildPortfolioGrid(resolvedSelected, scenarios, currentYear, {
      throughYear,
    })
    const idxs: number[] = []
    full.years.forEach((y, i) => {
      if (y >= periodFrom && y <= periodTo) idxs.push(i)
    })
    if (idxs.length === 0) return full
    return {
      years: idxs.map((i) => full.years[i]!),
      rows: full.rows.map((r) => ({
        ...r,
        values: idxs.map((i) => r.values[i] ?? null),
      })),
      totals: idxs.map((i) => full.totals[i] ?? null),
      lastStatedYear: full.lastStatedYear,
    }
  }, [
    resolvedSelected,
    scenarios,
    currentYear,
    periodFrom,
    periodTo,
    lastInputYear,
  ])

  const canConvert = displayCurrency === 'USD' || (usdToChf != null && usdToChf > 0)
  const activeCurrency: DisplayCurrency = canConvert ? displayCurrency : 'USD'

  function handleCreate() {
    const created = createPortfolio(`Portfolio ${portfolios.length + 1}`)
    if (created) {
      setSelectedId(created.id)
      setFocusNameId(created.id)
      setPanel('positions')
    }
  }

  function handleCopy(p: SavedPortfolio) {
    const created = copyPortfolio(p.id, `Copy of ${p.name}`)
    if (created) {
      setSelectedId(created.id)
      setFocusNameId(created.id)
    }
  }

  function movePortfolio(id: string, direction: 'up' | 'down') {
    const ids = portfolios.map((p) => p.id)
    const i = ids.indexOf(id)
    if (i < 0) return
    const j = direction === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    ;[next[i], next[j]] = [next[j], next[i]]
    reorderPortfolios(next)
  }

  function onDropOn(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const ids = portfolios.map((p) => p.id)
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
    reorderPortfolios(next)
    setDragId(null)
    setDragOverId(null)
  }

  function setCurrency(next: DisplayCurrency) {
    setDisplayCurrency(next)
    if (next === 'CHF' && usdToChf == null && !fxLoading) void loadFx()
  }

  const rateLabel =
    usdToChf != null
      ? `1 USD = ${usdToChf.toFixed(4)} CHF${fxAsOf ? ` · ${fxAsOf}` : ''}`
      : fxLoading
        ? 'Loading FX…'
        : fxError
          ? `FX: ${fxError}`
          : 'FX unavailable'

  const editorPanel: PortfolioEditorPanel | null =
    panel === 'cash' || panel === 'positions' || panel === 'growth' ? panel : null

  return (
    <div className="space-y-5">
      <div className="relative z-40 space-y-3">
        <nav
          className="flex gap-1 overflow-x-auto border-b border-white/10"
          aria-label="Portfolio sections"
          role="tablist"
        >
          {TABS.map((t) => {
            const active = panel === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPanel(t.id)}
                className={`-mb-px shrink-0 border-b-2 px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'border-emerald-400 text-white'
                    : 'border-transparent text-white/50 hover:text-white/80'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </nav>

      {/* Top bar — z-index so portfolio/manage menus paint above the workspace panel */}
      <div className="relative z-40 flex flex-wrap items-center gap-3 pb-3">
        <div className="relative z-50 min-w-0 flex-1" ref={pickerRef}>
          <label className="sr-only" htmlFor="portfolio-picker">
            Portfolio
          </label>
          <button
            id="portfolio-picker"
            type="button"
            className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-white/20"
            onClick={() => {
              setPickerOpen((o) => !o)
              setManageOpen(false)
            }}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Portfolio
              </span>
              <span className="block truncate text-sm font-semibold text-white sm:whitespace-normal sm:break-words">
                {selected?.name ?? 'Select portfolio…'}
              </span>
            </span>
            <span className="shrink-0 text-white/40" aria-hidden>
              ▾
            </span>
          </button>
          {pickerOpen && (
            <ul
              className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#121820] py-1 shadow-xl shadow-black/50"
              role="listbox"
            >
              {portfolios.length === 0 ? (
                <li className="px-3 py-2 text-sm text-white/40">No portfolios yet</li>
              ) : (
                portfolios.map((p) => (
                  <li key={p.id} role="option" aria-selected={p.id === selectedId}>
                    <button
                      type="button"
                      className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-white/5 ${
                        p.id === selectedId ? 'bg-emerald-500/15' : ''
                      }`}
                      onClick={() => {
                        setSelectedId(p.id)
                        setPickerOpen(false)
                      }}
                    >
                      <span className="text-sm font-medium text-white">{p.name}</span>
                      <span className="text-[11px] text-white/40">
                        {p.holdings.length} holding{p.holdings.length === 1 ? '' : 's'}
                        {(p.deposits?.length ?? 0) > 0
                          ? ` · ${p.deposits!.length} deposit${p.deposits!.length === 1 ? '' : 's'}`
                          : ''}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-primary !px-2.5 !py-1.5 text-xs" onClick={handleCreate}>
            New
          </button>
          {selected && (
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              onClick={() => handleCopy(selected)}
            >
              Copy
            </button>
          )}
          <div className="relative z-50" ref={manageRef}>
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              onClick={() => {
                setManageOpen((o) => !o)
                setPickerOpen(false)
              }}
              aria-expanded={manageOpen}
            >
              Manage…
            </button>
            {manageOpen && (
              <div className="absolute right-0 z-50 mt-1 w-[min(100vw-2rem,22rem)] rounded-xl border border-white/15 bg-[#121820] p-3 shadow-xl shadow-black/50">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  Manage portfolios
                </p>
                {storageError && (
                  <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
                    {storageError}
                  </p>
                )}
                {selected && (
                  <div className="mb-3">
                    <label className="label">Rename selected</label>
                    <input
                      ref={renameRef}
                      className="input"
                      value={selected.name}
                      onChange={(e) => updatePortfolio(selected.id, { name: e.target.value })}
                      onBlur={() => {
                        if (focusNameId === selected.id) setFocusNameId(null)
                      }}
                    />
                  </div>
                )}
                {portfolios.length === 0 ? (
                  <p className="text-sm text-white/40">Create a portfolio to get started.</p>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {portfolios.map((p, index) => {
                      const isDragOver = dragOverId === p.id && dragId !== p.id
                      return (
                        <li
                          key={p.id}
                          draggable
                          onDragStart={(e) => {
                            setDragId(p.id)
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', p.id)
                          }}
                          onDragEnd={() => {
                            setDragId(null)
                            setDragOverId(null)
                          }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            if (dragOverId !== p.id) setDragOverId(p.id)
                          }}
                          onDragLeave={() => {
                            if (dragOverId === p.id) setDragOverId(null)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            onDropOn(p.id)
                          }}
                          className={`flex items-center gap-1 rounded-lg border px-1 py-1 ${
                            p.id === selectedId
                              ? 'border-emerald-500/40 bg-emerald-500/10'
                              : isDragOver
                                ? 'border-sky-500/50 bg-sky-500/10'
                                : 'border-white/5 bg-white/[0.03]'
                          } ${dragId === p.id ? 'opacity-50' : ''}`}
                        >
                          <span
                            className="cursor-grab px-1 text-white/30 active:cursor-grabbing"
                            title="Drag to reorder"
                          >
                            ⠿
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              className="text-[10px] text-white/35 hover:text-white disabled:opacity-20"
                              disabled={index === 0}
                              onClick={() => movePortfolio(p.id, 'up')}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="text-[10px] text-white/35 hover:text-white disabled:opacity-20"
                              disabled={index === portfolios.length - 1}
                              onClick={() => movePortfolio(p.id, 'down')}
                            >
                              ▼
                            </button>
                          </div>
                          <button
                            type="button"
                            className="min-w-0 flex-1 px-1 py-1 text-left text-sm text-white"
                            onClick={() => setSelectedId(p.id)}
                          >
                            {p.name}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-white/40 hover:bg-red-500/20 hover:text-red-300"
                            title="Delete"
                            onClick={() => {
                              if (confirm(`Delete portfolio “${p.name}”?`)) deletePortfolio(p.id)
                            }}
                          >
                            ✕
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div
            className="inline-flex gap-1 border-b border-white/10"
            role="group"
            aria-label="Display currency"
          >
            {(['USD', 'CHF'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                  displayCurrency === c
                    ? 'border-emerald-400 text-white'
                    : 'border-transparent text-white/50 hover:text-white/80'
                }`}
              >
                {c === 'USD' ? 'USD' : 'CHF'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden text-[11px] text-white/40 sm:inline">{rateLabel}</span>
            {displayCurrency === 'CHF' && usdToChf == null && (
              <button
                type="button"
                className="btn-ghost !px-2 !py-1 !text-[11px]"
                onClick={() => void loadFx()}
                disabled={fxLoading}
              >
                Retry rate
              </button>
            )}
          </div>
        </div>
      </div>
      </div>

      {displayCurrency === 'CHF' && usdToChf == null && !fxLoading && (
        <p className="text-[11px] text-amber-300/90">
          Showing USD amounts until a live CHF rate is available.
        </p>
      )}

      {!selected ? (
        <div className="flex items-center justify-center p-8 text-sm text-white/40">
          Create or select a portfolio to get started.
        </div>
      ) : (
        <div className="panel min-h-0 min-w-0 space-y-5">
            {panel === 'chart' && grid && (
              <div className="space-y-5">
                <div className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <h3 className="section-title">Portfolio value</h3>
                    <InfoTip label="About portfolio chart">
                      Timeline: past → Now (live) → future. Past years use Actuals (last month of
                      year) in portfolio value mode. Extend To for growth projections.
                    </InfoTip>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className="inline-flex gap-1 border-b border-white/10"
                      role="group"
                      aria-label="Chart display mode"
                    >
                      <button
                        type="button"
                        className={`-mb-px border-b-2 px-2.5 py-1 text-[11px] font-medium transition ${
                          chartMode === 'stacked'
                            ? 'border-emerald-400 text-white'
                            : 'border-transparent text-white/50 hover:text-white/80'
                        }`}
                        onClick={() => setChartMode('stacked')}
                      >
                        By position
                      </button>
                      <button
                        type="button"
                        className={`-mb-px border-b-2 px-2.5 py-1 text-[11px] font-medium transition ${
                          chartMode === 'total'
                            ? 'border-emerald-400 text-white'
                            : 'border-transparent text-white/50 hover:text-white/80'
                        }`}
                        onClick={() => setChartMode('total')}
                      >
                        Portfolio value
                      </button>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showCashInvested}
                      title="Overlay invested vs cash % on the bars (right axis)"
                      className={`rounded-md px-2 py-1 text-[11px] transition ${
                        showCashInvested
                          ? 'bg-sky-500/20 text-sky-200'
                          : 'text-white/45 hover:bg-white/5 hover:text-white/70'
                      }`}
                      onClick={() => {
                        const next = !showCashInvested
                        setShowCashInvested(next)
                        try {
                          localStorage.setItem(CASH_INVESTED_KEY, next ? '1' : '0')
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Cash / invested
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showRoi}
                      title="Overlay ROI % on the bars (right axis)"
                      className={`rounded-md px-2 py-1 text-[11px] transition ${
                        showRoi
                          ? 'bg-fuchsia-500/20 text-fuchsia-200'
                          : 'text-white/45 hover:bg-white/5 hover:text-white/70'
                      }`}
                      onClick={() => {
                        const next = !showRoi
                        setShowRoi(next)
                        try {
                          localStorage.setItem(SHOW_ROI_KEY, next ? '1' : '0')
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      ROI
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showTarget}
                      title="Overlay a compounding target from an anchor year. Past years add Money-in; later years add planned deposits."
                      className={`rounded-md px-2 py-1 text-[11px] transition ${
                        showTarget
                          ? 'bg-red-500/20 text-red-200'
                          : 'text-white/45 hover:bg-white/5 hover:text-white/70'
                      }`}
                      onClick={() => {
                        const next = !showTarget
                        setShowTarget(next)
                        try {
                          localStorage.setItem(SHOW_TARGET_KEY, next ? '1' : '0')
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Target
                    </button>
                    <label className="flex items-center gap-1.5 text-xs text-white/50">
                      From
                      <input
                        className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
                        type="number"
                        value={fromDraft}
                        onChange={(e) => {
                          const v = e.target.value
                          setFromDraft(v)
                          applyPeriod(v, toDraft)
                        }}
                        onBlur={() => applyPeriod(fromDraft, toDraft)}
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
                          applyPeriod(fromDraft, v)
                        }}
                        onBlur={() => applyPeriod(fromDraft, toDraft)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-ghost !py-1 !text-[11px]"
                      title="Reset to years with inputs / actuals"
                      onClick={() => {
                        setRangeCustom(false)
                        applyAutoRange()
                      }}
                    >
                      Inputs only
                    </button>
                  </div>
                </div>
                {showTarget ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-white/50">
                      Year
                      <input
                        className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
                        type="number"
                        value={yearDraft}
                        onChange={(e) => setYearDraft(e.target.value)}
                        onBlur={commitTarget}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-white/50">
                      Anchor
                      <input
                        className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
                        inputMode="decimal"
                        placeholder={displayCurrency === 'CHF' ? 'CHF' : '$'}
                        value={anchorDraft}
                        onChange={(e) => setAnchorDraft(e.target.value)}
                        onBlur={commitTarget}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-white/50">
                      Rate
                      <input
                        className="input !w-14 !py-1 !text-xs tabular-nums"
                        inputMode="decimal"
                        placeholder="%"
                        value={rateDraft}
                        onChange={(e) => setRateDraft(e.target.value)}
                        onBlur={commitTarget}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                      <span className="text-white/35">%</span>
                    </label>
                  </div>
                ) : null}
                </div>
                <FullscreenChart title="Portfolio value over time">
                  <PortfolioChart
                    key={`chart-${selected.id}-${selected.updatedAt}-${periodFrom}-${periodTo}-${chartMode}-${grid.years.join(',')}-${Object.keys(portfolioActuals.byMonth).join(',')}`}
                    grid={grid}
                    portfolio={resolvedSelected ?? selected}
                    scenarios={scenarios}
                    displayCurrency={activeCurrency}
                    usdToChf={usdToChf}
                    chartMode={chartMode}
                    fromYear={periodFrom}
                    toYear={periodTo}
                    contributions={contributions}
                    showCashInvested={showCashInvested}
                    showRoi={showRoi}
                    showTarget={showTarget}
                    actuals={portfolioActuals}
                  />
                </FullscreenChart>
                <div className="relative z-20 border-t border-white/[0.06] pt-4">
                  <div className="mb-2 flex items-center gap-1.5">
                    <h3 className="section-title">Value by year</h3>
                    <InfoTip label="About year values and actions">
                      Now is the book as it sits today (shares held and opening cash). Planned
                      buys and sells apply from their year in the year columns — they do not
                      change Now. Selling a position adds proceeds to Cash; buying spends Cash.
                      Deposits land in Cash in their year.
                    </InfoTip>
                  </div>
                  <PortfolioValueTable
                    grid={grid}
                    portfolio={resolvedSelected ?? selected}
                    scenarios={scenarios}
                    displayCurrency={activeCurrency}
                    usdToChf={usdToChf}
                    contributions={contributions}
                  />
                </div>
              </div>
            )}

            {panel === 'chart' && !grid && (
              <p className="text-sm text-white/40">Add cash or holdings to see the chart.</p>
            )}

            {panel === 'actuals' && (
              <div className="space-y-4">
                <div
                  className="inline-flex gap-1 border-b border-white/10"
                  role="group"
                  aria-label="Actuals kind"
                >
                  {(
                    [
                      { id: 'value' as const, label: 'Portfolio value' },
                      { id: 'moneyin' as const, label: 'Money in' },
                    ]
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActualsKind(t.id)}
                      className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                        actualsKind === t.id
                          ? 'border-emerald-400 text-white'
                          : 'border-transparent text-white/50 hover:text-white/80'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-white/40">
                  Same record for every portfolio.
                </p>
                {actualsKind === 'value' ? (
                  <PortfolioActualsEditor
                    actuals={portfolioActuals}
                    onChange={setPortfolioActuals}
                    displayCurrency={activeCurrency}
                    usdToChf={usdToChf}
                    error={actualsError}
                  />
                ) : (
                  <PortfolioMoneyIn
                    contributions={contributions}
                    error={contributionsError}
                    displayCurrency={activeCurrency}
                    usdToChf={usdToChf}
                    currentYear={currentYear}
                    onSetYear={setContributionYear}
                    onSetCurrency={setContributionsCurrency}
                  />
                )}
              </div>
            )}

            {editorPanel && (
              <PortfolioHoldingsEditor
                panel={editorPanel}
                portfolio={selected}
                scenarios={scenarios}
                onChange={(patch) => updatePortfolio(selected.id, patch)}
                displayCurrency={activeCurrency}
                usdToChf={usdToChf}
                incomeCostScenarios={incomeCostScenarios}
                incomeCostLines={incomeCostLines}
                otherPortfolios={portfolios.filter((p) => p.id !== selected.id)}
                onUpdateOtherPortfolio={updatePortfolio}
              />
            )}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CashflowLine,
  CashflowScenario,
  DisplayCurrency,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import { buildPortfolioGrid, withResolvedDepositAmounts } from '../../lib/portfolio'
import { fetchFxRateClient } from '../../lib/fx'
import { PortfolioHoldingsEditor } from './PortfolioHoldingsEditor'
import { PortfolioValueTable } from './PortfolioValueTable'
import { PortfolioChart } from './PortfolioChart'
import { FullscreenChart } from '../common/FullscreenChart'

const LIST_COLLAPSED_KEY = 'grok-lab-portfolio-list-collapsed'
const CURRENCY_KEY = 'grok-lab-portfolio-currency'
const SELECTED_PORTFOLIO_KEY = 'grok-lab-selected-portfolio'

function readListCollapsed(): boolean {
  try {
    return localStorage.getItem(LIST_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function readCurrency(): DisplayCurrency {
  try {
    const v = localStorage.getItem(CURRENCY_KEY)
    return v === 'CHF' ? 'CHF' : 'USD'
  } catch {
    return 'USD'
  }
}

function readSelectedPortfolioId(portfolios: SavedPortfolio[]): string | null {
  try {
    const v = localStorage.getItem(SELECTED_PORTFOLIO_KEY)
    if (v && portfolios.some((p) => p.id === v)) return v
  } catch {
    /* ignore */
  }
  return portfolios[0]?.id ?? null
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
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readSelectedPortfolioId(portfolios),
  )
  const [listCollapsed, setListCollapsed] = useState(readListCollapsed)
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(readCurrency)
  const [usdToChf, setUsdToChf] = useState<number | null>(null)
  const [fxAsOf, setFxAsOf] = useState<string | null>(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState<string | null>(null)
  const [focusNameId, setFocusNameId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(LIST_COLLAPSED_KEY, listCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [listCollapsed])

  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_KEY, displayCurrency)
    } catch {
      /* ignore */
    }
  }, [displayCurrency])

  useEffect(() => {
    if (selectedId) {
      try {
        localStorage.setItem(SELECTED_PORTFOLIO_KEY, selectedId)
      } catch {
        /* ignore */
      }
    }
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
    setSelectedId(portfolios[0]?.id ?? null)
  }, [portfolios, selectedId])

  const selected = portfolios.find((p) => p.id === selectedId) ?? null
  const currentYear = new Date().getFullYear()

  // Base grid = input years only (for defaults + last stated)
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

  // Period picker (defaults to input span; user can extend end to see growth)
  const [periodFrom, setPeriodFrom] = useState(currentYear)
  const [periodTo, setPeriodTo] = useState(currentYear)
  const [fromDraft, setFromDraft] = useState(String(currentYear))
  const [toDraft, setToDraft] = useState(String(currentYear))

  // Reset period when portfolio or its stated years change
  useEffect(() => {
    setPeriodFrom(firstInputYear)
    setPeriodTo(lastInputYear)
    setFromDraft(String(firstInputYear))
    setToDraft(String(lastInputYear))
  }, [selected?.id, firstInputYear, lastInputYear])

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
    setPeriodFrom(a)
    setPeriodTo(b)
    setFromDraft(String(a))
    setToDraft(String(b))
  }

  const grid = useMemo(() => {
    if (!selected) return null
    const resolved = withResolvedDepositAmounts(selected, {
      incomeCostLines,
      usdToChf,
    })
    const throughYear = Math.max(periodTo, lastInputYear)
    const full = buildPortfolioGrid(resolved, scenarios, currentYear, {
      throughYear,
    })
    // Slice to period picker range
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
    selected,
    scenarios,
    selected?.updatedAt,
    incomeCostLines,
    usdToChf,
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
        ? 'Loading FX rate…'
        : fxError
          ? `FX: ${fxError}`
          : 'FX rate unavailable'

  return (
    <div
      className={`grid gap-6 ${listCollapsed ? '' : 'lg:grid-cols-[240px_1fr]'}`}
    >
      {listCollapsed ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <button
            type="button"
            className="btn-ghost !px-2 !py-1 !text-xs"
            onClick={() => setListCollapsed(false)}
            title="Show portfolio list"
          >
            » Portfolios
          </button>
          {selected && (
            <span className="truncate text-sm text-white/70">
              <span className="text-white/40">Active · </span>
              {selected.name}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {selected && (
              <button
                type="button"
                className="btn-ghost !px-2 !py-1 text-xs"
                onClick={() => handleCopy(selected)}
                title="Copy portfolio"
              >
                Copy
              </button>
            )}
            <button
              type="button"
              className="btn-primary !px-2 !py-1 text-xs"
              onClick={handleCreate}
            >
              New
            </button>
          </div>
        </div>
      ) : (
        <aside className="card max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Portfolios</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-ghost !px-2 !py-1 !text-[11px]"
                onClick={() => setListCollapsed(true)}
                title="Hide portfolio list"
              >
                « Hide
              </button>
              <button
                type="button"
                className="btn-primary !px-2 !py-1 text-xs"
                onClick={handleCreate}
              >
                New
              </button>
            </div>
          </div>
          {storageError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
              {storageError}
            </p>
          )}
          {portfolios.length === 0 ? (
            <p className="text-sm text-white/40">
              Create a portfolio to allocate capital across tickers and cash.
            </p>
          ) : (
            <ul className="space-y-1">
              {portfolios.map((p, index) => {
                const selectedRow = p.id === selectedId
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
                  >
                    <div
                      className={`flex items-center gap-0.5 rounded-lg border transition ${
                        selectedRow
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : isDragOver
                            ? 'border-sky-500/50 bg-sky-500/10'
                            : 'border-transparent bg-white/[0.03] hover:border-white/10'
                      } ${dragId === p.id ? 'opacity-50' : ''}`}
                    >
                      <span
                        className="shrink-0 cursor-grab px-1.5 py-2 text-white/30 active:cursor-grabbing"
                        title="Drag to reorder"
                        aria-hidden
                      >
                        ⠿
                      </span>
                      <div className="flex shrink-0 flex-col gap-0.5 py-1">
                        <button
                          type="button"
                          className="rounded px-1 text-[10px] leading-none text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-20"
                          disabled={index === 0}
                          title="Move up"
                          onClick={() => movePortfolio(p.id, 'up')}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="rounded px-1 text-[10px] leading-none text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-20"
                          disabled={index === portfolios.length - 1}
                          title="Move down"
                          onClick={() => movePortfolio(p.id, 'down')}
                        >
                          ▼
                        </button>
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 px-2 py-2 text-left"
                        onClick={() => setSelectedId(p.id)}
                      >
                        <div className="truncate text-sm font-medium text-white">{p.name}</div>
                        <div className="text-[11px] text-white/40">
                          {p.holdings.length} holding{p.holdings.length === 1 ? '' : 's'}
                          {(p.deposits?.length ?? 0) > 0
                            ? ` · ${p.deposits!.length} deposit${p.deposits!.length === 1 ? '' : 's'}`
                            : ''}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-md px-2 py-1 text-[11px] text-white/45 hover:bg-white/10 hover:text-white"
                        title="Copy portfolio"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopy(p)
                        }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="mr-1 shrink-0 rounded-md px-2 py-1 text-[11px] text-white/40 hover:bg-red-500/20 hover:text-red-300"
                        title="Delete portfolio"
                        onClick={() => {
                          if (confirm(`Delete portfolio “${p.name}”?`)) deletePortfolio(p.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {portfolios.length > 1 && (
            <p className="text-[10px] text-white/30">Drag ⠿ or use ▲▼ to reorder</p>
          )}
        </aside>
      )}

      <div className="min-w-0 space-y-5">
        {!selected ? (
          <div className="card flex h-64 items-center justify-center p-8 text-sm text-white/40">
            Create or select a portfolio to get started.
          </div>
        ) : (
          <>
            {grid && (
              <>
                <div className="card p-5">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
                      Portfolio value over time
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
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
                        title="Reset to years with inputs only"
                        onClick={() => {
                          setPeriodFrom(firstInputYear)
                          setPeriodTo(lastInputYear)
                          setFromDraft(String(firstInputYear))
                          setToDraft(String(lastInputYear))
                        }}
                      >
                        Inputs only
                      </button>
                    </div>
                  </div>
                  <p className="mb-2 text-[11px] text-white/35">
                    Default: years with deposits, actions, or projections. Extend{' '}
                    <span className="text-white/50">To</span> to include perpetual growth (green).
                  </p>
                  <FullscreenChart title="Portfolio value over time">
                    <PortfolioChart
                      key={`chart-${selected.id}-${selected.updatedAt}-${activeCurrency}-${usdToChf ?? 0}-${periodFrom}-${periodTo}-${grid.years.join(',')}`}
                      grid={grid}
                      portfolio={selected}
                      scenarios={scenarios}
                      displayCurrency={activeCurrency}
                      usdToChf={usdToChf}
                    />
                  </FullscreenChart>
                </div>
                <div className="card p-5">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
                    Portfolio value by year
                  </h3>
                  <PortfolioValueTable
                    grid={grid}
                    displayCurrency={activeCurrency}
                    usdToChf={usdToChf}
                  />
                </div>
              </>
            )}

            <div className="card p-5">
              <PortfolioHoldingsEditor
                portfolio={selected}
                scenarios={scenarios}
                onChange={(patch) => updatePortfolio(selected.id, patch)}
                displayCurrency={activeCurrency}
                usdToChf={usdToChf}
                onDisplayCurrencyChange={setCurrency}
                rateLabel={rateLabel}
                fxLoading={fxLoading}
                onRetryFx={() => void loadFx()}
                showFxWarning={displayCurrency === 'CHF' && usdToChf == null && !fxLoading}
                autoFocusName={focusNameId === selected.id}
                onNameFocused={() => setFocusNameId(null)}
                incomeCostScenarios={incomeCostScenarios}
                incomeCostLines={incomeCostLines}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

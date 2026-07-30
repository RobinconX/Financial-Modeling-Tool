import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CashflowLine,
  CashflowScenario,
  DisplayCurrency,
  PerpetualYearlyDeposit,
  PortfolioDeposit,
  PortfolioDepositSource,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
  ValuationBasis,
} from '../../types'
import {
  applyPortfolioValuesToTarget,
  cashForYear,
  depositInYear,
  getActions,
  getDeposits,
  getOpeningCash,
  lastExplicitDepositYear,
  newDeposit,
  newHolding,
  newOpeningDeposit,
  resolveCurrentPrice,
  resolveDepositAmount,
  resolvePerpetualYearlyAmount,
  type DepositResolveContext,
  type PropagatePortfolioFields,
  withResolvedDepositAmounts,
} from '../../lib/portfolio'
import { scenarioTotals } from '../../lib/incomeCost'
import { formatMoney, formatPrice, parseMoney } from '../../lib/format'
import { amountToDisplay, fromDisplay, toDisplay } from '../../lib/fx'
import { HoldingActionsEditor } from './PortfolioActionsEditor'

export type PortfolioEditorPanel = 'cash' | 'positions' | 'growth' | 'all'

type Props = {
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  onChange: (patch: Partial<SavedPortfolio>) => void
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
  /** When set, only that workspace panel is shown (currency lives in parent top bar). */
  panel?: PortfolioEditorPanel
  onDisplayCurrencyChange?: (c: DisplayCurrency) => void
  rateLabel?: string
  fxLoading?: boolean
  onRetryFx?: () => void
  showFxWarning?: boolean
  /** Focus + select portfolio name (after New / Copy). */
  autoFocusName?: boolean
  onNameFocused?: () => void
  /** Income/Cost scenarios for surplus-linked deposits (read-only). */
  incomeCostScenarios?: CashflowScenario[]
  incomeCostLines?: CashflowLine[]
  /** Other portfolios for “copy cash & stocks to…” */
  otherPortfolios?: SavedPortfolio[]
  onUpdateOtherPortfolio?: (id: string, patch: Partial<SavedPortfolio>) => boolean
}

const BASIS_OPTIONS: { id: ValuationBasis | 'easy'; label: string }[] = [
  { id: 'easy', label: 'Easy mcap' },
  { id: 'ps', label: 'P/S' },
  { id: 'pfcf', label: 'P/FCF' },
  { id: 'pe', label: 'P/E' },
]

export function PortfolioHoldingsEditor({
  portfolio,
  scenarios,
  onChange,
  displayCurrency = 'USD',
  usdToChf = null,
  panel = 'all',
  onDisplayCurrencyChange,
  rateLabel,
  fxLoading = false,
  onRetryFx,
  showFxWarning = false,
  autoFocusName = false,
  onNameFocused,
  incomeCostScenarios = [],
  incomeCostLines = [],
  otherPortfolios = [],
  onUpdateOtherPortfolio,
}: Props) {
  const showConfig = panel === 'all'
  const showCash = panel === 'all' || panel === 'cash'
  const showGrowth = panel === 'all' || panel === 'growth'
  const showPositions = panel === 'all' || panel === 'positions'
  const currentYear = new Date().getFullYear()
  const depositCtx: DepositResolveContext = {
    incomeCostLines,
    usdToChf,
  }
  /** 'cash' | 'holdings' which panel opened the copy dialog */
  const [propagateMode, setPropagateMode] = useState<'cash' | 'holdings' | null>(null)
  const [propagateIncludeActions, setPropagateIncludeActions] = useState(false)
  const [propagateIds, setPropagateIds] = useState<Record<string, boolean>>({})
  const [propagateMsg, setPropagateMsg] = useState<string | null>(null)
  const resolvedPortfolio = withResolvedDepositAmounts(portfolio, depositCtx)
  let deposits = getDeposits(portfolio)
  // Ensure opening row exists in UI state (persisted via normalize on update)
  if (!deposits.some((d) => d.isOpening)) {
    deposits = [newOpeningDeposit(getOpeningCash(portfolio), currentYear), ...deposits]
  }
  const resolvedDeposits = getDeposits(resolvedPortfolio)
  const resolvedById = new Map(resolvedDeposits.map((d) => [d.id, d]))
  // Default collapsed so chart/totals stay in view; newly added holdings open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  /**
   * Display order only — does not rewrite portfolio.holdings storage order.
   * 'symbol' = A–Z, 'value' = high→low by current $ value.
   */
  const [holdingSort, setHoldingSort] = useState<'manual' | 'symbol' | 'value'>('manual')
  const [showRenameHint, setShowRenameHint] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const knownHoldingIdsRef = useRef<Set<string> | null>(null)
  const lastPortfolioIdRef = useRef(portfolio.id)

  useEffect(() => {
    if (!autoFocusName) return
    const el = nameInputRef.current
    if (!el) return
    // Defer so the config card is mounted after list selection
    const t = window.setTimeout(() => {
      el.focus()
      el.select()
      setShowRenameHint(true)
      onNameFocused?.()
    }, 50)
    return () => window.clearTimeout(t)
  }, [autoFocusName, portfolio.id, onNameFocused])

  const holdingIds = portfolio.holdings.map((h) => h.id).join('|')
  useEffect(() => {
    if (lastPortfolioIdRef.current !== portfolio.id) {
      lastPortfolioIdRef.current = portfolio.id
      knownHoldingIdsRef.current = null
      setExpanded({})
    }

    const ids = holdingIds ? holdingIds.split('|') : []
    const known = knownHoldingIdsRef.current

    setExpanded((prev) => {
      const next: Record<string, boolean> = {}
      let changed = false
      for (const id of ids) {
        if (id in prev) {
          next[id] = prev[id]
        } else if (known === null) {
          // First sync for this portfolio: keep collapsed
          next[id] = false
          changed = true
        } else if (!known.has(id)) {
          // Newly added holding → expand so user can edit immediately
          next[id] = true
          changed = true
        } else {
          next[id] = false
          changed = true
        }
      }
      for (const id of Object.keys(prev)) {
        if (!(id in next)) changed = true
      }
      return changed ? next : prev
    })

    knownHoldingIdsRef.current = new Set(ids)
  }, [holdingIds, portfolio.id])

  const availableSymbols = [...new Set(scenarios.map((s) => s.symbol))].sort()
  const projectionOptions = [...scenarios].sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.name.localeCompare(b.name),
  )
  const allActions = getActions(portfolio)

  function holdingCurrentValue(h: PortfolioHolding): number | null {
    const linked =
      h.scenarioId != null
        ? (scenarios.find((s) => s.id === h.scenarioId) ?? null)
        : null
    const px = resolveCurrentPrice(h, linked)
    if (h.sharesHeld > 0 && px != null && px > 0) return h.sharesHeld * px
    return null
  }

  const sortedHoldings = useMemo(() => {
    const list = portfolio.holdings.slice()
    if (holdingSort === 'manual' || list.length < 2) return list

    if (holdingSort === 'symbol') {
      list.sort((a, b) =>
        (a.symbol || '—').localeCompare(b.symbol || '—', undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
      )
      return list
    }

    // value: high → low; missing price/value last, then by symbol
    list.sort((a, b) => {
      const va = holdingCurrentValue(a)
      const vb = holdingCurrentValue(b)
      if (va == null && vb == null) {
        return (a.symbol || '').localeCompare(b.symbol || '', undefined, {
          sensitivity: 'base',
        })
      }
      if (va == null) return 1
      if (vb == null) return -1
      if (vb !== va) return vb - va
      return (a.symbol || '').localeCompare(b.symbol || '', undefined, {
        sensitivity: 'base',
      })
    })
    return list
    // scenarios used via holdingCurrentValue for prices
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scenarios identity + holdings
  }, [portfolio.holdings, holdingSort, scenarios])

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function collapseAll() {
    const next: Record<string, boolean> = {}
    for (const h of portfolio.holdings) next[h.id] = false
    setExpanded(next)
  }

  function expandAll() {
    const next: Record<string, boolean> = {}
    for (const h of portfolio.holdings) next[h.id] = true
    setExpanded(next)
  }

  function updateHolding(id: string, patch: Partial<PortfolioHolding>) {
    onChange({
      holdings: portfolio.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    })
  }

  function removeHolding(id: string) {
    onChange({
      holdings: portfolio.holdings.filter((h) => h.id !== id),
      actions: allActions.filter((a) => a.holdingId !== id),
    })
  }

  function scenariosForSymbol(symbol: string) {
    const s = symbol.toUpperCase()
    return scenarios.filter((sc) => sc.symbol === s)
  }

  function addFromProjection(scenarioId: string) {
    if (!scenarioId) return
    const sc = scenarios.find((s) => s.id === scenarioId)
    if (!sc) return
    onChange({
      holdings: [
        ...portfolio.holdings,
        { ...newHolding(sc.symbol), scenarioId: sc.id },
      ],
    })
  }

  function addBlankHolding() {
    const symbol = availableSymbols[0] ?? ''
    const match = symbol ? scenarios.find((s) => s.symbol === symbol) : null
    onChange({
      holdings: [
        ...portfolio.holdings,
        { ...newHolding(symbol), scenarioId: match?.id ?? null },
      ],
    })
  }

  function fmt(usd: number | null | undefined) {
    if (usd == null || !Number.isFinite(usd)) return formatMoney(usd, displayCurrency)
    return formatMoney(toDisplay(usd, displayCurrency, usdToChf), displayCurrency)
  }

  function fmtPx(usd: number | null | undefined) {
    if (usd == null || !Number.isFinite(usd)) return formatPrice(usd, displayCurrency)
    return formatPrice(toDisplay(usd, displayCurrency, usdToChf), displayCurrency)
  }

  /** Parse user money typed in display currency → USD book amount. */
  function parseBook(raw: string): number | null {
    const v = parseMoney(raw)
    if (v == null || v < 0) return null
    return fromDisplay(v, displayCurrency, usdToChf)
  }

  function setOverride(holding: PortfolioHolding, year: number, raw: string) {
    const trimmed = raw.trim()
    const rest = holding.yearOverrides.filter((o) => o.year !== year)
    if (!trimmed) {
      updateHolding(holding.id, { yearOverrides: rest })
      return
    }
    const value = parseBook(trimmed)
    if (value == null) return
    updateHolding(holding.id, {
      yearOverrides: [...rest, { year, valueDollars: value }].sort((a, b) => a.year - b.year),
    })
  }

  function removeDeposit(id: string) {
    const target = deposits.find((d) => d.id === id)
    if (target?.isOpening) return
    onChange({ deposits: deposits.filter((d) => d.id !== id), currentCash: 0 })
  }

  function addDeposit() {
    const planned = deposits.filter((d) => !d.isOpening)
    const last = planned.length
      ? Math.max(...planned.map((d) => d.year), currentYear)
      : currentYear
    onChange({
      deposits: [
        ...deposits,
        newDeposit(last + (planned.some((d) => d.year === last) ? 1 : 0), 0),
      ],
      currentCash: 0,
    })
  }

  const bookPortfolio = {
    ...resolvedPortfolio,
    deposits: deposits.map((d) => {
      const resolved = resolvedById.get(d.id)
      return resolved ? { ...d, amount: resolved.amount } : d
    }),
    perpetualYearlyDeposit: resolvedPortfolio.perpetualYearlyDeposit,
    currentCash: 0,
  }
  const openingCash = getOpeningCash(bookPortfolio)
  const totalDeposited = bookPortfolio.deposits.reduce(
    (s, d) => s + (d.amount > 0 ? d.amount : 0),
    0,
  )
  const cashNow = cashForYear(bookPortfolio, currentYear)
  const depositThisYear = depositInYear(bookPortfolio, currentYear)
  const lastExplicitYear = lastExplicitDepositYear(
    { ...portfolio, deposits },
    currentYear,
  )
  const perpetual = portfolio.perpetualYearlyDeposit ?? null
  const perpetualResolvedUsd = resolvePerpetualYearlyAmount(
    perpetual,
    depositCtx,
  )
  const growthPercent = portfolio.perpetualGrowthPercent ?? 0

  function updatePerpetual(patch: Partial<PerpetualYearlyDeposit> | null) {
    if (patch === null) {
      onChange({ perpetualYearlyDeposit: null })
      return
    }
    const base: PerpetualYearlyDeposit = perpetual ?? {
      amount: 0,
      source: 'fixed',
    }
    onChange({
      perpetualYearlyDeposit: {
        ...base,
        ...patch,
      },
    })
  }

  function openPropagate(mode: 'cash' | 'holdings') {
    const init: Record<string, boolean> = {}
    for (const p of otherPortfolios) init[p.id] = true
    setPropagateIds(init)
    setPropagateIncludeActions(false)
    setPropagateMsg(null)
    setPropagateMode(mode)
  }

  function applyPropagate() {
    if (!onUpdateOtherPortfolio || !propagateMode) return
    const fields: PropagatePortfolioFields =
      propagateMode === 'cash'
        ? { cash: true }
        : { holdings: true, actions: propagateIncludeActions }
    const targets = otherPortfolios.filter((p) => propagateIds[p.id])
    if (targets.length === 0) {
      setPropagateMsg('Select at least one portfolio.')
      return
    }
    let n = 0
    for (const t of targets) {
      const next = applyPortfolioValuesToTarget(portfolio, t, fields)
      if (
        onUpdateOtherPortfolio(t.id, {
          deposits: next.deposits,
          perpetualYearlyDeposit: next.perpetualYearlyDeposit,
          holdings: next.holdings,
          actions: next.actions,
          currentCash: 0,
        })
      ) {
        n += 1
      }
    }
    const what =
      propagateMode === 'cash'
        ? 'cash'
        : propagateIncludeActions
          ? 'stocks & actions'
          : 'stocks'
    setPropagateMsg(`Copied ${what} to ${n} portfolio${n === 1 ? '' : 's'}.`)
    setPropagateMode(null)
  }

  function renderPropagateDialog() {
    if (!propagateMode || otherPortfolios.length === 0 || !onUpdateOtherPortfolio) return null
    const isCash = propagateMode === 'cash'
    return (
      <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white/90">
              {isCash ? 'Copy cash to other portfolios' : 'Copy stock positions'}
            </h4>
            <p className="text-[11px] text-white/45">
              {isCash
                ? 'Overwrite opening cash, planned deposits, and perpetual yearly deposit on the selected portfolios.'
                : 'Overwrite matching tickers (by symbol) with this portfolio’s shares, scenario link, basis, and overrides.'}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={() => setPropagateMode(null)}
          >
            Cancel
          </button>
        </div>
        {!isCash && (
          <label className="inline-flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={propagateIncludeActions}
              onChange={(e) => setPropagateIncludeActions(e.target.checked)}
            />
            Also copy buy/sell actions for those tickers
          </label>
        )}
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-white/10 bg-black/20 p-2">
          <div className="mb-1 flex gap-2">
            <button
              type="button"
              className="text-[11px] text-emerald-400/90 hover:underline"
              onClick={() => {
                const all: Record<string, boolean> = {}
                for (const p of otherPortfolios) all[p.id] = true
                setPropagateIds(all)
              }}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-[11px] text-white/45 hover:underline"
              onClick={() => setPropagateIds({})}
            >
              None
            </button>
          </div>
          {otherPortfolios.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-white/80 hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={!!propagateIds[p.id]}
                onChange={(e) =>
                  setPropagateIds((prev) => ({ ...prev, [p.id]: e.target.checked }))
                }
              />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
        <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={applyPropagate}>
          Apply to selected
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showConfig && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
            Configuration
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Portfolio name</label>
              <input
                ref={nameInputRef}
                className="input"
                value={portfolio.name}
                onChange={(e) => onChange({ name: e.target.value })}
                onBlur={() => setShowRenameHint(false)}
                aria-describedby={showRenameHint ? 'portfolio-rename-hint' : undefined}
              />
              {showRenameHint && (
                <p
                  id="portfolio-rename-hint"
                  className="mt-1 text-[11px] font-medium text-emerald-400/80"
                >
                  Rename this portfolio — type a new name, then press Tab
                </p>
              )}
            </div>
            <div>
              <label className="label">Display currency</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
                  {(['USD', 'CHF'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onDisplayCurrencyChange?.(c)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        displayCurrency === c
                          ? 'bg-white text-black shadow'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {c === 'USD' ? 'USD ($)' : 'CHF'}
                    </button>
                  ))}
                </div>
                {displayCurrency === 'CHF' && usdToChf == null && onRetryFx && (
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 !text-[11px]"
                    onClick={onRetryFx}
                    disabled={fxLoading}
                  >
                    Retry rate
                  </button>
                )}
              </div>
              {rateLabel && (
                <p className="mt-1 text-[11px] text-white/40">{rateLabel}</p>
              )}
              {showFxWarning && (
                <p className="mt-1 text-[11px] text-amber-300/90">
                  Showing USD until a live CHF rate is available.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showCash && (
      <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white/85">Cash & deposits</h3>
            <p className="text-[11px] text-white/40">
              First row is current cash (opening). Amounts are stored in the currency you enter
              (no FX drift if you stay in CHF). Deposits can be fixed or % of Income/Cost surplus.
              Optionally repeat a yearly amount after the last explicit deposit year.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {otherPortfolios.length > 0 && onUpdateOtherPortfolio && (
              <button
                type="button"
                className="btn-ghost !py-1 !text-xs"
                onClick={() => openPropagate('cash')}
                title="Copy opening cash, deposits, and perpetual yearly deposit to other portfolios"
              >
                Copy cash…
              </button>
            )}
            <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addDeposit}>
              + Deposit
            </button>
          </div>
        </div>

        {propagateMsg && propagateMode === null && (
          <p className="text-[11px] text-emerald-400/90">{propagateMsg}</p>
        )}
        {propagateMode === 'cash' && renderPropagateDialog()}

        <div className="hidden grid-cols-[5.5rem_6.5rem_minmax(0,1fr)_auto_auto] gap-2 px-0.5 text-[10px] uppercase tracking-wider text-white/40 sm:grid">
          <span>Year</span>
          <span>Source</span>
          <span>Amount / surplus</span>
          <span className="text-right">Cash after</span>
          <span />
        </div>

        {deposits.map((d) => (
          <DepositRow
            key={d.id}
            deposit={d}
            resolvedAmount={
              resolvedById.get(d.id)?.amount ?? resolveDepositAmount(d, depositCtx)
            }
            minYear={currentYear}
            cashAfter={cashForYear(bookPortfolio, d.year)}
            canRemove={!d.isOpening}
            isOpening={!!d.isOpening}
            displayCurrency={displayCurrency}
            usdToChf={usdToChf}
            incomeCostScenarios={incomeCostScenarios}
            incomeCostLines={incomeCostLines}
            onCommit={(patch) => {
              const next = deposits.map((x) =>
                x.id === d.id
                  ? {
                      ...x,
                      ...patch,
                      isOpening: d.isOpening,
                      year: d.isOpening ? currentYear : (patch.year ?? x.year),
                    }
                  : x,
              )
              onChange({ deposits: next, currentCash: 0 })
            }}
            onRemove={() => removeDeposit(d.id)}
          />
        ))}

        <PerpetualDepositRow
          perpetual={perpetual}
          lastExplicitYear={lastExplicitYear}
          resolvedUsd={perpetualResolvedUsd}
          displayCurrency={displayCurrency}
          usdToChf={usdToChf}
          incomeCostScenarios={incomeCostScenarios}
          incomeCostLines={incomeCostLines}
          onChange={updatePerpetual}
        />

        <div className="space-y-1 border-t border-white/5 pt-2 text-xs text-white/40">
          <p>
            Current cash:{' '}
            <span className="font-medium text-white/75">{fmt(openingCash)}</span>
            {depositThisYear > 0 && (
              <>
                {' '}
                · Extra deposit in {currentYear}:{' '}
                <span className="font-medium text-white/75">{fmt(depositThisYear)}</span>
              </>
            )}
          </p>
          <p>
            Cash after {currentYear}:{' '}
            <span className="font-medium text-emerald-400/90">{fmt(cashNow)}</span>
            {' · '}
            Explicit deposits total:{' '}
            <span className="font-medium text-white/70">{fmt(totalDeposited)}</span>
            {perpetualResolvedUsd > 0 && (
              <>
                {' · '}
                +{fmt(perpetualResolvedUsd)}/yr after {lastExplicitYear}
              </>
            )}
          </p>
          {(deposits.some((d) => d.source === 'surplus') ||
            perpetual?.source === 'surplus') &&
            usdToChf == null && (
            <p className="text-amber-300/90">
              Surplus deposits need a USD/CHF rate to convert Income/Cost (CHF) into portfolio cash.
            </p>
          )}
        </div>
      </div>
      )}

      {showGrowth && (
        <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
          <div>
            <h3 className="text-sm font-semibold text-white/85">
              Perpetual growth after last projection
            </h3>
            <p className="mt-1 text-[11px] text-white/40">
              Compounds the full portfolio after the last year with specific inputs (projections,
              deposits, actions). Leave empty or 0 to turn off. Use the Chart tab period{' '}
              <span className="text-white/55">To</span> year to see growth bars.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-28">
              <input
                className="input !py-2 !pr-7 !text-sm tabular-nums"
                type="text"
                inputMode="decimal"
                value={
                  growthPercent != null && growthPercent !== 0
                    ? String(growthPercent)
                    : ''
                }
                placeholder="0"
                onChange={(e) => {
                  const raw = e.target.value.trim().replace(/%/g, '')
                  if (raw === '' || raw === '-') {
                    onChange({ perpetualGrowthPercent: null })
                    return
                  }
                  const n = Number(raw)
                  onChange({
                    perpetualGrowthPercent: Number.isFinite(n) ? n : null,
                  })
                }}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/35">
                %
              </span>
            </div>
            <span className="text-xs text-white/45">per year on whole portfolio total</span>
          </div>
        </div>
      )}

      {showPositions && (
      <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">Holdings</h3>
          {portfolio.holdings.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <div
                className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5"
                role="group"
                aria-label="Sort holdings"
              >
                {(
                  [
                    { id: 'manual' as const, label: 'As added' },
                    { id: 'symbol' as const, label: 'A–Z' },
                    { id: 'value' as const, label: 'By value' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                      holdingSort === opt.id
                        ? 'bg-white text-black shadow'
                        : 'text-white/55 hover:text-white'
                    }`}
                    onClick={() => setHoldingSort(opt.id)}
                    aria-pressed={holdingSort === opt.id}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-ghost !px-2 !py-0.5 !text-[11px]"
                onClick={collapseAll}
              >
                Collapse all
              </button>
              <button
                type="button"
                className="btn-ghost !px-2 !py-0.5 !text-[11px]"
                onClick={expandAll}
              >
                Expand all
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {otherPortfolios.length > 0 && onUpdateOtherPortfolio && (
            <button
              type="button"
              className="btn-ghost !py-1.5 !text-xs"
              onClick={() => openPropagate('holdings')}
              title="Copy stock positions (and optionally buy/sell actions) to other portfolios"
            >
              Copy stocks…
            </button>
          )}
          {projectionOptions.length > 0 ? (
            <select
              className="select-compact"
              defaultValue=""
              key={`add-proj-${portfolio.holdings.length}`}
              aria-label="Add holding from saved projections"
              onChange={(e) => {
                addFromProjection(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="" disabled>
                + Add from projections…
              </option>
              {projectionOptions.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.symbol} · {sc.name}
                  {sc.companyName ? ` (${sc.companyName})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-white/40">Save projections first to pick tickers</span>
          )}
          <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={addBlankHolding}>
            + Empty holding
          </button>
        </div>
      </div>

      {propagateMsg && propagateMode === null && showPositions && !showCash && (
        <p className="text-[11px] text-emerald-400/90">{propagateMsg}</p>
      )}
      {propagateMode === 'holdings' && renderPropagateDialog()}

      {portfolio.holdings.length === 0 && (
        <p className="text-sm text-white/40">
          Pick a ticker from your saved projections above, then enter shares held. Value = shares ×
          price.
        </p>
      )}

      {scenarios.length === 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
          No saved projections yet. Save a scenario from the Analyzer (Saved projections tab) to
          choose tickers here.
        </p>
      )}

      <div className="space-y-3" key={`holdings-${holdingSort}`}>
        {sortedHoldings.map((h) => {
          const symbolScenarios = scenariosForSymbol(h.symbol)
          const linked =
            h.scenarioId != null
              ? (scenarios.find((s) => s.id === h.scenarioId) ?? null)
              : null
          const currentPrice = resolveCurrentPrice(h, linked)
          const currentValue = holdingCurrentValue(h)

          const symbolOptions = [...availableSymbols]
          if (h.symbol && !symbolOptions.includes(h.symbol)) {
            symbolOptions.push(h.symbol)
            symbolOptions.sort()
          }

          const isOpen = expanded[h.id] ?? false
          const scenarioName =
            linked?.name ?? (h.scenarioId ? 'Missing scenario' : 'Manual')
          const holdingActions = allActions.filter((a) => a.holdingId === h.id)
          const actionCount = holdingActions.length

          return (
            <div
              key={h.id}
              className="rounded-xl border border-white/10 bg-black/20 transition-colors"
            >
              <div className="flex items-start gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(h.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left transition hover:bg-white/[0.03] -m-1 p-1"
                  aria-expanded={isOpen}
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs text-white/70 transition-transform ${
                      isOpen ? 'rotate-90' : ''
                    }`}
                    aria-hidden
                  >
                    ▸
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-white/90">
                        {h.symbol || '—'}
                      </span>
                      <span className="text-xs text-white/40">{scenarioName}</span>
                      {h.sharesHeld > 0 && (
                        <span className="text-xs tabular-nums text-white/50">
                          {h.sharesHeld.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}{' '}
                          sh
                        </span>
                      )}
                      {currentValue != null && (
                        <span className="text-xs font-medium tabular-nums text-emerald-400/90">
                          {fmt(currentValue)}
                        </span>
                      )}
                      {actionCount > 0 && (
                        <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300/90">
                          {actionCount} action{actionCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    {!isOpen && (
                      <p className="mt-0.5 text-[11px] text-white/35">
                        {currentPrice != null
                          ? `@ ${fmtPx(currentPrice)} · ${h.basis.toUpperCase()}`
                          : 'Expand to edit'}
                        {actionCount > 0
                          ? ` · ${holdingActions
                              .map(
                                (a) =>
                                  `${a.type === 'buy' ? 'Buy' : 'Sell'} ${a.shares || '?'}@${a.year}`,
                              )
                              .join(', ')}`
                          : ''}
                      </p>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  className="btn-ghost shrink-0 !py-1 !text-xs text-red-300/80"
                  onClick={() => removeHolding(h.id)}
                >
                  Remove
                </button>
              </div>

              {isOpen && (
                <div className="space-y-3 border-t border-white/5 px-3 pb-3 pt-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="label">Ticker</label>
                        {symbolOptions.length > 0 ? (
                          <select
                            className="input"
                            value={h.symbol}
                            onChange={(e) => {
                              const symbol = e.target.value.toUpperCase()
                              const match = scenarios.find((s) => s.symbol === symbol)
                              updateHolding(h.id, {
                                symbol,
                                scenarioId:
                                  h.scenarioId &&
                                  scenarios.some(
                                    (s) => s.id === h.scenarioId && s.symbol === symbol,
                                  )
                                    ? h.scenarioId
                                    : (match?.id ?? null),
                              })
                            }}
                          >
                            <option value="" disabled>
                              Select ticker…
                            </option>
                            {symbolOptions.map((s) => {
                              const count = scenarios.filter((sc) => sc.symbol === s).length
                              return (
                                <option key={s} value={s}>
                                  {s}
                                  {count > 0
                                    ? ` (${count} projection${count === 1 ? '' : 's'})`
                                    : ''}
                                </option>
                              )
                            })}
                          </select>
                        ) : (
                          <input
                            className="input uppercase"
                            value={h.symbol}
                            onChange={(e) =>
                              updateHolding(h.id, { symbol: e.target.value.toUpperCase() })
                            }
                            placeholder="AAPL"
                          />
                        )}
                      </div>
                      <div>
                        <label className="label">Shares held</label>
                        <input
                          className="input"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          placeholder="e.g. 100"
                          value={h.sharesHeld || ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                              updateHolding(h.id, { sharesHeld: 0 })
                              return
                            }
                            const v = Number(raw)
                            updateHolding(h.id, {
                              sharesHeld: Number.isFinite(v) && v >= 0 ? v : 0,
                            })
                          }}
                        />
                        <p className="mt-1 text-[11px] text-white/35">
                          {currentPrice != null
                            ? `× ${fmtPx(currentPrice)} = ${fmt(currentValue)}`
                            : "Set current price to compute today's value"}
                        </p>
                      </div>
                      <div>
                        <label className="label">Saved projection</label>
                        <select
                          className="input"
                          value={h.scenarioId ?? ''}
                          onChange={(e) =>
                            updateHolding(h.id, {
                              scenarioId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">— Manual only —</option>
                          {(h.symbol ? symbolScenarios : scenarios).map((sc) => (
                            <option key={sc.id} value={sc.id}>
                              {sc.symbol} · {sc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Price basis</label>
                        <select
                          className="input"
                          value={h.basis}
                          onChange={(e) =>
                            updateHolding(h.id, {
                              basis: e.target.value as ValuationBasis | 'easy',
                            })
                          }
                        >
                          {BASIS_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">
                        Manual current price (optional, {displayCurrency})
                      </label>
                      <input
                        className="input"
                        type="text"
                        placeholder="If scenario has no price"
                        defaultValue={
                          h.manualCurrentPrice != null
                            ? String(
                                roundInput(
                                  toDisplay(h.manualCurrentPrice, displayCurrency, usdToChf),
                                ),
                              )
                            : ''
                        }
                        key={`px-${h.id}-${h.manualCurrentPrice}-${displayCurrency}-${usdToChf ?? 0}`}
                        onBlur={(e) => {
                          const raw = e.target.value.trim()
                          if (!raw) {
                            updateHolding(h.id, { manualCurrentPrice: null })
                            return
                          }
                          const book = parseBook(raw)
                          updateHolding(h.id, {
                            manualCurrentPrice: book != null && book > 0 ? book : null,
                          })
                        }}
                      />
                    </div>
                    <div>
                      <label className="label">Manual year override</label>
                      <div className="flex gap-2">
                        <input
                          className="input !w-24"
                          type="number"
                          min={currentYear}
                          placeholder="Year"
                          id={`oy-${h.id}`}
                        />
                        <input
                          className="input flex-1"
                          type="text"
                          placeholder="Position $ e.g. 50K"
                          id={`ov-${h.id}`}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            const yearEl = document.getElementById(
                              `oy-${h.id}`,
                            ) as HTMLInputElement
                            const valEl = document.getElementById(
                              `ov-${h.id}`,
                            ) as HTMLInputElement
                            const year = Number(yearEl?.value)
                            if (!year) return
                            setOverride(h, year, valEl?.value ?? '')
                            if (valEl) valEl.value = ''
                          }}
                        />
                        <button
                          type="button"
                          className="btn-ghost shrink-0"
                          onClick={() => {
                            const yearEl = document.getElementById(
                              `oy-${h.id}`,
                            ) as HTMLInputElement
                            const valEl = document.getElementById(
                              `ov-${h.id}`,
                            ) as HTMLInputElement
                            const year = Number(yearEl?.value)
                            if (!year) return
                            setOverride(h, year, valEl?.value ?? '')
                            if (valEl) valEl.value = ''
                          }}
                        >
                          Set
                        </button>
                      </div>
                      {h.yearOverrides.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {h.yearOverrides
                            .slice()
                            .sort((a, b) => a.year - b.year)
                            .map((o) => (
                              <li
                                key={o.year}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]"
                              >
                                <span className="text-white/50">{o.year}</span>
                                <span className="tabular-nums text-white/80">
                                  {fmt(o.valueDollars)}
                                </span>
                                <button
                                  type="button"
                                  className="text-white/35 hover:text-red-300"
                                  onClick={() =>
                                    updateHolding(h.id, {
                                      yearOverrides: h.yearOverrides.filter(
                                        (x) => x.year !== o.year,
                                      ),
                                    })
                                  }
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <HoldingActionsEditor
                    portfolio={portfolio}
                    holding={h}
                    scenarios={scenarios}
                    onChange={onChange}
                    displayCurrency={displayCurrency}
                    usdToChf={usdToChf}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}

/**
 * Local-state row so typing a year does not remount or fight parent re-renders.
 * Commits to portfolio state only on blur / Enter.
 */
function roundInput(n: number): number {
  if (!Number.isFinite(n)) return n
  // Keep enough precision for inputs after FX conversion
  return Math.round(n * 10000) / 10000
}

function PerpetualDepositRow({
  perpetual,
  lastExplicitYear,
  resolvedUsd,
  displayCurrency,
  usdToChf,
  incomeCostScenarios,
  onChange,
}: {
  perpetual: PerpetualYearlyDeposit | null
  lastExplicitYear: number
  resolvedUsd: number
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  incomeCostScenarios: CashflowScenario[]
  incomeCostLines: CashflowLine[]
  onChange: (patch: Partial<PerpetualYearlyDeposit> | null) => void
}) {
  const enabled = perpetual != null
  const source: PortfolioDepositSource = perpetual?.source === 'surplus' ? 'surplus' : 'fixed'
  const [amountText, setAmountText] = useState(
    perpetual && perpetual.amount > 0
      ? String(
          roundInput(
            amountToDisplay(
              perpetual.amount,
              perpetual.currency,
              displayCurrency,
              usdToChf,
            ),
          ),
        )
      : '',
  )
  const [percentText, setPercentText] = useState(
    perpetual?.surplusPercent != null && perpetual.surplusPercent !== 0
      ? String(perpetual.surplusPercent)
      : '',
  )

  useEffect(() => {
    setAmountText(
      perpetual && perpetual.amount > 0
        ? String(
            roundInput(
              amountToDisplay(
                perpetual.amount,
                perpetual.currency,
                displayCurrency,
                usdToChf,
              ),
            ),
          )
        : '',
    )
  }, [perpetual?.amount, perpetual?.currency, displayCurrency, usdToChf])

  useEffect(() => {
    setPercentText(
      perpetual?.surplusPercent != null && perpetual.surplusPercent !== 0
        ? String(perpetual.surplusPercent)
        : '',
    )
  }, [perpetual?.surplusPercent])

  const orderedScenarios = useMemo(
    () =>
      [...incomeCostScenarios].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [incomeCostScenarios],
  )

  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-2 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-sky-400"
            checked={enabled}
            onChange={(e) => {
              if (!e.target.checked) {
                onChange(null)
                return
              }
              onChange({
                amount: perpetual?.amount ?? 0,
                source: 'fixed',
                surplusScenarioId: null,
                surplusPercent: 0,
              })
            }}
          />
          <span className="font-medium">Yearly after last deposit</span>
        </label>
        <span className="text-[10px] text-white/40">
          Every year after {lastExplicitYear}
        </span>
      </div>
      {enabled ? (
        <div className="grid gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start">
          <select
            className="input !py-1.5 !text-xs"
            value={source}
            onChange={(e) => {
              const next = e.target.value as PortfolioDepositSource
              if (next === 'fixed') {
                onChange({
                  source: 'fixed',
                  surplusScenarioId: null,
                  surplusPercent: 0,
                })
              } else {
                onChange({
                  source: 'surplus',
                  surplusScenarioId:
                    perpetual?.surplusScenarioId ?? orderedScenarios[0]?.id ?? null,
                  surplusPercent: perpetual?.surplusPercent ?? 100,
                })
              }
            }}
          >
            <option value="fixed">Fixed</option>
            <option value="surplus">% surplus</option>
          </select>
          {source === 'fixed' ? (
            <input
              className="input !py-1.5 !text-xs tabular-nums"
              type="text"
              inputMode="decimal"
              placeholder={`Amount / year (${displayCurrency})`}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={() => {
                const raw = amountText.trim()
                if (!raw) {
                  onChange({ amount: 0, source: 'fixed', currency: displayCurrency })
                  return
                }
                const parsed = parseMoney(raw)
                if (parsed == null || parsed < 0) {
                  setAmountText(
                    perpetual && perpetual.amount > 0
                      ? String(
                          roundInput(
                            amountToDisplay(
                              perpetual.amount,
                              perpetual.currency,
                              displayCurrency,
                              usdToChf,
                            ),
                          ),
                        )
                      : '',
                  )
                  return
                }
                // Store nominal amount in display currency (no FX bake-in)
                onChange({
                  amount: parsed,
                  currency: displayCurrency,
                  source: 'fixed',
                })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1.5">
                <select
                  className="input min-w-[8rem] flex-1 !py-1.5 !text-xs"
                  value={perpetual?.surplusScenarioId ?? ''}
                  onChange={(e) =>
                    onChange({
                      source: 'surplus',
                      surplusScenarioId: e.target.value || null,
                    })
                  }
                >
                  <option value="" disabled>
                    {orderedScenarios.length ? 'Scenario…' : 'No Income/Cost scenarios'}
                  </option>
                  {orderedScenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="relative w-20 shrink-0">
                  <input
                    className="input !py-1.5 !pr-6 !text-xs tabular-nums"
                    type="text"
                    inputMode="decimal"
                    placeholder="%"
                    value={percentText}
                    onChange={(e) => setPercentText(e.target.value)}
                    onBlur={() => {
                      const n = Number(percentText.replace(/%/g, ''))
                      if (!Number.isFinite(n) || n < 0) {
                        setPercentText(
                          perpetual?.surplusPercent
                            ? String(perpetual.surplusPercent)
                            : '',
                        )
                        return
                      }
                      onChange({ source: 'surplus', surplusPercent: n })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-white/35">
                    %
                  </span>
                </div>
              </div>
              {resolvedUsd > 0 && (
                <p className="text-[10px] text-white/40">
                  ≈{' '}
                  {formatMoney(
                    toDisplay(resolvedUsd, displayCurrency, usdToChf),
                    displayCurrency,
                  )}
                  / year after {lastExplicitYear}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-white/35">
          Enable to add the same amount every year after your last explicit deposit year (
          {lastExplicitYear}).
        </p>
      )}
    </div>
  )
}

function DepositRow({
  deposit,
  resolvedAmount,
  minYear,
  cashAfter,
  canRemove,
  isOpening = false,
  displayCurrency,
  usdToChf,
  incomeCostScenarios,
  incomeCostLines,
  onCommit,
  onRemove,
}: {
  deposit: PortfolioDeposit
  /** Resolved USD book amount (surplus % applied) */
  resolvedAmount: number
  minYear: number
  cashAfter: number
  canRemove: boolean
  isOpening?: boolean
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  incomeCostScenarios: CashflowScenario[]
  incomeCostLines: CashflowLine[]
  onCommit: (patch: Partial<PortfolioDeposit>) => void
  onRemove: () => void
}) {
  const source: PortfolioDepositSource = deposit.source === 'surplus' ? 'surplus' : 'fixed'
  const [yearText, setYearText] = useState(String(deposit.year))
  const [amountText, setAmountText] = useState(
    deposit.amount > 0
      ? String(
          roundInput(
            amountToDisplay(deposit.amount, deposit.currency, displayCurrency, usdToChf),
          ),
        )
      : '',
  )
  const [percentText, setPercentText] = useState(
    deposit.surplusPercent != null && deposit.surplusPercent !== 0
      ? String(deposit.surplusPercent)
      : '',
  )

  // Sync from parent only when this deposit's committed values change (not while typing)
  useEffect(() => {
    setYearText(String(deposit.year))
  }, [deposit.id, deposit.year])

  useEffect(() => {
    setAmountText(
      deposit.amount > 0
        ? String(
            roundInput(
              amountToDisplay(deposit.amount, deposit.currency, displayCurrency, usdToChf),
            ),
          )
        : '',
    )
  }, [deposit.id, deposit.amount, deposit.currency, displayCurrency, usdToChf])

  useEffect(() => {
    setPercentText(
      deposit.surplusPercent != null && deposit.surplusPercent !== 0
        ? String(deposit.surplusPercent)
        : '',
    )
  }, [deposit.id, deposit.surplusPercent])

  const orderedScenarios = useMemo(
    () => [...incomeCostScenarios].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [incomeCostScenarios],
  )

  const surplusPreview = useMemo(() => {
    if (source !== 'surplus' || !deposit.surplusScenarioId) return null
    const totals = scenarioTotals(incomeCostLines, deposit.surplusScenarioId)
    const surplusChf = Math.max(0, totals.netYearly)
    const pct = Number.isFinite(deposit.surplusPercent) ? Math.max(0, deposit.surplusPercent!) : 0
    return {
      surplusChf,
      depositChf: surplusChf * (pct / 100),
      scenarioName:
        orderedScenarios.find((s) => s.id === deposit.surplusScenarioId)?.name ?? 'Scenario',
    }
  }, [
    source,
    deposit.surplusScenarioId,
    deposit.surplusPercent,
    incomeCostLines,
    orderedScenarios,
  ])

  function commitYear() {
    const y = Number(yearText)
    if (!Number.isFinite(y) || y < minYear) {
      setYearText(String(deposit.year))
      return
    }
    if (y !== deposit.year) onCommit({ year: Math.floor(y) })
  }

  function commitAmount() {
    const raw = amountText.trim()
    if (!raw) {
      if (deposit.amount !== 0) onCommit({ amount: 0, currency: displayCurrency })
      return
    }
    const parsed = parseMoney(raw)
    if (parsed == null || parsed < 0) {
      setAmountText(
        deposit.amount > 0
          ? String(
              roundInput(
                amountToDisplay(deposit.amount, deposit.currency, displayCurrency, usdToChf),
              ),
            )
          : '',
      )
      return
    }
    // Store nominal amount in the currency the user is viewing — no FX bake-in
    if (parsed !== deposit.amount || deposit.currency !== displayCurrency) {
      onCommit({ amount: parsed, currency: displayCurrency })
    }
  }

  function commitPercent() {
    const raw = percentText.trim()
    if (!raw) {
      if ((deposit.surplusPercent ?? 0) !== 0) onCommit({ surplusPercent: 0 })
      return
    }
    const n = Number(raw.replace(/%/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      setPercentText(
        deposit.surplusPercent != null && deposit.surplusPercent !== 0
          ? String(deposit.surplusPercent)
          : '',
      )
      return
    }
    if (n !== deposit.surplusPercent) onCommit({ surplusPercent: n })
  }

  function setSource(next: PortfolioDepositSource) {
    if (next === source) return
    if (next === 'fixed') {
      onCommit({
        source: 'fixed',
        surplusScenarioId: null,
        surplusPercent: undefined,
      })
    } else {
      const first = orderedScenarios[0]?.id ?? null
      onCommit({
        source: 'surplus',
        surplusScenarioId: deposit.surplusScenarioId ?? first,
        surplusPercent: deposit.surplusPercent ?? 100,
        amount: deposit.amount,
      })
    }
  }

  return (
    <div
      className={`grid grid-cols-1 items-start gap-2 sm:grid-cols-[5.5rem_6.5rem_minmax(0,1fr)_auto_auto] sm:items-center ${
        isOpening ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-0.5 py-1' : ''
      }`}
    >
      {isOpening ? (
        <div className="px-2 text-sm tabular-nums text-white/70" title="Opening cash year">
          {minYear}
          <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-400/80">
            Current
          </div>
        </div>
      ) : (
        <input
          className="input tabular-nums"
          type="number"
          min={minYear}
          step={1}
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          onBlur={commitYear}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )}

      <select
        className="input !py-1.5 !text-xs"
        value={source}
        onChange={(e) => setSource(e.target.value as PortfolioDepositSource)}
        aria-label="Deposit source"
      >
        <option value="fixed">Fixed</option>
        <option value="surplus">% surplus</option>
      </select>

      <div className="min-w-0 space-y-1">
        {isOpening && source === 'fixed' && (
          <div className="text-[10px] font-medium uppercase tracking-wide text-white/40">
            Current cash (opening)
          </div>
        )}
        {source === 'fixed' ? (
          <input
            className="input"
            type="text"
            inputMode="decimal"
            placeholder={`e.g. 10K ${displayCurrency}`}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onBlur={commitAmount}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <select
                className="input min-w-[8rem] flex-1 !py-1.5 !text-xs"
                value={deposit.surplusScenarioId ?? ''}
                onChange={(e) =>
                  onCommit({
                    source: 'surplus',
                    surplusScenarioId: e.target.value || null,
                  })
                }
                aria-label="Income/Cost scenario for surplus"
              >
                <option value="" disabled>
                  {orderedScenarios.length ? 'Scenario…' : 'No Income/Cost scenarios'}
                </option>
                {orderedScenarios.map((s) => {
                  const net = scenarioTotals(incomeCostLines, s.id).netYearly
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {net >= 0 ? ` · surplus CHF ${Math.round(net).toLocaleString()}` : ' · deficit'}
                    </option>
                  )
                })}
              </select>
              <div className="relative w-20 shrink-0">
                <input
                  className="input !py-1.5 !pr-6 !text-xs tabular-nums"
                  type="text"
                  inputMode="decimal"
                  placeholder="%"
                  value={percentText}
                  onChange={(e) => setPercentText(e.target.value)}
                  onBlur={commitPercent}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  aria-label="Percent of surplus"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-white/35">
                  %
                </span>
              </div>
            </div>
            {surplusPreview ? (
              <p className="text-[10px] leading-snug text-white/40">
                {surplusPreview.scenarioName}: surplus{' '}
                <span className="tabular-nums text-white/60">
                  {formatMoney(surplusPreview.surplusChf, 'CHF')}
                </span>
                /yr → deposit{' '}
                <span className="tabular-nums text-emerald-400/85">
                  {formatMoney(
                    toDisplay(resolvedAmount, displayCurrency, usdToChf),
                    displayCurrency,
                  )}
                </span>
                {usdToChf == null ? (
                  <span className="text-amber-300/80"> (needs FX rate)</span>
                ) : null}
              </p>
            ) : (
              <p className="text-[10px] text-white/35">
                Pick an Income/Cost scenario and % of yearly surplus (left over).
              </p>
            )}
          </div>
        )}
      </div>
      <div className="min-w-[5.5rem] text-right text-xs tabular-nums text-white/50">
        {formatMoney(toDisplay(cashAfter, displayCurrency, usdToChf), displayCurrency)}
      </div>
      <button
        type="button"
        className="btn-ghost !py-1.5 !text-xs text-red-300/80 disabled:opacity-30"
        disabled={!canRemove}
        onClick={onRemove}
        title={isOpening ? 'Opening cash cannot be removed' : 'Remove deposit'}
      >
        {isOpening ? '—' : 'Remove'}
      </button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type {
  DisplayCurrency,
  PortfolioDeposit,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
  ValuationBasis,
} from '../../types'
import {
  cashForYear,
  depositInYear,
  getActions,
  getDeposits,
  getOpeningCash,
  newDeposit,
  newHolding,
  newOpeningDeposit,
  resolveCurrentPrice,
} from '../../lib/portfolio'
import { formatMoney, formatPrice, parseMoney } from '../../lib/format'
import { fromDisplay, toDisplay } from '../../lib/fx'
import { HoldingActionsEditor } from './PortfolioActionsEditor'

type Props = {
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  onChange: (patch: Partial<SavedPortfolio>) => void
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
  onDisplayCurrencyChange?: (c: DisplayCurrency) => void
  rateLabel?: string
  fxLoading?: boolean
  onRetryFx?: () => void
  showFxWarning?: boolean
  /** Focus + select portfolio name (after New / Copy). */
  autoFocusName?: boolean
  onNameFocused?: () => void
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
  onDisplayCurrencyChange,
  rateLabel,
  fxLoading = false,
  onRetryFx,
  showFxWarning = false,
  autoFocusName = false,
  onNameFocused,
}: Props) {
  const currentYear = new Date().getFullYear()
  let deposits = getDeposits(portfolio)
  // Ensure opening row exists in UI state (persisted via normalize on update)
  if (!deposits.some((d) => d.isOpening)) {
    deposits = [newOpeningDeposit(getOpeningCash(portfolio), currentYear), ...deposits]
  }
  // Default collapsed so chart/totals stay in view; newly added holdings open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
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

  const openingCash = getOpeningCash({ ...portfolio, deposits })
  const totalDeposited = deposits.reduce((s, d) => s + (d.amount > 0 ? d.amount : 0), 0)
  const cashNow = cashForYear({ ...portfolio, deposits, currentCash: 0 }, currentYear)
  const depositThisYear = depositInYear({ ...portfolio, deposits }, currentYear)

  return (
    <div className="space-y-4">
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

      <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white/85">Cash & deposits</h3>
            <p className="text-[11px] text-white/40">
              First row is current cash (opening). Add more rows for capital you plan to put in
              later. Cash after = all deposits through that year.
            </p>
          </div>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addDeposit}>
            + Deposit
          </button>
        </div>

        <div className="grid grid-cols-[7rem_1fr_auto_auto] gap-2 px-0.5 text-[10px] uppercase tracking-wider text-white/40">
          <span>Year</span>
          <span>Amount ({displayCurrency})</span>
          <span className="text-right">Cash after</span>
          <span />
        </div>

        {deposits.map((d) => (
          <DepositRow
            key={d.id}
            deposit={d}
            minYear={currentYear}
            cashAfter={cashForYear({ ...portfolio, deposits, currentCash: 0 }, d.year)}
            canRemove={!d.isOpening}
            isOpening={!!d.isOpening}
            displayCurrency={displayCurrency}
            usdToChf={usdToChf}
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
            Total cash contributions:{' '}
            <span className="font-medium text-white/70">{fmt(totalDeposited)}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">Holdings</h3>
          {portfolio.holdings.length > 0 && (
            <div className="flex items-center gap-1">
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

      <div className="space-y-3">
        {portfolio.holdings.map((h) => {
          const symbolScenarios = scenariosForSymbol(h.symbol)
          const linked =
            h.scenarioId != null
              ? (scenarios.find((s) => s.id === h.scenarioId) ?? null)
              : null
          const currentPrice = resolveCurrentPrice(h, linked)
          const currentValue =
            h.sharesHeld > 0 && currentPrice != null && currentPrice > 0
              ? h.sharesHeld * currentPrice
              : null

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

function DepositRow({
  deposit,
  minYear,
  cashAfter,
  canRemove,
  isOpening = false,
  displayCurrency,
  usdToChf,
  onCommit,
  onRemove,
}: {
  deposit: PortfolioDeposit
  minYear: number
  cashAfter: number
  canRemove: boolean
  isOpening?: boolean
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  onCommit: (patch: Partial<PortfolioDeposit>) => void
  onRemove: () => void
}) {
  const [yearText, setYearText] = useState(String(deposit.year))
  const [amountText, setAmountText] = useState(
    deposit.amount > 0
      ? String(roundInput(toDisplay(deposit.amount, displayCurrency, usdToChf)))
      : '',
  )

  // Sync from parent only when this deposit's committed values change (not while typing)
  useEffect(() => {
    setYearText(String(deposit.year))
  }, [deposit.id, deposit.year])

  useEffect(() => {
    setAmountText(
      deposit.amount > 0
        ? String(roundInput(toDisplay(deposit.amount, displayCurrency, usdToChf)))
        : '',
    )
  }, [deposit.id, deposit.amount, displayCurrency, usdToChf])

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
      if (deposit.amount !== 0) onCommit({ amount: 0 })
      return
    }
    const parsed = parseMoney(raw)
    if (parsed == null || parsed < 0) {
      setAmountText(
        deposit.amount > 0
          ? String(roundInput(toDisplay(deposit.amount, displayCurrency, usdToChf)))
          : '',
      )
      return
    }
    const book = fromDisplay(parsed, displayCurrency, usdToChf)
    if (book !== deposit.amount) onCommit({ amount: book })
  }

  return (
    <div
      className={`grid grid-cols-[7rem_1fr_auto_auto] items-center gap-2 ${
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
      <div>
        {isOpening && (
          <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-white/40">
            Current cash (opening)
          </div>
        )}
        <input
          className="input"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 10K"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
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

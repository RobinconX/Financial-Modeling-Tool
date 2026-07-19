import { useEffect, useState } from 'react'
import type {
  PortfolioDeposit,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
  ValuationBasis,
} from '../types'
import {
  cashForYear,
  depositInYear,
  getCurrentCash,
  getDeposits,
  newDeposit,
  newHolding,
  resolveCurrentPrice,
} from '../lib/portfolio'
import { formatMoney, formatPrice, parseMoney } from '../lib/format'
import { PortfolioActionsEditor } from './PortfolioActionsEditor'

type Props = {
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  onChange: (patch: Partial<SavedPortfolio>) => void
}

const BASIS_OPTIONS: { id: ValuationBasis | 'easy'; label: string }[] = [
  { id: 'easy', label: 'Easy mcap' },
  { id: 'ps', label: 'P/S' },
  { id: 'pfcf', label: 'P/FCF' },
  { id: 'pe', label: 'P/E' },
]

export function PortfolioHoldingsEditor({ portfolio, scenarios, onChange }: Props) {
  const currentYear = new Date().getFullYear()
  const deposits = getDeposits(portfolio)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const last = portfolio.holdings[portfolio.holdings.length - 1]
    return last ? { [last.id]: true } : {}
  })

  const holdingIds = portfolio.holdings.map((h) => h.id).join('|')
  useEffect(() => {
    const ids = holdingIds ? holdingIds.split('|') : []
    setExpanded((prev) => {
      const next: Record<string, boolean> = {}
      let changed = false
      for (const id of ids) {
        if (id in prev) next[id] = prev[id]
        else {
          next[id] = true
          changed = true
        }
      }
      for (const id of Object.keys(prev)) {
        if (!(id in next)) changed = true
      }
      return changed ? next : prev
    })
  }, [holdingIds])

  const availableSymbols = [...new Set(scenarios.map((s) => s.symbol))].sort()
  const projectionOptions = [...scenarios].sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.name.localeCompare(b.name),
  )

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function updateHolding(id: string, patch: Partial<PortfolioHolding>) {
    onChange({
      holdings: portfolio.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    })
  }

  function removeHolding(id: string) {
    onChange({ holdings: portfolio.holdings.filter((h) => h.id !== id) })
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

  function setOverride(holding: PortfolioHolding, year: number, raw: string) {
    const trimmed = raw.trim()
    const rest = holding.yearOverrides.filter((o) => o.year !== year)
    if (!trimmed) {
      updateHolding(holding.id, { yearOverrides: rest })
      return
    }
    const value = parseMoney(trimmed)
    if (value == null || value < 0) return
    updateHolding(holding.id, {
      yearOverrides: [...rest, { year, valueDollars: value }].sort((a, b) => a.year - b.year),
    })
  }

  function updateDeposit(id: string, patch: Partial<PortfolioDeposit>) {
    onChange({
      deposits: deposits.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })
  }

  function removeDeposit(id: string) {
    onChange({ deposits: deposits.filter((d) => d.id !== id) })
  }

  function addDeposit() {
    const last = deposits.length
      ? Math.max(...deposits.map((d) => d.year), currentYear)
      : currentYear
    onChange({
      deposits: [...deposits, newDeposit(last + (deposits.some((d) => d.year === last) ? 1 : 0), 0)],
    })
  }

  const currentCash = getCurrentCash(portfolio)
  const totalDeposited = deposits.reduce((s, d) => s + (d.amount > 0 ? d.amount : 0), 0)
  const cashNow = cashForYear(portfolio, currentYear)
  const depositThisYear = depositInYear(portfolio, currentYear)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Portfolio name</label>
          <input
            className="input"
            value={portfolio.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Current cash position</label>
          <input
            className="input"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 25K"
            defaultValue={currentCash > 0 ? String(currentCash) : ''}
            key={`current-cash-${portfolio.id}-${currentCash}`}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              if (!raw) {
                onChange({ currentCash: 0 })
                return
              }
              const v = parseMoney(raw)
              if (v == null || v < 0) return
              onChange({ currentCash: v })
            }}
          />
          <p className="mt-1 text-[11px] text-white/35">
            Cash you already hold today ({formatMoney(currentCash)}) — separate from deposits
            below
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white/85">Deposits</h3>
            <p className="text-[11px] text-white/40">
              New capital added in a year (including this year if not already in current cash). Cash
              after = current cash + all deposits through that year.
            </p>
          </div>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addDeposit}>
            + Deposit
          </button>
        </div>

        <div className="grid grid-cols-[7rem_1fr_auto_auto] gap-2 px-0.5 text-[10px] uppercase tracking-wider text-white/40">
          <span>Year</span>
          <span>Deposit amount</span>
          <span className="text-right">Cash after</span>
          <span />
        </div>

        {/* Read-only baseline: current cash at start of timeline */}
        <div className="grid grid-cols-[7rem_1fr_auto_auto] items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-0 py-1.5">
          <div className="px-3 text-sm tabular-nums text-white/50">{currentYear}</div>
          <div className="text-xs text-white/45">
            Current cash (starting)
            {depositThisYear > 0 && (
              <span className="text-white/30"> · + deposit this year below</span>
            )}
          </div>
          <div className="min-w-[5.5rem] text-right text-xs tabular-nums text-white/60">
            {formatMoney(currentCash)}
          </div>
          <div className="w-[4.5rem]" />
        </div>

        {deposits.length === 0 && (
          <p className="text-xs text-white/35">
            No deposits yet. Add one for this year or future years if you plan to put in more
            capital.
          </p>
        )}

        {deposits.map((d) => (
          <DepositRow
            key={d.id}
            deposit={d}
            minYear={currentYear}
            cashAfter={cashForYear({ ...portfolio, deposits, currentCash }, d.year)}
            canRemove
            onCommit={(patch) => updateDeposit(d.id, patch)}
            onRemove={() => removeDeposit(d.id)}
          />
        ))}

        <div className="space-y-1 border-t border-white/5 pt-2 text-xs text-white/40">
          <p>
            Current cash:{' '}
            <span className="font-medium text-white/75">{formatMoney(currentCash)}</span>
            {depositThisYear > 0 && (
              <>
                {' '}
                · Deposit in {currentYear}:{' '}
                <span className="font-medium text-white/75">{formatMoney(depositThisYear)}</span>
              </>
            )}
          </p>
          <p>
            Cash now (after this year&apos;s deposits):{' '}
            <span className="font-medium text-emerald-400/90">{formatMoney(cashNow)}</span>
            {' · '}
            Total deposits (all years):{' '}
            <span className="font-medium text-white/70">{formatMoney(totalDeposited)}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">Holdings</h3>
        <div className="flex flex-wrap items-center gap-2">
          {projectionOptions.length > 0 ? (
            <select
              className="input !w-auto min-w-[12rem] !py-1.5 text-xs"
              defaultValue=""
              key={`add-proj-${portfolio.holdings.length}`}
              onChange={(e) => {
                addFromProjection(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="" disabled>
                + Add from saved projections…
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
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addBlankHolding}>
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
                          {formatMoney(currentValue)}
                        </span>
                      )}
                    </div>
                    {!isOpen && (
                      <p className="mt-0.5 text-[11px] text-white/35">
                        {currentPrice != null
                          ? `@ ${formatPrice(currentPrice)} · ${h.basis.toUpperCase()}`
                          : 'Expand to edit'}
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
                              scenarios.some((s) => s.id === h.scenarioId && s.symbol === symbol)
                                ? h.scenarioId
                                : match?.id ?? null,
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
                              {count > 0 ? ` (${count} projection${count === 1 ? '' : 's'})` : ''}
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
                        ? `× ${formatPrice(currentPrice)} = ${formatMoney(currentValue)}`
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
                  <label className="label">Manual current price (optional)</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="If scenario has no price"
                    defaultValue={
                      h.manualCurrentPrice != null ? String(h.manualCurrentPrice) : ''
                    }
                    key={`px-${h.id}-${h.manualCurrentPrice}`}
                    onBlur={(e) => {
                      const raw = e.target.value.trim()
                      if (!raw) {
                        updateHolding(h.id, { manualCurrentPrice: null })
                        return
                      }
                      const v = Number(raw.replace(/[$,\s]/g, ''))
                      updateHolding(h.id, {
                        manualCurrentPrice: Number.isFinite(v) && v > 0 ? v : null,
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
                        const yearEl = document.getElementById(`oy-${h.id}`) as HTMLInputElement
                        const valEl = document.getElementById(`ov-${h.id}`) as HTMLInputElement
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
                        const yearEl = document.getElementById(`oy-${h.id}`) as HTMLInputElement
                        const valEl = document.getElementById(`ov-${h.id}`) as HTMLInputElement
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
                              {formatMoney(o.valueDollars)}
                            </span>
                            <button
                              type="button"
                              className="text-white/35 hover:text-red-300"
                              onClick={() =>
                                updateHolding(h.id, {
                                  yearOverrides: h.yearOverrides.filter((x) => x.year !== o.year),
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
              </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <PortfolioActionsEditor
          portfolio={portfolio}
          scenarios={scenarios}
          onChange={onChange}
        />
      </div>
    </div>
  )
}

/**
 * Local-state row so typing a year does not remount or fight parent re-renders.
 * Commits to portfolio state only on blur / Enter.
 */
function DepositRow({
  deposit,
  minYear,
  cashAfter,
  canRemove,
  onCommit,
  onRemove,
}: {
  deposit: PortfolioDeposit
  minYear: number
  cashAfter: number
  canRemove: boolean
  onCommit: (patch: Partial<PortfolioDeposit>) => void
  onRemove: () => void
}) {
  const [yearText, setYearText] = useState(String(deposit.year))
  const [amountText, setAmountText] = useState(
    deposit.amount > 0 ? String(deposit.amount) : '',
  )

  // Sync from parent only when this deposit's committed values change (not while typing)
  useEffect(() => {
    setYearText(String(deposit.year))
  }, [deposit.id, deposit.year])

  useEffect(() => {
    setAmountText(deposit.amount > 0 ? String(deposit.amount) : '')
  }, [deposit.id, deposit.amount])

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
    const v = parseMoney(raw)
    if (v == null || v < 0) {
      setAmountText(deposit.amount > 0 ? String(deposit.amount) : '')
      return
    }
    if (v !== deposit.amount) onCommit({ amount: v })
  }

  return (
    <div className="grid grid-cols-[7rem_1fr_auto_auto] items-center gap-2">
      <input
        className="input tabular-nums"
        type="number"
        min={minYear}
        step={1}
        value={yearText}
        onChange={(e) => setYearText(e.target.value)}
        onBlur={commitYear}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      <input
        className="input"
        type="text"
        inputMode="decimal"
        placeholder="e.g. 10K"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        onBlur={commitAmount}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      <div className="min-w-[5.5rem] text-right text-xs tabular-nums text-white/50">
        {formatMoney(cashAfter)}
      </div>
      <button
        type="button"
        className="btn-ghost !py-1.5 !text-xs text-red-300/80 disabled:opacity-30"
        disabled={!canRemove}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  )
}

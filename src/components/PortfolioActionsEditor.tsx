import { useEffect, useState } from 'react'
import type {
  PortfolioAction,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
} from '../types'
import {
  getActions,
  newAction,
  resolveCurrentPrice,
  tradePriceForYear,
} from '../lib/portfolio'
import { formatMoney, formatPrice } from '../lib/format'

type Props = {
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  onChange: (patch: Partial<SavedPortfolio>) => void
}

export function PortfolioActionsEditor({ portfolio, scenarios, onChange }: Props) {
  const currentYear = new Date().getFullYear()
  const actions = getActions(portfolio)
  const holdingsById = new Map(portfolio.holdings.map((h) => [h.id, h]))
  const scenariosById = new Map(scenarios.map((s) => [s.id, s]))

  function updateAction(id: string, patch: Partial<PortfolioAction>) {
    onChange({
      actions: actions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })
  }

  function removeAction(id: string) {
    onChange({ actions: actions.filter((a) => a.id !== id) })
  }

  function addAction() {
    const firstHolding = portfolio.holdings[0]?.id ?? ''
    onChange({
      actions: [...actions, newAction('buy', firstHolding, currentYear + 1)],
    })
  }

  function preview(a: PortfolioAction): string {
    const h = holdingsById.get(a.holdingId)
    if (!h || !(a.shares > 0)) return '—'
    const scenario = h.scenarioId ? (scenariosById.get(h.scenarioId) ?? null) : null
    const px = tradePriceForYear(h, scenario, a.year, currentYear)
    if (px == null) return 'No price for year'
    const dollars = a.shares * px
    const sign = a.type === 'buy' ? '−' : '+'
    return `${sign}${formatMoney(dollars)} cash · ${formatPrice(px)}/sh`
  }

  if (portfolio.holdings.length === 0) {
    return (
      <p className="text-sm text-white/40">
        Add a holding first, then plan buy/sell actions against it.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Planned actions
          </h3>
          <p className="text-[11px] text-white/40">
            Buy reduces cash and increases shares from that year on. Sell does the opposite. Cash may
            go negative (warning shown).
          </p>
        </div>
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addAction}>
          + Action
        </button>
      </div>

      {actions.length === 0 && (
        <p className="text-xs text-white/35">No planned buys or sells yet.</p>
      )}

      <div className="space-y-2">
        {actions.map((a) => (
          <ActionRow
            key={a.id}
            action={a}
            holdings={portfolio.holdings}
            minYear={currentYear}
            preview={preview(a)}
            onCommit={(patch) => updateAction(a.id, patch)}
            onRemove={() => removeAction(a.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ActionRow({
  action,
  holdings,
  minYear,
  preview,
  onCommit,
  onRemove,
}: {
  action: PortfolioAction
  holdings: PortfolioHolding[]
  minYear: number
  preview: string
  onCommit: (patch: Partial<PortfolioAction>) => void
  onRemove: () => void
}) {
  const [yearText, setYearText] = useState(String(action.year))
  const [sharesText, setSharesText] = useState(action.shares > 0 ? String(action.shares) : '')

  useEffect(() => {
    setYearText(String(action.year))
  }, [action.id, action.year])

  useEffect(() => {
    setSharesText(action.shares > 0 ? String(action.shares) : '')
  }, [action.id, action.shares])

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={action.type}
            onChange={(e) =>
              onCommit({ type: e.target.value === 'sell' ? 'sell' : 'buy' })
            }
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div>
          <label className="label">Position</label>
          <select
            className="input"
            value={action.holdingId}
            onChange={(e) => onCommit({ holdingId: e.target.value })}
          >
            <option value="">Select…</option>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.symbol || '—'} · {h.sharesHeld} sh
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <input
            className="input tabular-nums"
            type="number"
            min={minYear}
            value={yearText}
            onChange={(e) => setYearText(e.target.value)}
            onBlur={() => {
              const y = Number(yearText)
              if (!Number.isFinite(y) || y < minYear) {
                setYearText(String(action.year))
                return
              }
              if (Math.floor(y) !== action.year) onCommit({ year: Math.floor(y) })
            }}
          />
        </div>
        <div>
          <label className="label">Shares</label>
          <input
            className="input tabular-nums"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 50"
            value={sharesText}
            onChange={(e) => setSharesText(e.target.value)}
            onBlur={() => {
              const raw = sharesText.trim()
              if (!raw) {
                if (action.shares !== 0) onCommit({ shares: 0 })
                return
              }
              const n = Number(raw)
              if (!Number.isFinite(n) || n < 0) {
                setSharesText(action.shares > 0 ? String(action.shares) : '')
                return
              }
              if (n !== action.shares) onCommit({ shares: n })
            }}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            className="btn-ghost w-full !text-xs text-red-300/80"
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      </div>
      <p className="text-[11px] text-white/45">{preview}</p>
    </div>
  )
}

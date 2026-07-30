import { useEffect, useState } from 'react'
import type {
  DisplayCurrency,
  PortfolioAction,
  PortfolioHolding,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import { actionTradePrice, getActions, newAction } from '../../lib/portfolio'
import { formatMoney, formatPrice, parseMoney } from '../../lib/format'
import { fromDisplay, toDisplay } from '../../lib/fx'

type Props = {
  portfolio: SavedPortfolio
  holding: PortfolioHolding
  scenarios: SavedScenario[]
  onChange: (patch: Partial<SavedPortfolio>) => void
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
}

export function HoldingActionsEditor({
  portfolio,
  holding,
  scenarios,
  onChange,
  displayCurrency = 'USD',
  usdToChf = null,
}: Props) {
  const currentYear = new Date().getFullYear()
  const allActions = getActions(portfolio)
  const actions = allActions.filter((a) => a.holdingId === holding.id)
  const scenariosById = new Map(scenarios.map((s) => [s.id, s]))

  function updateAction(id: string, patch: Partial<PortfolioAction>) {
    onChange({
      actions: allActions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })
  }

  function removeAction(id: string) {
    onChange({ actions: allActions.filter((a) => a.id !== id) })
  }

  function addAction(type: PortfolioAction['type'] = 'buy') {
    onChange({
      actions: [...allActions, newAction(type, holding.id, currentYear + 1)],
    })
  }

  function preview(a: PortfolioAction): string {
    if (!(a.shares > 0)) return '—'
    const scenario = holding.scenarioId
      ? (scenariosById.get(holding.scenarioId) ?? null)
      : null
    const px = actionTradePrice(a, holding, scenario, currentYear)
    if (px == null) return 'No price for year'
    const dollars = a.shares * px
    const sign = a.type === 'buy' ? '−' : '+'
    const cashDisp = toDisplay(dollars, displayCurrency, usdToChf)
    const pxDisp = toDisplay(px, displayCurrency, usdToChf)
    const auto = a.price == null || !(a.price > 0)
    return `${sign}${formatMoney(cashDisp, displayCurrency)} cash · ${formatPrice(pxDisp, displayCurrency)}/sh${auto ? ' (auto)' : ''}`
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
            Intended actions
          </h4>
          <p className="text-[10px] text-white/35">
            Buy / sell from a year on — set an optional trade price, or leave blank to use the
            scenario/live price. Adjusts shares and cash in the totals chart.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={() => addAction('buy')}
          >
            + Buy
          </button>
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={() => addAction('sell')}
          >
            + Sell
          </button>
        </div>
      </div>

      {actions.length === 0 && (
        <p className="text-[11px] text-white/35">No planned buys or sells for this position.</p>
      )}

      <div className="space-y-1.5">
        {actions.map((a) => (
          <ActionRow
            key={a.id}
            action={a}
            minYear={currentYear}
            preview={preview(a)}
            displayCurrency={displayCurrency}
            usdToChf={usdToChf}
            onCommit={(patch) => updateAction(a.id, patch)}
            onRemove={() => removeAction(a.id)}
          />
        ))}
      </div>
    </div>
  )
}

/** @deprecated Use HoldingActionsEditor — kept name export for any old imports */
export const PortfolioActionsEditor = HoldingActionsEditor

function roundPriceInput(n: number): number {
  if (!Number.isFinite(n)) return n
  return Math.round(n * 1e6) / 1e6
}

function ActionRow({
  action,
  minYear,
  preview,
  displayCurrency,
  usdToChf,
  onCommit,
  onRemove,
}: {
  action: PortfolioAction
  minYear: number
  preview: string
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  onCommit: (patch: Partial<PortfolioAction>) => void
  onRemove: () => void
}) {
  const [yearText, setYearText] = useState(String(action.year))
  const [sharesText, setSharesText] = useState(action.shares > 0 ? String(action.shares) : '')
  const [priceText, setPriceText] = useState(
    action.price != null && action.price > 0
      ? String(roundPriceInput(toDisplay(action.price, displayCurrency, usdToChf)))
      : '',
  )

  useEffect(() => {
    setYearText(String(action.year))
  }, [action.id, action.year])

  useEffect(() => {
    setSharesText(action.shares > 0 ? String(action.shares) : '')
  }, [action.id, action.shares])

  useEffect(() => {
    setPriceText(
      action.price != null && action.price > 0
        ? String(roundPriceInput(toDisplay(action.price, displayCurrency, usdToChf)))
        : '',
    )
  }, [action.id, action.price, displayCurrency, usdToChf])

  function commitPrice() {
    const raw = priceText.trim()
    if (!raw) {
      if (action.price != null) onCommit({ price: null })
      return
    }
    const parsed = parseMoney(raw)
    if (parsed == null || parsed <= 0) {
      setPriceText(
        action.price != null && action.price > 0
          ? String(roundPriceInput(toDisplay(action.price, displayCurrency, usdToChf)))
          : '',
      )
      return
    }
    const book = fromDisplay(parsed, displayCurrency, usdToChf)
    if (book !== action.price) onCommit({ price: book })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5">
      <div className="w-[5.5rem]">
        <label className="label !mb-0.5 !text-[9px]">Type</label>
        <select
          className="input !py-1 !text-xs"
          value={action.type}
          onChange={(e) => onCommit({ type: e.target.value === 'sell' ? 'sell' : 'buy' })}
        >
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
      </div>
      <div className="w-[4.5rem]">
        <label className="label !mb-0.5 !text-[9px]">Year</label>
        <input
          className="input !py-1 !text-xs tabular-nums"
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
      <div className="w-[5.5rem]">
        <label className="label !mb-0.5 !text-[9px]">Shares</label>
        <input
          className="input !py-1 !text-xs tabular-nums"
          type="text"
          inputMode="decimal"
          placeholder="50"
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
      <div className="w-[6.5rem]">
        <label className="label !mb-0.5 !text-[9px]">Price / sh</label>
        <input
          className="input !py-1 !text-xs tabular-nums"
          type="text"
          inputMode="decimal"
          placeholder="Auto"
          title={`Trade price in ${displayCurrency}. Leave empty to use scenario or live price.`}
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          onBlur={commitPrice}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </div>
      <p className="min-w-0 flex-1 pb-1.5 text-[10px] text-white/45">{preview}</p>
      <button
        type="button"
        className="btn-ghost shrink-0 !px-2 !py-1 !text-xs text-red-300/80"
        onClick={onRemove}
        title="Remove action"
      >
        ×
      </button>
    </div>
  )
}

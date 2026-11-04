import type {
  DisplayCurrency,
  PortfolioAction,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import {
  actionTradePrice,
  getActions,
  holdingDisplayName,
  newAction,
} from '../../lib/portfolio'
import { formatMoney, formatPrice } from '../../lib/format'
import { toDisplay } from '../../lib/fx'
import { PortfolioActionRow } from './PortfolioActionsEditor'

type Props = {
  portfolio: SavedPortfolio
  holdingId: string
  columnYear: number
  scenarios: SavedScenario[]
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  onChange: (patch: Partial<SavedPortfolio>) => void
}

export function PortfolioYearActionsEditor({
  portfolio,
  holdingId,
  columnYear,
  scenarios,
  displayCurrency,
  usdToChf,
  onChange,
}: Props) {
  const currentYear = new Date().getFullYear()
  const holding = portfolio.holdings.find((h) => h.id === holdingId)
  const allActions = getActions(portfolio)
  const cellActions = allActions.filter(
    (a) => a.holdingId === holdingId && a.year === columnYear,
  )
  const scenariosById = new Map(scenarios.map((s) => [s.id, s]))

  if (!holding) {
    return <p className="text-[11px] text-white/40">Position not found.</p>
  }

  const h = holding
  const title = holdingDisplayName(h)

  function updateAction(id: string, patch: Partial<PortfolioAction>) {
    onChange({
      actions: allActions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })
  }

  function removeAction(id: string) {
    onChange({ actions: allActions.filter((a) => a.id !== id) })
  }

  function addAction(type: PortfolioAction['type']) {
    onChange({
      actions: [...allActions, newAction(type, holdingId, columnYear)],
    })
  }

  function preview(a: PortfolioAction): string {
    if (!(a.shares > 0)) return '—'
    const scenario = h.scenarioId ? (scenariosById.get(h.scenarioId) ?? null) : null
    const px = actionTradePrice(a, h, scenario, currentYear)
    if (px == null) return 'No price for year'
    const dollars = a.shares * px
    const sign = a.type === 'buy' ? '−' : '+'
    const cashDisp = toDisplay(dollars, displayCurrency, usdToChf)
    const pxDisp = toDisplay(px, displayCurrency, usdToChf)
    const auto = a.price == null || !(a.price > 0)
    return `${sign}${formatMoney(cashDisp, displayCurrency)} cash · ${formatPrice(pxDisp, displayCurrency)}/sh${auto ? ' (auto)' : ''}`
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">
            Planned {columnYear}
          </p>
          <p className="text-xs font-medium text-white/85">{title}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="btn-ghost !py-0.5 !text-[10px]"
            onClick={() => addAction('buy')}
          >
            + Buy
          </button>
          <button
            type="button"
            className="btn-ghost !py-0.5 !text-[10px]"
            onClick={() => addAction('sell')}
          >
            + Sell
          </button>
        </div>
      </div>

      {cellActions.length === 0 ? (
        <p className="text-[11px] text-white/35">No buys or sells this year.</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
          {cellActions.map((a) => (
            <PortfolioActionRow
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
      )}
    </div>
  )
}

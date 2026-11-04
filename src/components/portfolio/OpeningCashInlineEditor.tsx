import { useEffect, useState } from 'react'
import type { DisplayCurrency, SavedPortfolio } from '../../types'
import {
  getDeposits,
  getOpeningCash,
  newOpeningDeposit,
  normalizePortfolioCashModel,
} from '../../lib/portfolio'
import { formatMoney, parseMoney } from '../../lib/format'
import { toDisplay } from '../../lib/fx'
import { AnchorPopover } from '../common/AnchorPopover'

type Props = {
  portfolio: SavedPortfolio
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  valueUsdBook: number | null
  onChange: (patch: Partial<SavedPortfolio>) => void
  fmt: (v: number) => string
}

export function OpeningCashInlineEditor({
  portfolio,
  displayCurrency,
  usdToChf,
  valueUsdBook,
  onChange,
  fmt,
}: Props) {
  const currentYear = new Date().getFullYear()
  const [open, setOpen] = useState(false)
  const openingUsd = valueUsdBook ?? getOpeningCash(portfolio)
  const openingDisplay = toDisplay(openingUsd, displayCurrency, usdToChf)
  const [draft, setDraft] = useState(String(Math.round(openingDisplay * 100) / 100))

  useEffect(() => {
    if (!open) {
      setDraft(String(Math.round(openingDisplay * 100) / 100))
    }
  }, [open, openingDisplay])

  function commit() {
    const parsed = parseMoney(draft.trim())
    if (parsed == null || parsed < 0) {
      setDraft(String(Math.round(openingDisplay * 100) / 100))
      setOpen(false)
      return
    }
    let deposits = [...getDeposits(portfolio)]
    let opening = deposits.find((d) => d.isOpening)
    if (!opening) {
      opening = newOpeningDeposit(parsed, currentYear)
      deposits = [opening, ...deposits]
    } else {
      deposits = deposits.map((d) =>
        d.isOpening
          ? {
              ...d,
              amount: parsed,
              currency: displayCurrency,
              source: 'fixed',
              year: currentYear,
              surplusScenarioId: null,
              surplusPercent: undefined,
            }
          : d,
      )
    }
    onChange(
      normalizePortfolioCashModel({
        ...portfolio,
        deposits,
        currentCash: 0,
      }),
    )
    setOpen(false)
  }

  return (
    <span className="group/cash inline-flex items-center gap-1">
      {valueUsdBook == null ? (
        <span className="text-white/20">—</span>
      ) : (
        <span className="tabular-nums">{fmt(valueUsdBook)}</span>
      )}
      {valueUsdBook != null ? (
        <AnchorPopover
          label="Edit current cash"
          open={open}
          onOpenChange={setOpen}
          side="bottom"
          align="end"
          panelClassName="!w-56"
          trigger={
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-white/25 opacity-0 transition hover:text-white/60 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 group-hover/cash:opacity-100"
              aria-label="Edit current cash"
            >
              ✎
            </button>
          }
        >
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">
              Current cash (opening)
            </p>
            <input
              className="input !py-1.5 !text-sm tabular-nums"
              type="text"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
              }}
            />
            <p className="text-[10px] text-white/40">
              Stored in {displayCurrency}. Same as the first row on the Cash tab.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-ghost !py-1 !text-xs"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary !py-1 !text-xs" onClick={commit}>
                Save
              </button>
            </div>
            <p className="text-[10px] text-white/35">
              Preview: {formatMoney(parseMoney(draft.trim()) ?? openingDisplay, displayCurrency)}
            </p>
          </div>
        </AnchorPopover>
      ) : null}
    </span>
  )
}

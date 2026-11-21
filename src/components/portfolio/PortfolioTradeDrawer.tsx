import { useEffect, useState, type ReactNode } from 'react'
import type { PortfolioTrade, PortfolioTradeSide } from '../../types'
import { formatInputNumber } from '../common/MoneyInput'
import { normalizePortfolioTrade, todayIsoDate } from '../../lib/portfolioTrades'

type Props = {
  open: boolean
  draft: PortfolioTrade | null
  onClose: () => void
  onSave: (trade: PortfolioTrade) => boolean
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/45">
      {children}
    </label>
  )
}

export function PortfolioTradeDrawer({ open, draft, onClose, onSave }: Props) {
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<PortfolioTradeSide>('buy')
  const [tradeDate, setTradeDate] = useState(todayIsoDate())
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !draft) return
    setSymbol(draft.symbol)
    setSide(draft.side)
    setTradeDate(draft.tradeDate)
    setShares(draft.shares > 0 ? formatInputNumber(draft.shares, 6) : '')
    setPrice(draft.price > 0 ? formatInputNumber(draft.price, 4) : '')
    setFees(
      draft.fees != null && draft.fees > 0 ? formatInputNumber(draft.fees, 2) : '',
    )
    setNote(draft.note ?? '')
    setError(null)
  }, [open, draft])

  if (!open || !draft) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const sharesN = Number(shares)
    const priceN = Number(price)
    const feesN = fees.trim() === '' ? 0 : Number(fees)
    const candidate: PortfolioTrade = {
      ...draft,
      symbol: symbol.trim().toUpperCase(),
      side,
      tradeDate,
      shares: sharesN,
      price: priceN,
      fees: feesN,
      note: note.trim() || undefined,
    }
    const normalized = normalizePortfolioTrade(candidate)
    if (!normalized) {
      setError(
        'Check symbol (equity ticker), date (YYYY-MM-DD), shares, and price.',
      )
      return
    }
    const ok = onSave(normalized)
    if (ok) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex justify-end bg-black/60"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#121820] shadow-2xl"
        role="dialog"
        aria-label={draft.shares ? 'Edit trade' : 'Log trade'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">
            {draft.id && draft.price > 0 ? 'Edit trade' : 'Log trade'}
          </h3>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-white/50 hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4" onSubmit={handleSubmit}>
          <div>
            <FieldLabel>Symbol</FieldLabel>
            <input
              className="input"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              autoComplete="off"
              required
            />
          </div>

          <div>
            <FieldLabel>Side</FieldLabel>
            <div className="inline-flex gap-1" role="group" aria-label="Buy or sell">
              {(['buy', 'sell'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                    side === s
                      ? s === 'buy'
                        ? 'bg-emerald-500/25 text-emerald-200'
                        : 'bg-red-500/20 text-red-200'
                      : 'bg-white/5 text-white/55 hover:text-white'
                  }`}
                  onClick={() => setSide(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <div className="flex gap-2">
              <input
                type="date"
                className="input flex-1"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn-ghost shrink-0 !text-xs"
                onClick={() => setTradeDate(todayIsoDate())}
              >
                Today
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Shares</FieldLabel>
              <input
                className="input tabular-nums"
                inputMode="decimal"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel>Price (USD)</FieldLabel>
              <input
                className="input tabular-nums"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <FieldLabel>Fees (optional)</FieldLabel>
            <input
              className="input tabular-nums"
              inputMode="decimal"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <FieldLabel>Note (optional)</FieldLabel>
            <textarea
              className="input min-h-[4rem] resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mt-auto flex gap-2 border-t border-white/10 pt-4">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save trade
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
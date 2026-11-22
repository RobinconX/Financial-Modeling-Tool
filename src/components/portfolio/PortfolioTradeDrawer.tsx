import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  DisplayCurrency,
  PortfolioTrade,
  PortfolioTradeEvent,
  PortfolioTradeInstrument,
  PortfolioTradeSide,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import { optionLabel, parseOccSymbol } from '../../lib/optionContract'
import { parseIbOptionDescription } from '../../lib/portfolioOptionTradeParse'
import { formatInputNumber } from '../common/MoneyInput'
import type { PriceHistoryPoint } from '../../lib/priceHistory'
import {
  defaultTradeCurrencyForSymbol,
  equityHoldingForTradePrefill,
  holdingEquityTradeSymbol,
  normalizePortfolioTrade,
  positionPrefillFromHolding,
  resolveSymbolMark,
  todayIsoDate,
} from '../../lib/portfolioTrades'

type Props = {
  open: boolean
  draft: PortfolioTrade | null
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  historyBySymbol?: Record<string, PriceHistoryPoint[]>
  quoteCurrencyBySymbol?: Record<string, DisplayCurrency>
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

export function PortfolioTradeDrawer({
  open,
  draft,
  portfolio,
  scenarios,
  historyBySymbol = {},
  quoteCurrencyBySymbol = {},
  onClose,
  onSave,
}: Props) {
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<PortfolioTradeSide>('buy')
  const [tradeDate, setTradeDate] = useState(todayIsoDate())
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')
  const [currency, setCurrency] = useState<DisplayCurrency>('USD')
  const [feesCurrency, setFeesCurrency] = useState<DisplayCurrency>('USD')
  const [instrument, setInstrument] = useState<PortfolioTradeInstrument>('equity')
  const [event, setEvent] = useState<PortfolioTradeEvent>('trade')
  const [note, setNote] = useState('')
  const [holdingId, setHoldingId] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !draft) return
    const byId = draft.holdingId
      ? equityHoldingForTradePrefill(portfolio, scenarios, {
          holdingId: draft.holdingId,
        })
      : null
    const resolvedSymbol =
      draft.symbol.trim().toUpperCase() ||
      (byId ? holdingEquityTradeSymbol(byId, scenarios) ?? '' : '')
    setSymbol(resolvedSymbol)
    setSide(draft.side)
    setTradeDate(draft.tradeDate)
    setShares(draft.shares > 0 ? formatInputNumber(draft.shares, 6) : '')
    setPrice(draft.price > 0 ? formatInputNumber(draft.price, 4) : '')
    setFees(
      draft.fees != null && draft.fees > 0 ? formatInputNumber(draft.fees, 2) : '',
    )
    setCurrency(draft.currency ?? defaultTradeCurrencyForSymbol(resolvedSymbol, quoteCurrencyBySymbol))
    setFeesCurrency(draft.feesCurrency ?? draft.currency ?? 'USD')
    setInstrument(draft.instrument === 'option' ? 'option' : 'equity')
    setEvent(draft.event ?? 'trade')
    setNote(draft.note ?? '')
    setHoldingId(draft.holdingId ?? byId?.id)
    setError(null)
  }, [open, draft, portfolio, scenarios, quoteCurrencyBySymbol])

  const matchedHolding = useMemo(
    () =>
      equityHoldingForTradePrefill(portfolio, scenarios, {
        symbol,
        holdingId,
      }),
    [portfolio, scenarios, symbol, holdingId],
  )

  const matchedTicker = matchedHolding
    ? holdingEquityTradeSymbol(matchedHolding, scenarios)
    : null

  useEffect(() => {
    if (!open || !symbol.trim()) return
    if (draft && draft.symbol === symbol.trim().toUpperCase() && draft.price > 0) return
    setCurrency(defaultTradeCurrencyForSymbol(symbol, quoteCurrencyBySymbol))
  }, [symbol, quoteCurrencyBySymbol, open, draft])

  const applyPosition = useCallback(() => {
    if (!matchedHolding) return
    const ticker =
      holdingEquityTradeSymbol(matchedHolding, scenarios) ?? symbol.trim()
    const hist = historyBySymbol[ticker.toUpperCase()] ?? []
    const histCur = quoteCurrencyBySymbol[ticker.toUpperCase()]
    const mark = resolveSymbolMark(
      ticker,
      portfolio,
      scenarios,
      hist,
      tradeDate,
      histCur,
    )
    const prefill = positionPrefillFromHolding(matchedHolding, mark)
    setShares(prefill.shares > 0 ? formatInputNumber(prefill.shares, 6) : '')
    setHoldingId(prefill.holdingId)
    if (prefill.price != null) {
      setPrice(formatInputNumber(prefill.price, 4))
      if (mark?.currency) setCurrency(mark.currency)
    }
    if (!symbol.trim() && ticker) {
      setSymbol(ticker.toUpperCase())
    }
    setError(null)
  }, [
    matchedHolding,
    historyBySymbol,
    portfolio,
    scenarios,
    tradeDate,
    symbol,
    quoteCurrencyBySymbol,
  ])

  if (!open || !draft) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const sharesN = Number(shares)
    const priceN = Number(price)
    const feesN = fees.trim() === '' ? 0 : Number(fees)
    const linkId = matchedHolding?.id
    const symInput = symbol.trim()
    const ib = instrument === 'option' ? parseIbOptionDescription(symInput) : null
    const candidate: PortfolioTrade = {
      ...draft,
      symbol: ib?.occSymbol ?? symInput.toUpperCase(),
      side,
      tradeDate,
      shares: sharesN,
      price: priceN,
      currency,
      fees: feesN,
      feesCurrency,
      instrument,
      event,
      note: note.trim() || undefined,
      holdingId: instrument === 'equity' ? linkId : undefined,
      underlying: ib?.underlying,
      right: ib?.right,
      strike: ib?.strike,
      expiry: ib?.expiration,
      multiplier: ib?.multiplier,
    }
    const normalized = normalizePortfolioTrade(candidate)
    if (!normalized) {
      setError(
        instrument === 'option'
          ? 'Check option symbol/description, date, contracts, and price.'
          : 'Check symbol (equity ticker), date (YYYY-MM-DD), shares, and price.',
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
            <FieldLabel>Instrument</FieldLabel>
            <div className="inline-flex gap-1" role="group" aria-label="Equity or option">
              {(['equity', 'option'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                    instrument === k
                      ? 'bg-emerald-500/25 text-emerald-200'
                      : 'bg-white/5 text-white/55 hover:text-white'
                  }`}
                  onClick={() => setInstrument(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          {instrument === 'option' ? (
            <div>
              <FieldLabel>Event</FieldLabel>
              <select
                className="input !py-1.5 !text-xs"
                value={event}
                onChange={(e) => setEvent(e.target.value as PortfolioTradeEvent)}
              >
                <option value="trade">Trade</option>
                <option value="expire">Expire</option>
                <option value="assign">Assign</option>
                <option value="exercise">Exercise</option>
              </select>
            </div>
          ) : null}
          <div>
            <FieldLabel>{instrument === 'option' ? 'OCC or IB description' : 'Symbol'}</FieldLabel>
            <input
              className="input"
              value={symbol}
              onChange={(e) => {
                const next = e.target.value.toUpperCase()
                setSymbol(next)
                const match = equityHoldingForTradePrefill(portfolio, scenarios, {
                  symbol: next,
                })
                setHoldingId(match?.id)
              }}
              placeholder={
                instrument === 'option' ? 'e.g. HIMS 16OCT26 25 P' : 'e.g. AAPL'
              }
              autoComplete="off"
              required
            />
            {matchedHolding && matchedTicker ? (
              <button
                type="button"
                data-testid="use-position-chip"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-400/45 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-100 shadow-sm hover:bg-sky-500/25"
                onClick={applyPosition}
              >
                Use position
                <span className="font-normal text-sky-200/90">
                  {matchedTicker} · {matchedHolding.sharesHeld.toLocaleString()} sh
                </span>
              </button>
            ) : null}
            {instrument === 'option' && symbol.trim() ? (
              <p className="mt-1 text-[11px] text-white/45">
                {(() => {
                  const c =
                    parseOccSymbol(symbol.trim().toUpperCase()) ??
                    parseIbOptionDescription(symbol)
                  return c ? optionLabel(c) : 'Parse description or enter OCC'
                })()}
              </p>
            ) : null}
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
              <FieldLabel>{instrument === 'option' ? 'Contracts' : 'Shares'}</FieldLabel>
              <input
                className="input tabular-nums"
                inputMode="decimal"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel>Currency</FieldLabel>
              <select
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value === 'CHF' ? 'CHF' : 'USD')}
                aria-label="Trade currency"
              >
                <option value="USD">USD</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Price ({currency})</FieldLabel>
            <input
              className="input tabular-nums"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
              <FieldLabel>Fee currency</FieldLabel>
              <select
                className="input"
                value={feesCurrency}
                onChange={(e) =>
                  setFeesCurrency(e.target.value === 'CHF' ? 'CHF' : 'USD')
                }
              >
                <option value="USD">USD</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
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
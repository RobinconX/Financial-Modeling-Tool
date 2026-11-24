import { useMemo, useState } from 'react'
import type {
  DisplayCurrency,
  PortfolioExternalCashFlow,
  PortfolioExternalCashState,
} from '../../types'
import { formatMoney } from '../../lib/format'
import {
  externalFlowsForPortfolio,
  parseExternalCashCsv,
} from '../../lib/portfolioExternalCash'
import type { DerivedCashReconciliation } from '../../lib/portfolioDerivedCash'
import type { TwrImpliedCashTopUp } from '../../lib/portfolioPerformanceStats'

type Props = {
  portfolioId: string
  state: PortfolioExternalCashState
  displayCurrency: DisplayCurrency
  reconciliation: DerivedCashReconciliation | null
  impliedCashTopUps: TwrImpliedCashTopUp[]
  onSaveFlow: (flow: PortfolioExternalCashFlow) => boolean
  onDeleteFlow: (id: string) => boolean
  onReplace: (next: PortfolioExternalCashState) => boolean
}

export function PortfolioExternalCashSection({
  portfolioId,
  state,
  displayCurrency,
  reconciliation,
  impliedCashTopUps,
  onSaveFlow,
  onDeleteFlow,
  onReplace,
}: Props) {
  const flows = useMemo(
    () => externalFlowsForPortfolio(state, portfolioId),
    [state, portfolioId],
  )
  const [open, setOpen] = useState(false)
  const [topUpsOpen, setTopUpsOpen] = useState(false)
  const topUpTotal = useMemo(
    () => impliedCashTopUps.reduce((s, t) => s + t.amount, 0),
    [impliedCashTopUps],
  )
  const [date, setDate] = useState('')
  const [direction, setDirection] =
    useState<PortfolioExternalCashFlow['direction']>('deposit')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<DisplayCurrency>('USD')
  const [note, setNote] = useState('')
  const [csvError, setCsvError] = useState<string | null>(null)

  const addRow = () => {
    const amt = Math.abs(Number(amount))
    const flowDate = date.slice(0, 10)
    if (!flowDate || !Number.isFinite(amt) || amt <= 0) return
    const ok = onSaveFlow({
      id: crypto.randomUUID(),
      portfolioId,
      flowDate,
      amount: amt,
      direction,
      currency,
      note: note.trim() || undefined,
    })
    if (ok) {
      setAmount('')
      setNote('')
    }
  }

  const onCsvPaste = (text: string) => {
    const { rows, errors } = parseExternalCashCsv(text, portfolioId)
    if (errors.length > 0) {
      setCsvError(errors.join('; '))
      return
    }
    if (rows.length === 0) return
  const next = { version: 1 as const, flows: [...state.flows, ...rows] }
    const ok = onReplace(next)
    if (ok) {
      setCsvError(null)
    }
  }

  return (
    <section className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3 text-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left font-medium text-zinc-200"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Wire transfers (TWR)</span>
        <span className="text-xs text-zinc-400">
          {flows.length} row{flows.length === 1 ? '' : 's'} · {open ? '−' : '+'}
        </span>
      </button>
      <p className="mt-1 text-xs text-zinc-500">
        Deposits and withdrawals for time-weighted return — separate from Cash-tab year
        deposits.
      </p>
      {reconciliation && flows.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs text-zinc-400">
          <p>
            Wires (logged): {formatMoney(reconciliation.totalWiresDisplay, displayCurrency)}
            {' · '}
            Derived cash today:{' '}
            {formatMoney(reconciliation.derivedCashToday, displayCurrency)}
            {' · '}
            Min cash: {formatMoney(reconciliation.minCash, displayCurrency)} on{' '}
            {reconciliation.minCashDate}
          </p>
          {reconciliation.negativeCashDays > 0 ? (
            <p className="text-amber-400/90">
              Raw settlement cash went negative on {reconciliation.negativeCashDays} day
              {reconciliation.negativeCashDays === 1 ? '' : 's'} (min{' '}
              {formatMoney(reconciliation.minCash, displayCurrency)} on{' '}
              {reconciliation.minCashDate}) — FX, fees, timing, or margin vs the wire log.
            </p>
          ) : null}
        </div>
      ) : null}
      {impliedCashTopUps.length > 0 ? (
        <div className="mt-2 text-xs">
          <button
            type="button"
            className="text-sky-400/90 hover:text-sky-300"
            onClick={() => setTopUpsOpen((v) => !v)}
          >
            Cash top-ups used for TWR: {impliedCashTopUps.length}, total{' '}
            {formatMoney(topUpTotal, displayCurrency)} {topUpsOpen ? '▾' : '▸'}
          </button>
          {topUpsOpen ? (
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-zinc-400">
              {impliedCashTopUps.map((row) => (
                <li key={row.date}>
                  {row.date}: +{formatMoney(row.amount, displayCurrency)} (synthetic wire for
                  chart)
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-zinc-500">
            Not in your wire log — bridges FX/fees/timing gaps for full-NAV TWR linking only.
          </p>
        </div>
      ) : null}
      {open && (
        <div className="mt-3 space-y-3">
          {flows.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500">
                  <th className="text-left font-normal">Date</th>
                  <th className="text-left font-normal">Type</th>
                  <th className="text-right font-normal">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => (
                  <tr key={f.id} className="border-t border-zinc-800">
                    <td>{f.flowDate}</td>
                    <td>{f.direction}</td>
                    <td className="text-right">
                      {formatMoney(f.amount, f.currency)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => onDeleteFlow(f.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
              Date
              <input
                type="date"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
              Type
              <select
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                value={direction}
                onChange={(e) =>
                  setDirection(
                    e.target.value === 'withdrawal' ? 'withdrawal' : 'deposit',
                  )
                }
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
              Amount
              <input
                type="number"
                min={0}
                step="any"
                className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
              CCY
              <select
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value === 'CHF' ? 'CHF' : 'USD')
                }
              >
                <option value="USD">USD</option>
                <option value="CHF">CHF</option>
              </select>
            </label>
            <button
              type="button"
              className="rounded bg-emerald-700/80 px-3 py-1.5 text-xs text-white hover:bg-emerald-600"
              onClick={addRow}
            >
              Add
            </button>
          </div>
          <div>
            <label className="text-xs text-zinc-400">
              Paste CSV (columns: flowDate, direction, amount, currency, note)
            </label>
            <textarea
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-xs font-mono"
              rows={3}
              placeholder="flowDate,direction,amount,currency&#10;2024-01-02,deposit,10000,USD"
            />
            <button
              type="button"
              className="mt-1 rounded bg-sky-800/80 px-2 py-1 text-xs text-white hover:bg-sky-700"
              onClick={(e) => {
                const ta = e.currentTarget.previousElementSibling as HTMLTextAreaElement | null
                if (ta?.value.trim()) {
                  onCsvPaste(ta.value)
                  ta.value = ''
                }
              }}
            >
              Import CSV
            </button>
            {csvError && (
              <p className="mt-1 text-xs text-amber-400">{csvError}</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
import { useState } from 'react'
import { formatMoney } from '../../lib/format'
import {
  balanceNow,
  currentPeriodKey,
  isPermanentCashAccount,
  SAVINGS_CURRENCY,
} from '../../lib/savings'
import type { SavingsAccount, SavingsCadence } from '../../types'

type Props = {
  accounts: SavingsAccount[]
  total: number
  asOf?: Date
  onName: (id: string, name: string) => void
  onContribution: (id: string, value: number) => void
  onCadence: (id: string, cadence: SavingsCadence) => void
  onRate: (id: string, rate: number) => void
  onActual: (id: string, periodKey: string, amount: number | null) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

function parseNonNeg(raw: string): number {
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** Inputs only: account, current amount, contribution cadence & rate. */
export function SavingsTable({
  accounts,
  total,
  asOf = new Date(),
  onName,
  onContribution,
  onCadence,
  onRate,
  onActual,
  onAdd,
  onRemove,
}: Props) {
  const nowKey = currentPeriodKey(asOf)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const draftKey = (accountId: string, field: string) => `${accountId}:${field}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onAdd}>
          + Add account
        </button>
        <div className="text-sm">
          <span className="text-white/45">Total (now)</span>{' '}
          <span className="font-semibold tabular-nums text-emerald-400/90">
            {formatMoney(total, SAVINGS_CURRENCY)}
          </span>
        </div>
      </div>

      <div className="table-shell">
        <table className="min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
              <th className="px-2 py-2 font-medium">Account</th>
              <th className="px-2 py-2 font-medium tabular-nums text-emerald-400/70">
                Amount (now)
              </th>
              <th className="px-2 py-2 font-medium">Contribution</th>
              <th className="px-2 py-2 font-medium">Contrib. cadence</th>
              <th className="px-2 py-2 font-medium">Rate % / yr</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-white/40">
                  No savings accounts yet. Add Pension fund, Emergency fund, or any account.
                </td>
              </tr>
            ) : (
              accounts.map((a) => {
                const nowVal = balanceNow(a, asOf)
                const isCash = isPermanentCashAccount(a)
                return (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-2 py-1.5">
                      <div className="flex min-w-[8rem] flex-col gap-0.5">
                        <input
                          className="input !min-w-[8rem] !py-1 !text-xs"
                          value={a.name}
                          placeholder="Account name"
                          onChange={(e) => onName(a.id, e.target.value)}
                        />
                        {isCash ? (
                          <span className="text-[10px] text-emerald-400/70">
                            Permanent · IC working cash
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      {(() => {
                        const dk = draftKey(a.id, nowKey)
                        return (
                          <input
                            className="input !w-28 !py-1 !text-xs tabular-nums border-emerald-500/30"
                            inputMode="decimal"
                            value={
                              drafts[dk] ?? (nowVal ? String(nowVal) : '')
                            }
                            placeholder="0"
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [dk]: e.target.value }))
                            }
                            onBlur={(e) => {
                              onActual(a.id, nowKey, parseNonNeg(e.target.value))
                              setDrafts((d) => {
                                const next = { ...d }
                                delete next[dk]
                                return next
                              })
                            }}
                          />
                        )
                      })()}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="input !w-24 !py-1 !text-xs tabular-nums"
                        inputMode="decimal"
                        value={
                          drafts[draftKey(a.id, 'contrib')] ??
                          (a.contribution ? String(a.contribution) : '')
                        }
                        placeholder="0"
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [draftKey(a.id, 'contrib')]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          onContribution(a.id, parseNonNeg(e.target.value))
                          setDrafts((d) => {
                            const next = { ...d }
                            delete next[draftKey(a.id, 'contrib')]
                            return next
                          })
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="input !w-[6.5rem] !py-1 !text-xs"
                        value={a.cadence}
                        onChange={(e) => onCadence(a.id, e.target.value as SavingsCadence)}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="input !w-16 !py-1 !text-xs tabular-nums"
                        inputMode="decimal"
                        value={
                          drafts[draftKey(a.id, 'rate')] ??
                          (a.annualRatePercent ? String(a.annualRatePercent) : '')
                        }
                        placeholder="0"
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [draftKey(a.id, 'rate')]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          onRate(a.id, parseNonNeg(e.target.value))
                          setDrafts((d) => {
                            const next = { ...d }
                            delete next[draftKey(a.id, 'rate')]
                            return next
                          })
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {isCash ? (
                        <span
                          className="text-[10px] text-white/25"
                          title="Cash is permanent and cannot be removed"
                        >
                          —
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-white/35 transition hover:text-red-400"
                          title="Remove account"
                          onClick={() => onRemove(a.id)}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {accounts.length > 0 ? (
            <tfoot>
              <tr className="border-t border-white/10 text-xs font-medium">
                <td className="px-2 py-2 text-white/60">Total</td>
                <td className="px-2 py-2 tabular-nums text-emerald-400/90">
                  {formatMoney(total, SAVINGS_CURRENCY)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}

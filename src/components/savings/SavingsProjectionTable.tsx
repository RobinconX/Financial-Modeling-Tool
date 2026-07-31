import { useMemo, useState } from 'react'
import { formatMoney } from '../../lib/format'
import {
  buildTableColumns,
  cellBalance,
  columnTotal,
  currentPeriodKey,
  makePeriodKey,
  SAVINGS_CURRENCY,
} from '../../lib/savings'
import type { SavingsAccount } from '../../types'

type Props = {
  accounts: SavingsAccount[]
  asOf?: Date
  onActual: (id: string, periodKey: string, amount: number | null) => void
  onAddPastPeriodKey: (periodKey: string) => string | null
  onRemovePastPeriod: (periodKey: string) => void
}

function parseNonNeg(raw: string): number {
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** Progression table: past year-ends + now + projected months/milestones. */
export function SavingsProjectionTable({
  accounts,
  asOf = new Date(),
  onActual,
  onAddPastPeriodKey,
  onRemovePastPeriod,
}: Props) {
  const nowKey = currentPeriodKey(asOf)
  const nowYear = asOf.getFullYear()
  const columns = useMemo(() => buildTableColumns(accounts, asOf), [accounts, asOf])

  const displayColumns = useMemo(() => {
    let denseIdx = 0
    return columns.filter((col) => {
      if (col.kind === 'actual') return true
      if (col.key.startsWith('+')) return true
      denseIdx += 1
      return denseIdx % 3 === 0
    })
  }, [columns])

  const [pickYear, setPickYear] = useState(nowYear - 1)
  const [pickError, setPickError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const yearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = nowYear - 1; y >= nowYear - 40; y--) years.push(y)
    return years
  }, [nowYear])

  function handleAddPast() {
    setPickError(null)
    const key = makePeriodKey(pickYear, 12)
    if (key >= nowKey) {
      setPickError('Pick a completed year (year-end before now).')
      return
    }
    const result = onAddPastPeriodKey(key)
    if (!result) {
      setPickError('Could not add that year-end.')
      return
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        Add accounts on the Inputs tab to see projected balances
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div>
          <label className="label !mb-0.5 !text-[10px]">Add past year-end</label>
          <select
            className="input !w-[5.5rem] !py-1 !text-xs"
            value={pickYear}
            onChange={(e) => setPickYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="pb-1 text-xs text-white/40">December balance</div>
        <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={handleAddPast}>
          + Add year
        </button>
        {pickError ? <span className="text-xs text-red-400">{pickError}</span> : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wide text-white/40">
              <th className="sticky left-0 z-10 bg-[#121820] px-2 py-2 font-medium">Account</th>
              {displayColumns.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 py-2 font-medium tabular-nums ${
                    col.kind === 'projected' ? 'text-white/30' : 'text-white/50'
                  } ${col.key === nowKey ? 'text-emerald-400/70' : ''}`}
                  title={
                    col.kind === 'projected'
                      ? 'Projected (end of month)'
                      : col.editable
                        ? 'Actual (end of month) — click × to remove column'
                        : 'Actual (end of month)'
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.editable ? (
                      <button
                        type="button"
                        className="rounded px-0.5 text-[11px] font-normal text-white/30 transition hover:bg-white/10 hover:text-red-400"
                        title={`Remove ${col.label}`}
                        aria-label={`Remove past period ${col.label}`}
                        onClick={() => onRemovePastPeriod(col.key)}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-white/5">
                <td className="sticky left-0 z-10 bg-[#0f141b] px-2 py-1.5 font-medium text-white/85">
                  {a.name.trim() || 'Untitled'}
                </td>
                {displayColumns.map((col) => {
                  const value = cellBalance(a, col.key, col.kind, asOf)
                  if (col.editable) {
                    const dk = `${a.id}:${col.key}`
                    return (
                      <td key={col.key} className="px-2 py-1.5">
                        <input
                          className="input !w-24 !py-1 !text-xs tabular-nums"
                          inputMode="decimal"
                          value={
                            drafts[dk] ??
                            (value ? String(value) : value === 0 ? '0' : '')
                          }
                          placeholder="0"
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [dk]: e.target.value }))
                          }
                          onBlur={(e) => {
                            onActual(a.id, col.key, parseNonNeg(e.target.value))
                            setDrafts((d) => {
                              const next = { ...d }
                              delete next[dk]
                              return next
                            })
                          }}
                        />
                      </td>
                    )
                  }
                  return (
                    <td
                      key={col.key}
                      className={`px-2 py-1.5 tabular-nums ${
                        col.kind === 'projected' ? 'text-white/35' : 'text-white/80'
                      } ${col.key === nowKey ? 'font-semibold text-emerald-400/90' : ''}`}
                    >
                      {formatMoney(value, SAVINGS_CURRENCY)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-white/[0.03] text-xs font-medium">
              <td className="sticky left-0 z-10 bg-[#121820] px-2 py-2 text-white/60">Total</td>
              {displayColumns.map((col) => {
                const sum = columnTotal(accounts, col, asOf)
                return (
                  <td
                    key={col.key}
                    className={`px-2 py-2 tabular-nums ${
                      col.kind === 'projected' ? 'text-white/30' : 'text-emerald-400/80'
                    }`}
                  >
                    {formatMoney(sum, SAVINGS_CURRENCY)}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-white/35">
        Past columns are <span className="text-white/55">year-end</span> only (December). Now is the
        current month; later columns are projected. Prefer the{' '}
        <span className="text-white/55">Actuals</span> tab for bulk year-end entry. Compounding
        applies only December → January; contributions land in the month they are paid (yearly
        contribs in January after interest).
      </p>
    </div>
  )
}

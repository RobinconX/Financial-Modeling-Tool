import { useMemo, useState } from 'react'
import { formatMoney, parseMoney } from '../../lib/format'
import {
  currentPeriodKey,
  getActual,
  labelForPeriodKey,
  makePeriodKey,
  parsePeriodKey,
  SAVINGS_CURRENCY,
} from '../../lib/savings'
import type { SavingsAccount } from '../../types'
import { InfoTip } from '../common/InfoTip'

type Props = {
  accounts: SavingsAccount[]
  asOf?: Date
  onActual: (id: string, periodKey: string, amount: number | null) => void
}

type Row =
  | { kind: 'now'; key: string; label: string }
  | { kind: 'year'; year: number; key: string; label: string }

function roundInput(n: number): number {
  if (!Number.isFinite(n)) return n
  return Math.round(n * 100) / 100
}

/** Past calendar years that already have a Dec year-end (or any) actual stored. */
function yearsWithYearEndData(accounts: SavingsAccount[], nowKey: string): number[] {
  const set = new Set<number>()
  for (const a of accounts) {
    for (const k of Object.keys(a.actuals)) {
      const p = parsePeriodKey(k)
      if (!p || k >= nowKey) continue
      // Prefer Dec year-ends; also surface year if only mid-year data exists
      if (p.month === 12 || !set.has(p.year)) set.add(p.year)
    }
  }
  return [...set].sort((a, b) => b - a)
}

function yearEndKey(year: number): string {
  return makePeriodKey(year, 12)
}

/** Year-end actuals (Dec) + current period row, one column per account. */
export function SavingsActualsEditor({
  accounts,
  asOf = new Date(),
  onActual,
}: Props) {
  const nowKey = currentPeriodKey(asOf)
  const currentYear = asOf.getFullYear()
  const dataYears = useMemo(
    () => yearsWithYearEndData(accounts, nowKey),
    [accounts, nowKey],
  )

  /** Extra years the user opened that may not have data yet. */
  const [extraYears, setExtraYears] = useState<number[]>([])
  const [addYearText, setAddYearText] = useState('')

  const pastYears = useMemo(() => {
    const set = new Set<number>([...dataYears, ...extraYears])
    // Only years whose Dec is strictly before now (avoid duplicating Now)
    return [...set]
      .filter((y) => yearEndKey(y) < nowKey)
      .sort((a, b) => b - a)
  }, [dataYears, extraYears, nowKey])

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [
      {
        kind: 'now',
        key: nowKey,
        label: `Now · ${labelForPeriodKey(nowKey, { short: true })}`,
      },
    ]
    for (const y of pastYears) {
      list.push({
        kind: 'year',
        year: y,
        key: yearEndKey(y),
        label: `${y} year-end`,
      })
    }
    return list
  }, [nowKey, pastYears])

  function addYear() {
    const y = Number(addYearText)
    if (!Number.isFinite(y) || y < 1970 || y > currentYear) return
    const year = Math.floor(y)
    if (yearEndKey(year) >= nowKey) return
    setExtraYears((prev) => (prev.includes(year) ? prev : [...prev, year]))
    setAddYearText('')
  }

  function setRowValue(accountId: string, key: string, raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      onActual(accountId, key, null)
      return
    }
    const parsed = parseMoney(trimmed)
    if (parsed == null || parsed < 0) return
    onActual(accountId, key, parsed)
  }

  function removeYear(year: number) {
    const key = yearEndKey(year)
    for (const a of accounts) {
      if (getActual(a, key) != null) onActual(a.id, key, null)
    }
    setExtraYears((prev) => prev.filter((y) => y !== year))
  }

  if (accounts.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-white/40">
        Add accounts on the Inputs tab to enter actuals
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-emerald-300/90">Yearly actuals</h3>
          <InfoTip label="About yearly actuals">
            Enter year-end balances (December) for past years, plus the current end-of-month
            balance. Amounts in {SAVINGS_CURRENCY}; they feed the Projection chart and table.
          </InfoTip>
        </div>
        <div className="text-xs text-white/40">
          {pastYears.length} past year{pastYears.length === 1 ? '' : 's'} · {SAVINGS_CURRENCY}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Add past year</label>
          <div className="flex gap-1.5">
            <input
              className="input !w-24 tabular-nums"
              type="number"
              min={1970}
              max={currentYear - (nowKey.endsWith('-12') ? 1 : 0)}
              placeholder="e.g. 2020"
              value={addYearText}
              onChange={(e) => setAddYearText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addYear()
              }}
            />
            <button type="button" className="btn-ghost !py-2 !text-xs" onClick={addYear}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="table-shell">
        <table className="min-w-[640px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-white/45">
            <tr className="border-b border-white/10">
              <th className="sticky left-0 z-10 bg-[#0b0f14] px-3 py-2 font-medium">Period</th>
              {accounts.map((a) => (
                <th key={a.id} className="px-3 py-2 font-medium text-white/70">
                  {a.name.trim() || 'Untitled'}
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-emerald-400/70">Total</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              let rowTotal = 0
              let any = false
              for (const a of accounts) {
                const v = getActual(a, row.key)
                if (v != null) {
                  rowTotal += v
                  any = true
                }
              }
              const isNow = row.kind === 'now'
              return (
                <tr
                  key={row.key}
                  className={`border-t border-white/5 ${
                    isNow ? 'bg-emerald-500/[0.06]' : ''
                  }`}
                >
                  <td className="sticky left-0 z-10 bg-[#0b0f14] px-3 py-1.5 font-medium text-white/80">
                    {row.label}
                    {isNow && (
                      <span className="ml-1.5 text-[10px] font-normal text-emerald-400/80">
                        current
                      </span>
                    )}
                  </td>
                  {accounts.map((a) => {
                    const stored = getActual(a, row.key)
                    return (
                      <td key={a.id} className="px-3 py-1.5">
                        <input
                          className={`input tabular-nums !min-w-[6.5rem] !py-1.5 !text-xs ${
                            isNow ? 'border-emerald-500/30' : ''
                          }`}
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 25K"
                          defaultValue={
                            stored != null && Number.isFinite(stored)
                              ? String(roundInput(stored))
                              : ''
                          }
                          key={`${a.id}-${row.key}-${stored ?? 'x'}`}
                          onBlur={(e) => setRowValue(a.id, row.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                        />
                      </td>
                    )
                  })}
                  <td
                    className={`px-3 py-1.5 tabular-nums ${
                      isNow ? 'font-medium text-emerald-400/90' : 'text-white/45'
                    }`}
                  >
                    {any ? formatMoney(rowTotal, SAVINGS_CURRENCY) : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.kind === 'year' ? (
                      <button
                        type="button"
                        className="rounded px-1 text-xs text-white/30 hover:bg-white/10 hover:text-red-400"
                        title={`Remove ${row.year} year-end`}
                        aria-label={`Remove ${row.year}`}
                        onClick={() => removeYear(row.year)}
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

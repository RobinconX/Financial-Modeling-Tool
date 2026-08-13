import { useMemo, useState } from 'react'
import { formatMoney, parseMoney } from '../../lib/format'
import { handleSheetNavKey, handleSheetPaste } from '../../lib/sheetGrid'
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

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

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

/** Past years that have any non-December monthly actual stored. */
function yearsWithMonthlyDetail(accounts: SavingsAccount[], nowKey: string): number[] {
  const set = new Set<number>()
  for (const a of accounts) {
    for (const k of Object.keys(a.actuals)) {
      const p = parsePeriodKey(k)
      if (!p || k > nowKey || p.month === 12) continue
      set.add(p.year)
    }
  }
  return [...set].sort((a, b) => b - a)
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
  const [extraMonthlyYears, setExtraMonthlyYears] = useState<number[]>([])
  const [collapsedMonthlyYears, setCollapsedMonthlyYears] = useState<number[]>(() => [])
  const [addMonthlyText, setAddMonthlyText] = useState('')

  const dataMonthlyYears = useMemo(
    () => yearsWithMonthlyDetail(accounts, nowKey),
    [accounts, nowKey],
  )
  const monthlyYears = useMemo(() => {
    const set = new Set<number>([...dataMonthlyYears, ...extraMonthlyYears])
    if (makePeriodKey(currentYear, 1) <= nowKey) set.add(currentYear)
    return [...set]
      .filter((y) => makePeriodKey(y, 1) <= nowKey)
      .sort((a, b) => b - a)
  }, [dataMonthlyYears, extraMonthlyYears, nowKey, currentYear])

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

  function addMonthlyYear() {
    const y = Number(addMonthlyText)
    if (!Number.isFinite(y) || y < 1970 || y > currentYear) return
    const year = Math.floor(y)
    if (makePeriodKey(year, 1) > nowKey) return
    setCollapsedMonthlyYears((prev) => prev.filter((y) => y !== year))
    setExtraMonthlyYears((prev) => (prev.includes(year) ? prev : [...prev, year]))
    setAddMonthlyText('')
  }

  function monthsForYear(year: number): number[] {
    const months: number[] = []
    for (let m = 1; m <= 12; m++) {
      const key = makePeriodKey(year, m)
      if (key > nowKey) break
      months.push(m)
    }
    return months
  }

  function toggleMonthlyYear(year: number) {
    setCollapsedMonthlyYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
    )
  }

  function monthsFilledInYear(year: number): number {
    const months = monthsForYear(year)
    let n = 0
    for (const m of months) {
      const key = makePeriodKey(year, m)
      if (accounts.some((a) => getActual(a, key) != null)) n += 1
    }
    return n
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
            Year-end (December) balances plus the current month. These are what Projection uses.
            Monthly detail below is for History. Arrow keys move · Enter down · paste a block from
            Excel.
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
                  {accounts.map((a, ci) => {
                    const stored = getActual(a, row.key)
                    const ri = rows.indexOf(row)
                    return (
                      <td key={a.id} className="px-3 py-1.5">
                        <input
                          className={`input tabular-nums !min-w-[6.5rem] !py-1.5 !text-xs ${
                            isNow ? 'border-emerald-500/30' : ''
                          }`}
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 25K"
                          data-sheet="sav-year"
                          data-sheet-row={ri}
                          data-sheet-col={ci}
                          defaultValue={
                            stored != null && Number.isFinite(stored)
                              ? String(roundInput(stored))
                              : ''
                          }
                          key={`${a.id}-${row.key}-${stored ?? 'x'}`}
                          onBlur={(e) => setRowValue(a.id, row.key, e.target.value)}
                          onKeyDown={(e) => {
                            handleSheetNavKey(e, 'sav-year', ri, ci, (raw) =>
                              setRowValue(a.id, row.key, raw),
                            )
                          }}
                          onPaste={(e) => {
                            handleSheetPaste(e, ri, ci, (r, c, raw) => {
                              const rr = rows[r]
                              const acc = accounts[c]
                              if (!rr || !acc) return false
                              setRowValue(acc.id, rr.key, raw)
                              return true
                            })
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

      <div className="section-header border-t border-white/5 pt-4">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-sky-300/90">Monthly actuals</h3>
          <InfoTip label="About monthly savings actuals">
            Optional end-of-month balances for a past year. December is the same year-end value as
            above. These months show on History; Projection still only plots year-end + Now.
          </InfoTip>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Add year</label>
          <div className="flex gap-1.5">
            <input
              className="input !w-24 tabular-nums"
              type="number"
              min={1970}
              max={currentYear}
              placeholder="e.g. 2023"
              value={addMonthlyText}
              onChange={(e) => setAddMonthlyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addMonthlyYear()
              }}
            />
            <button type="button" className="btn-ghost !py-2 !text-xs" onClick={addMonthlyYear}>
              Add
            </button>
          </div>
        </div>
      </div>

      {monthlyYears.length === 0 ? (
        <p className="text-[11px] text-white/40">
          Add a year to enter Jan–Dec balances (current year goes through this month).
        </p>
      ) : (
        monthlyYears.map((year) => {
          const months = monthsForYear(year)
          if (months.length === 0) return null
          const collapsed = collapsedMonthlyYears.includes(year)
          const filled = monthsFilledInYear(year)
          return (
            <div key={year} className="space-y-1.5">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-white/[0.04]"
                onClick={() => toggleMonthlyYear(year)}
                aria-expanded={!collapsed}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                  <span
                    className={`inline-block text-white/35 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                    aria-hidden
                  >
                    ▸
                  </span>
                  {year}
                  <span className="font-normal text-white/35">
                    {filled}/{months.length} months
                  </span>
                </span>
                <span className="text-[11px] text-white/40">
                  {collapsed ? 'Expand' : 'Collapse'}
                </span>
              </button>
              {collapsed ? null : (
              <div className="table-shell overflow-x-auto">
                <table className="min-w-[480px] text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-white/45">
                    <tr className="border-b border-white/10">
                      <th className="sticky left-0 z-10 bg-[#0b0f14] px-3 py-2 font-medium">
                        Month
                      </th>
                      {accounts.map((a) => (
                        <th key={a.id} className="px-3 py-2 font-medium text-white/70">
                          {a.name.trim() || 'Untitled'}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium text-emerald-400/70">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => {
                      const key = makePeriodKey(year, m)
                      let rowTotal = 0
                      let any = false
                      for (const a of accounts) {
                        const v = getActual(a, key)
                        if (v != null) {
                          rowTotal += v
                          any = true
                        }
                      }
                      const isDec = m === 12
                      return (
                        <tr key={key} className="border-t border-white/5">
                          <td className="sticky left-0 z-10 bg-[#0b0f14] px-3 py-1.5 text-white/75">
                            {MONTHS[m - 1]}
                            {isDec ? (
                              <span className="ml-1 text-[10px] text-white/35">year-end</span>
                            ) : null}
                          </td>
                          {accounts.map((a, ci) => {
                            const stored = getActual(a, key)
                            const ri = months.indexOf(m)
                            const sheet = `sav-m-${year}`
                            return (
                              <td key={a.id} className="px-3 py-1.5">
                                <input
                                  className="input tabular-nums !min-w-[6.5rem] !py-1.5 !text-xs"
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="—"
                                  data-sheet={sheet}
                                  data-sheet-row={ri}
                                  data-sheet-col={ci}
                                  defaultValue={
                                    stored != null && Number.isFinite(stored)
                                      ? String(roundInput(stored))
                                      : ''
                                  }
                                  key={`${a.id}-${key}-${stored ?? 'x'}`}
                                  onBlur={(e) => setRowValue(a.id, key, e.target.value)}
                                  onKeyDown={(e) => {
                                    handleSheetNavKey(e, sheet, ri, ci, (raw) =>
                                      setRowValue(a.id, key, raw),
                                    )
                                  }}
                                  onPaste={(e) => {
                                    handleSheetPaste(e, ri, ci, (r, c, raw) => {
                                      const month = months[r]
                                      const acc = accounts[c]
                                      if (month == null || !acc) return false
                                      setRowValue(acc.id, makePeriodKey(year, month), raw)
                                      return true
                                    })
                                  }}
                                />
                              </td>
                            )
                          })}
                          <td className="px-3 py-1.5 tabular-nums text-white/45">
                            {any ? formatMoney(rowTotal, SAVINGS_CURRENCY) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

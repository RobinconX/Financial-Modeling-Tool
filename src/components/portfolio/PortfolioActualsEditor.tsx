import { useMemo, useState } from 'react'
import type { DisplayCurrency, PortfolioActualsState } from '../../types'
import {
  getActualsCurrency,
  getActualsMap,
  listActualYears,
  makeActualKey,
} from '../../lib/portfolio'
import { clearActualYear, hasActualMonths, setActualMonth } from '../../lib/portfolioActuals'
import { amountToDisplay } from '../../lib/fx'
import { formatMoney, parseMoney } from '../../lib/format'
import { handleSheetNavKey, parseClipboardGrid } from '../../lib/sheetGrid'
import { InfoTip } from '../common/InfoTip'

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

type Props = {
  actuals: PortfolioActualsState
  onChange: (next: PortfolioActualsState) => void
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  error?: string | null
}

function roundInput(n: number): number {
  if (!Number.isFinite(n)) return n
  return Math.round(n * 100) / 100
}

export function PortfolioActualsEditor({
  actuals,
  onChange,
  displayCurrency,
  usdToChf,
  error,
}: Props) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const map = getActualsMap(actuals)
  const storeCurrency = getActualsCurrency(actuals)
  const yearsWithData = listActualYears(actuals)

  const yearOptions = useMemo(() => {
    const set = new Set<number>([currentYear, ...yearsWithData])
    for (let y = currentYear; y >= currentYear - 15; y--) set.add(y)
    return [...set].sort((a, b) => b - a)
  }, [currentYear, yearsWithData])

  const [year, setYear] = useState(currentYear)
  const [addYearText, setAddYearText] = useState('')

  const entryCurrency: DisplayCurrency = hasActualMonths(actuals)
    ? storeCurrency
    : displayCurrency

  function commit(next: PortfolioActualsState) {
    const currency =
      Object.keys(next.byMonth).length === 0 ? entryCurrency : next.currency
    onChange({ ...next, currency })
  }

  function writeMonth(state: PortfolioActualsState, month: number, raw: string) {
    if (year > currentYear || (year === currentYear && month > currentMonth)) return state
    const trimmed = raw.trim()
    if (!trimmed) return setActualMonth(state, year, month, null)
    const parsed = parseMoney(trimmed)
    if (parsed == null || parsed < 0) return state
    return setActualMonth(state, year, month, parsed)
  }

  function setMonthValue(month: number, raw: string) {
    let next = actuals
    if (!hasActualMonths(actuals) && actuals.currency !== entryCurrency) {
      next = { ...actuals, currency: entryCurrency }
    }
    commit(writeMonth(next, month, raw))
  }

  function pasteMonths(startRow: number, text: string): boolean {
    const grid = parseClipboardGrid(text)
    if (grid.length === 0) return false
    if (grid.length === 1 && (grid[0]?.length ?? 0) <= 1) return false
    let next = actuals
    if (!hasActualMonths(actuals) && actuals.currency !== entryCurrency) {
      next = { ...actuals, currency: entryCurrency }
    }
    for (let i = 0; i < grid.length; i++) {
      const month = startRow + i + 1
      if (month < 1 || month > 12) break
      next = writeMonth(next, month, grid[i]?.[0] ?? '')
    }
    commit(next)
    return true
  }

  function addYear() {
    const y = Number(addYearText)
    if (!Number.isFinite(y) || y < 1970 || y > currentYear + 1) return
    setYear(Math.floor(y))
    setAddYearText('')
  }

  const monthsFilled = MONTHS.reduce((n, _, i) => {
    const v = map[makeActualKey(year, i + 1)]
    return n + (v != null && Number.isFinite(v) ? 1 : 0)
  }, 0)

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-emerald-300/90">Monthly actuals</h3>
          <InfoTip label="About portfolio actuals">
            End-of-month totals for the whole investing pile — shared by every portfolio scenario.
            Stored in {entryCurrency}. Arrow keys move · Enter down · paste a column from Excel.
            Charts use the last actual of each year for past bars.
          </InfoTip>
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Year</label>
          <select
            className="input !w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
                {yearsWithData.includes(y) ? ' · has data' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Add past year</label>
          <div className="flex gap-1.5">
            <input
              className="input !w-24 tabular-nums"
              type="number"
              min={1970}
              max={currentYear}
              placeholder="e.g. 2020"
              value={addYearText}
              onChange={(e) => setAddYearText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addYear()
              }}
            />
            <button type="button" className="btn-ghost !py-2 !text-xs" onClick={addYear}>
              Open
            </button>
          </div>
        </div>
        <div className="pb-0.5 text-xs text-white/40">
          {monthsFilled}/12 months · {entryCurrency}
        </div>
        {monthsFilled > 0 && (
          <button
            type="button"
            className="btn-ghost !py-1.5 !text-xs text-red-300/80"
            onClick={() => commit(clearActualYear(actuals, year))}
          >
            Clear {year}
          </button>
        )}
      </div>

      <div className="table-shell">
        <table className="min-w-[640px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-white/45">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">
                End-of-month total ({entryCurrency})
              </th>
              <th className="px-3 py-2 font-medium text-white/35">Display</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((label, i) => {
              const month = i + 1
              const key = makeActualKey(year, month)
              const stored = map[key]
              const isFuture =
                year > currentYear || (year === currentYear && month > currentMonth)
              const display =
                stored != null
                  ? formatMoney(
                      amountToDisplay(stored, entryCurrency, displayCurrency, usdToChf),
                      displayCurrency,
                    )
                  : '—'
              return (
                <tr
                  key={key}
                  className={`border-t border-white/5 ${
                    isFuture ? 'opacity-50' : ''
                  } ${month === currentMonth && year === currentYear ? 'bg-emerald-500/[0.06]' : ''}`}
                >
                  <td className="px-3 py-1.5 font-medium text-white/80">
                    {label}
                    {month === currentMonth && year === currentYear && (
                      <span className="ml-1.5 text-[10px] font-normal text-emerald-400/80">
                        current
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input tabular-nums"
                      type="text"
                      inputMode="decimal"
                      placeholder={isFuture ? 'Future' : 'e.g. 250K'}
                      disabled={isFuture}
                      data-sheet="pf-act"
                      data-sheet-row={i}
                      data-sheet-col={0}
                      defaultValue={
                        stored != null && Number.isFinite(stored)
                          ? String(roundInput(stored))
                          : ''
                      }
                      key={`${key}-${stored ?? 'x'}-${entryCurrency}`}
                      onBlur={(e) => setMonthValue(month, e.target.value)}
                      onKeyDown={(e) => {
                        handleSheetNavKey(e, 'pf-act', i, 0, (raw) => setMonthValue(month, raw))
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text/plain')
                        if (pasteMonths(i, text)) e.preventDefault()
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-white/45">{display}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

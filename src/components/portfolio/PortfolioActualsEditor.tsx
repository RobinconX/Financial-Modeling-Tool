import { useMemo, useState } from 'react'
import type { DisplayCurrency, SavedPortfolio } from '../../types'
import {
  applyPortfolioValuesToTarget,
  getActualsCurrency,
  getActualsMap,
  listActualYears,
  makeActualKey,
} from '../../lib/portfolio'
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
  portfolio: SavedPortfolio
  onChange: (patch: Partial<SavedPortfolio>) => void
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  /** Other portfolios for “copy actuals to…” */
  otherPortfolios?: SavedPortfolio[]
  onUpdateOtherPortfolio?: (id: string, patch: Partial<SavedPortfolio>) => boolean
}

function roundInput(n: number): number {
  if (!Number.isFinite(n)) return n
  return Math.round(n * 100) / 100
}

export function PortfolioActualsEditor({
  portfolio,
  onChange,
  displayCurrency,
  usdToChf,
  otherPortfolios = [],
  onUpdateOtherPortfolio,
}: Props) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const actuals = getActualsMap(portfolio)
  const storeCurrency = getActualsCurrency(portfolio)
  const yearsWithData = listActualYears(portfolio)

  const yearOptions = useMemo(() => {
    const set = new Set<number>([currentYear, ...yearsWithData])
    for (let y = currentYear; y >= currentYear - 15; y--) set.add(y)
    return [...set].sort((a, b) => b - a)
  }, [currentYear, yearsWithData])

  const [year, setYear] = useState(currentYear)
  const [addYearText, setAddYearText] = useState('')
  const [showPropagate, setShowPropagate] = useState(false)
  const [propagateIds, setPropagateIds] = useState<Record<string, boolean>>({})
  const [propagateMsg, setPropagateMsg] = useState<string | null>(null)

  const entryCurrency: DisplayCurrency =
    portfolio.actualsCurrency ??
    (Object.keys(actuals).length === 0 ? displayCurrency : storeCurrency)

  function commitActuals(next: Record<string, number>) {
    onChange({
      actuals: Object.keys(next).length ? next : undefined,
      actualsCurrency: entryCurrency,
    })
  }

  function writeMonth(next: Record<string, number>, month: number, raw: string) {
    if (year > currentYear || (year === currentYear && month > currentMonth)) return
    const key = makeActualKey(year, month)
    const trimmed = raw.trim()
    if (!trimmed) {
      delete next[key]
      return
    }
    const parsed = parseMoney(trimmed)
    if (parsed == null || parsed < 0) return
    next[key] = parsed
  }

  function setMonthValue(month: number, raw: string) {
    const next = { ...actuals }
    writeMonth(next, month, raw)
    commitActuals(next)
  }

  function pasteMonths(startRow: number, text: string): boolean {
    const grid = parseClipboardGrid(text)
    if (grid.length === 0) return false
    if (grid.length === 1 && (grid[0]?.length ?? 0) <= 1) return false
    const next = { ...actuals }
    for (let i = 0; i < grid.length; i++) {
      const month = startRow + i + 1
      if (month < 1 || month > 12) break
      writeMonth(next, month, grid[i]?.[0] ?? '')
    }
    commitActuals(next)
    return true
  }

  function addYear() {
    const y = Number(addYearText)
    if (!Number.isFinite(y) || y < 1970 || y > currentYear + 1) return
    setYear(Math.floor(y))
    setAddYearText('')
  }

  function clearYear() {
    const next = { ...actuals }
    for (let m = 1; m <= 12; m++) {
      delete next[makeActualKey(year, m)]
    }
    commitActuals(next)
  }

  function openPropagate() {
    const init: Record<string, boolean> = {}
    for (const p of otherPortfolios) init[p.id] = true
    setPropagateIds(init)
    setPropagateMsg(null)
    setShowPropagate(true)
  }

  function applyPropagate() {
    if (!onUpdateOtherPortfolio) return
    const targets = otherPortfolios.filter((p) => propagateIds[p.id])
    if (targets.length === 0) {
      setPropagateMsg('Select at least one portfolio.')
      return
    }
    let n = 0
    for (const t of targets) {
      const next = applyPortfolioValuesToTarget(portfolio, t, { actuals: true })
      if (
        onUpdateOtherPortfolio(t.id, {
          actuals: next.actuals,
          actualsCurrency: next.actualsCurrency,
        })
      ) {
        n += 1
      }
    }
    setPropagateMsg(`Copied actuals to ${n} portfolio${n === 1 ? '' : 's'}.`)
    setShowPropagate(false)
  }

  const monthsFilled = MONTHS.reduce((n, _, i) => {
    const v = actuals[makeActualKey(year, i + 1)]
    return n + (v != null && Number.isFinite(v) ? 1 : 0)
  }, 0)

  const totalKeys = Object.keys(actuals).length

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-emerald-300/90">Monthly actuals</h3>
          <InfoTip label="About portfolio actuals">
            Enter end-of-month portfolio totals (once per month). Stored in {entryCurrency}. Arrow
            keys move · Enter down · paste a column from Excel. Chart uses the last actual of each
            year for past bars.
          </InfoTip>
        </div>
        {otherPortfolios.length > 0 && onUpdateOtherPortfolio && (
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={openPropagate}
            title="Overwrite monthly actuals on other portfolios with this portfolio’s values"
          >
            Copy actuals…
          </button>
        )}
      </div>

      {propagateMsg && (
        <p className="text-[11px] text-emerald-300/90">{propagateMsg}</p>
      )}

      {showPropagate && otherPortfolios.length > 0 && onUpdateOtherPortfolio && (
        <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white/90">
                Copy actuals to other portfolios
              </h4>
              <p className="text-[11px] text-white/45">
                Overwrite monthly end-of-month totals and actuals currency on the selected
                portfolios
                {totalKeys > 0
                  ? ` (${totalKeys} month${totalKeys === 1 ? '' : 's'} in this portfolio).`
                  : ' (this portfolio has no actuals — targets will be cleared).'}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              onClick={() => setShowPropagate(false)}
            >
              Cancel
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-white/10 bg-black/20 p-2">
            <div className="mb-1 flex gap-2">
              <button
                type="button"
                className="text-[11px] text-emerald-400/90 hover:underline"
                onClick={() => {
                  const all: Record<string, boolean> = {}
                  for (const p of otherPortfolios) all[p.id] = true
                  setPropagateIds(all)
                }}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-[11px] text-white/45 hover:underline"
                onClick={() => setPropagateIds({})}
              >
                None
              </button>
            </div>
            {otherPortfolios.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-white/80 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={!!propagateIds[p.id]}
                  onChange={(e) =>
                    setPropagateIds((prev) => ({ ...prev, [p.id]: e.target.checked }))
                  }
                />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
          <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={applyPropagate}>
            Apply to selected
          </button>
        </div>
      )}

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
            onClick={clearYear}
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
              const stored = actuals[key]
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

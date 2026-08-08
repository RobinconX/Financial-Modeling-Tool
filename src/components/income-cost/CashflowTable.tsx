import { useMemo, useRef, useState } from 'react'
import type { CashflowCadence, CashflowKind, CashflowLine } from '../../types'
import {
  INCOME_COST_CURRENCY,
  MONTH_LABELS,
  lineMonthly,
  normalizeMonth,
  setAmountFromMonthly,
  setAmountFromYearly,
  sortLines,
  type SortDir,
  type SortKey,
} from '../../lib/incomeCost'
import { formatMoney, parseMoney } from '../../lib/format'
import { formatInputNumber } from '../common/MoneyInput'

type Props = {
  kind: CashflowKind
  scenarioId: string
  lines: CashflowLine[]
  onChange: (line: CashflowLine) => void
  onRemove: (id: string) => void
  onAdd: (cadence: CashflowCadence) => void
}

export function CashflowTable({ kind, scenarioId, lines, onChange, onRemove, onAdd }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const kindLines = useMemo(
    () => lines.filter((l) => l.kind === kind && l.scenarioId === scenarioId),
    [lines, kind, scenarioId],
  )
  const recurring = useMemo(
    () =>
      sortLines(
        kindLines.filter((l) => l.cadence === 'recurring'),
        sortKey,
        sortDir,
      ),
    [kindLines, sortKey, sortDir],
  )
  const oneTime = useMemo(
    () =>
      sortLines(
        kindLines.filter((l) => l.cadence === 'one-time'),
        sortKey,
        sortDir,
      ),
    [kindLines, sortKey, sortDir],
  )

  const title = kind === 'cost' ? 'Costs' : 'Income'
  const accent = kind === 'cost' ? 'text-amber-300/90' : 'text-emerald-400/90'
  const isIncome = kind === 'income'
  const monthColumnLabel = isIncome ? 'Received in' : 'Paid in'

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${accent}`}>{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={() => onAdd('recurring')}
          >
            + Position
          </button>
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={() => onAdd('one-time')}
          >
            + One-time
          </button>
        </div>
      </div>

      <Section
        label="Recurring (monthly / yearly)"
        monthColumnLabel={monthColumnLabel}
        monthHint={
          isIncome
            ? 'Leave Received in empty to spread yearly÷12 each month. Pick a month to receive the full yearly amount only then.'
            : 'Leave Paid in empty to spread yearly÷12 each month. Pick a month to pay the full yearly amount only then.'
        }
        rows={recurring}
        showMonthly
        sortMark={sortMark}
        onToggleSort={toggleSort}
        onChange={onChange}
        onRemove={onRemove}
      />
      <Section
        label="One-time (this scenario only)"
        monthColumnLabel={monthColumnLabel}
        monthHint={
          isIncome
            ? 'Pick the month the full amount is received. Empty = annual total only (not on monthly path).'
            : 'Pick the month the full amount is paid. Empty = annual total only (not on monthly path).'
        }
        rows={oneTime}
        showMonthly={false}
        sortMark={sortMark}
        onToggleSort={toggleSort}
        onChange={onChange}
        onRemove={onRemove}
      />
    </div>
  )
}

function Section({
  label,
  monthColumnLabel,
  monthHint,
  rows,
  showMonthly,
  sortMark,
  onToggleSort,
  onChange,
  onRemove,
}: {
  label: string
  monthColumnLabel: string
  monthHint: string
  rows: CashflowLine[]
  showMonthly: boolean
  sortMark: (k: SortKey) => string
  onToggleSort: (k: SortKey) => void
  onChange: (line: CashflowLine) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-white/35">None yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[400px] text-left text-xs">
            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-1.5 py-1.5">
                  <button
                    type="button"
                    className="font-medium hover:text-white"
                    onClick={() => onToggleSort('name')}
                  >
                    Position{sortMark('name')}
                  </button>
                </th>
                <th className="px-1.5 py-1.5" title={monthHint}>
                  {monthColumnLabel}
                </th>
                {showMonthly && (
                  <th className="px-1.5 py-1.5 text-right">
                    <button
                      type="button"
                      className="font-medium hover:text-white"
                      onClick={() => onToggleSort('monthly')}
                    >
                      /mo{sortMark('monthly')}
                    </button>
                  </th>
                )}
                <th className="px-1.5 py-1.5 text-right">
                  <button
                    type="button"
                    className="font-medium hover:text-white"
                    onClick={() => onToggleSort('yearly')}
                  >
                    /yr{sortMark('yearly')}
                  </button>
                </th>
                <th className="w-8 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LineRow
                  key={row.id}
                  line={row}
                  showMonthly={showMonthly}
                  onChange={onChange}
                  onRemove={() => onRemove(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="text-[10px] leading-snug text-white/30">{monthHint}</p>
      )}
    </div>
  )
}

function MonthSelect({
  line,
  onChange,
}: {
  line: CashflowLine
  onChange: (line: CashflowLine) => void
}) {
  const value = normalizeMonth(line.month)
  const isIncome = line.kind === 'income'
  const verb = isIncome ? 'received' : 'paid'
  const needsMonth =
    line.cadence === 'one-time' && line.yearlyAmount > 0 && value == null
  const lumpSum = value != null
  return (
    <select
      className={`input !w-[4.25rem] !py-1 !text-[11px] ${
        needsMonth
          ? 'border-amber-500/40 bg-amber-500/10'
          : lumpSum
            ? 'border-sky-500/25 bg-sky-500/10'
            : ''
      }`}
      value={value ?? ''}
      title={
        needsMonth
          ? `Set month — full amount is ${verb} only in that month`
          : lumpSum
            ? `Full yearly amount ${verb} in ${MONTH_LABELS[value - 1]} only (other months: 0 for this line)`
            : line.cadence === 'recurring'
              ? `Empty = spread yearly÷12 every month. Pick a month = ${verb} full yearly amount that month only`
              : `Pick the month the full amount is ${verb}`
      }
      onChange={(e) => {
        const raw = e.target.value
        onChange({
          ...line,
          month: raw === '' ? null : normalizeMonth(raw),
        })
      }}
    >
      <option value="">{line.cadence === 'one-time' ? '?' : '÷12'}</option>
      {MONTH_LABELS.map((label, i) => (
        <option key={label} value={i + 1}>
          {label}
        </option>
      ))}
    </select>
  )
}

function LineRow({
  line,
  showMonthly,
  onChange,
  onRemove,
}: {
  line: CashflowLine
  showMonthly: boolean
  onChange: (line: CashflowLine) => void
  onRemove: () => void
}) {
  const hasDetail = Boolean(line.detail?.trim())
  const [noteOpen, setNoteOpen] = useState(false)
  const noteRef = useRef<HTMLInputElement>(null)

  const monthly = lineMonthly(line)
  const monthlyDisplay =
    line.yearlyAmount > 0 ? formatInputNumber(monthly, 2) : ''
  const yearlyDisplay =
    line.yearlyAmount > 0 ? formatInputNumber(line.yearlyAmount, 2) : ''

  return (
    <tr className="border-t border-white/5">
      <td className="relative px-1.5 py-1">
        <div className="group relative">
          <input
            className="input w-full min-w-0 !py-1 !pr-8 !text-xs"
            placeholder="e.g. Groceries"
            value={line.name}
            onChange={(e) => onChange({ ...line, name: e.target.value })}
          />
          {/* + sits inside the input field */}
          <button
            type="button"
            className={`absolute top-1/2 right-1 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-sm leading-none transition ${
              hasDetail || noteOpen
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'text-white/40 hover:bg-white/10 hover:text-white/80'
            }`}
            title={hasDetail ? 'Edit note' : 'Add note'}
            aria-label={hasDetail ? 'Edit note' : 'Add note'}
            onClick={() => {
              setNoteOpen((o) => !o)
              window.setTimeout(() => noteRef.current?.focus(), 0)
            }}
          >
            +
          </button>
          {hasDetail && (
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden max-w-[16rem] rounded-lg border border-white/15 bg-[#121820] px-2.5 py-1.5 text-[11px] leading-snug text-white/85 shadow-xl group-hover:block"
            >
              {line.detail}
            </div>
          )}
        </div>
        {noteOpen && (
          <div className="absolute top-full left-1.5 right-1.5 z-20 mt-0.5 rounded-lg border border-white/15 bg-[#121820] p-1.5 shadow-xl">
            <input
              ref={noteRef}
              className="input w-full !py-1 !text-[11px]"
              placeholder="Note (shows on hover of name)"
              value={line.detail ?? ''}
              onChange={(e) => onChange({ ...line, detail: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault()
                  setNoteOpen(false)
                }
              }}
              onBlur={() => {
                window.setTimeout(() => setNoteOpen(false), 120)
              }}
            />
          </div>
        )}
      </td>
      <td className="px-1.5 py-1">
        <MonthSelect line={line} onChange={onChange} />
      </td>
      {showMonthly && (
        <td className="w-[6.5rem] px-1.5 py-1">
          <input
            className="input !py-1 !text-xs text-right tabular-nums"
            inputMode="decimal"
            placeholder="0"
            title={formatMoney(monthly, INCOME_COST_CURRENCY)}
            defaultValue={monthlyDisplay}
            key={`m-${line.id}-${line.yearlyAmount}-${line.lastEdited ?? ''}`}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              if (!raw) {
                onChange(setAmountFromMonthly(line, 0))
                return
              }
              const v = parseMoney(raw)
              if (v == null || v < 0) return
              onChange(setAmountFromMonthly(line, v))
            }}
          />
        </td>
      )}
      <td className="w-[6.5rem] px-1.5 py-1">
        <input
          className="input !py-1 !text-xs text-right tabular-nums"
          inputMode="decimal"
          placeholder="0"
          title={formatMoney(line.yearlyAmount, INCOME_COST_CURRENCY)}
          defaultValue={yearlyDisplay}
          key={`y-${line.id}-${line.yearlyAmount}-${line.lastEdited ?? ''}`}
          onBlur={(e) => {
            const raw = e.target.value.trim()
            if (!raw) {
              onChange(setAmountFromYearly(line, 0))
              return
            }
            const v = parseMoney(raw)
            if (v == null || v < 0) return
            onChange(setAmountFromYearly(line, v))
          }}
        />
      </td>
      <td className="w-8 px-1 py-1 text-right">
        <button
          type="button"
          className="text-[11px] text-white/35 hover:text-red-300"
          onClick={onRemove}
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

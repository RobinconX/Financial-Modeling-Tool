import { useEffect, useMemo, useRef, useState } from 'react'
import type { CashflowCadence, CashflowKind, CashflowLine } from '../../types'
import {
  INCOME_COST_CURRENCY,
  MONTH_LABELS,
  formatPaymentScheduleSummary,
  lineMonthly,
  normalizeMonths,
  paymentMonths,
  setAmountFromMonthly,
  setAmountFromYearly,
  sortLines,
  type SortKey,
} from '../../lib/incomeCost'
import {
  loadCashflowTableSort,
  saveCashflowTableSort,
} from '../../lib/incomeCostStorage'
import { formatMoney, parseMoney } from '../../lib/format'
import { formatInputNumber } from '../common/MoneyInput'
import { InfoTip } from '../common/InfoTip'

const PAYMENT_HINT =
  'Monthly spreads the yearly amount ÷12 every month. Select one or more months to split the yearly total equally across those months (rounding remainder on the last month). /mo always shows the yearly÷12 average.'

type Props = {
  kind: CashflowKind
  scenarioId: string
  lines: CashflowLine[]
  onChange: (line: CashflowLine) => void
  onRemove: (id: string) => void
  onAdd: (cadence: CashflowCadence) => void
}

export function CashflowTable({ kind, scenarioId, lines, onChange, onRemove, onAdd }: Props) {
  const [sort, setSort] = useState(() => loadCashflowTableSort(kind))
  const { key: sortKey, dir: sortDir } = sort

  useEffect(() => {
    saveCashflowTableSort(kind, sort)
  }, [kind, sort])

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

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { key, dir: key === 'name' ? 'asc' : 'desc' }
    })
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const edge =
    kind === 'cost'
      ? 'border-l-2 border-l-amber-400/50'
      : 'border-l-2 border-l-emerald-400/50'

  return (
    <div className={`panel space-y-4 overflow-visible ${edge}`}>
      <div className="section-header">
        <h3 className={`text-sm font-semibold tracking-wide ${accent}`}>{title}</h3>
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
        label="Recurring"
        rows={recurring}
        sortMark={sortMark}
        onToggleSort={toggleSort}
        onChange={onChange}
        onRemove={onRemove}
      />
      <div className="border-t border-white/[0.06] pt-4">
        <Section
          label="One-time"
          rows={oneTime}
          sortMark={sortMark}
          onToggleSort={toggleSort}
          onChange={onChange}
          onRemove={onRemove}
        />
      </div>
    </div>
  )
}

function Section({
  label,
  rows,
  sortMark,
  onToggleSort,
  onChange,
  onRemove,
}: {
  label: string
  rows: CashflowLine[]
  sortMark: (k: SortKey) => string
  onToggleSort: (k: SortKey) => void
  onChange: (line: CashflowLine) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-1.5 overflow-visible">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
        <InfoTip label={`About ${label}`}>{PAYMENT_HINT}</InfoTip>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-white/35">None yet.</p>
      ) : (
        <div className="table-shell table-shell-allow-expand">
          <table className="min-w-[400px] text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-white/45">
              <tr className="border-b border-white/10">
                <th className="px-1.5 py-1.5 font-medium">
                  <button
                    type="button"
                    className="font-medium hover:text-white"
                    onClick={() => onToggleSort('name')}
                  >
                    Position{sortMark('name')}
                  </button>
                </th>
                <th className="px-1.5 py-1.5 font-medium" title={PAYMENT_HINT}>
                  Payment
                </th>
                <th className="px-1.5 py-1.5 text-right font-medium">
                  <button
                    type="button"
                    className="font-medium hover:text-white"
                    onClick={() => onToggleSort('monthly')}
                  >
                    /mo{sortMark('monthly')}
                  </button>
                </th>
                <th className="px-1.5 py-1.5 text-right font-medium">
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
                  onChange={onChange}
                  onRemove={() => onRemove(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PaymentSchedule({
  line,
  onChange,
}: {
  line: CashflowLine
  onChange: (line: CashflowLine) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = paymentMonths(line)
  const monthly = selected.length === 0
  const summary = formatPaymentScheduleSummary(selected)
  const isIncome = line.kind === 'income'
  const verb = isIncome ? 'received' : 'paid'

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function setMonths(months: number[]) {
    onChange({ ...line, months: normalizeMonths(months) })
  }

  return (
    <div ref={rootRef} className="max-w-[11rem] min-w-[5.5rem]">
      <button
        type="button"
        className={`input flex w-full items-center justify-between gap-1 !py-1 !pr-1.5 !pl-2 !text-[11px] ${
          monthly ? '' : 'border-sky-500/25 bg-sky-500/10'
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={PAYMENT_HINT}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate text-left">{summary}</span>
        <span className="shrink-0 text-[9px] text-white/40" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="mt-1 w-[13.5rem] max-w-[min(13.5rem,100vw)] rounded-lg border border-white/15 bg-[#121820] p-2 shadow-xl"
          role="dialog"
          aria-label="Payment schedule"
        >
          <button
            type="button"
            className={`mb-2 w-full rounded px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide transition ${
              monthly
                ? 'bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/30'
                : 'bg-white/5 text-white/55 hover:bg-white/10'
            }`}
            onClick={() => {
              setMonths([])
              setOpen(false)
            }}
          >
            Monthly
          </button>
          <p className="mb-1 text-[9px] text-white/40">Selected months</p>
          <div className="flex flex-wrap gap-0.5" role="group" aria-label="Selected months">
            {MONTH_LABELS.map((label, i) => {
              const m = i + 1
              const on = selected.includes(m)
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  className={`min-w-[1.65rem] rounded px-0.5 py-0.5 text-[9px] font-medium tabular-nums transition ${
                    on
                      ? 'bg-sky-500/35 text-sky-50 ring-1 ring-sky-400/35'
                      : 'bg-white/[0.06] text-white/40 hover:bg-white/12'
                  }`}
                  title={
                    on
                      ? `${label}: included in split (${verb})`
                      : `Include ${label} in payment split`
                  }
                  onClick={() => {
                    if (on) setMonths(selected.filter((x) => x !== m))
                    else setMonths([...selected, m])
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function LineRow({
  line,
  onChange,
  onRemove,
}: {
  line: CashflowLine
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
      <td className="px-1.5 py-1 align-top">
        <PaymentSchedule line={line} onChange={onChange} />
      </td>
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

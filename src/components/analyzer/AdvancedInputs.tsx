import { useEffect, useState, type ReactNode } from 'react'
import type { YearProjection } from '../../types'
import {
  advancedCagrGapYears,
  cumulativeDilutionByYear,
  materializeAdvancedCagrYears,
  newYearProjection,
  normalizeDilution,
  sortYearProjections,
} from '../../lib/valuation'
import { MoneyInput, NumberInput } from '../common/MoneyInput'
import { formatMoney, formatMultiple } from '../../lib/format'

type Props = {
  rows: YearProjection[]
  onChange: (rows: YearProjection[]) => void
  currency?: string
  sharesOutstanding?: number | null
  /** Today’s mcap — enables CAGR fill from now when only one future year is set */
  currentMarketCap?: number | null
}

export function AdvancedInputs({
  rows,
  onChange,
  currency = 'USD',
  currentMarketCap = null,
}: Props) {
  const currentYear = new Date().getFullYear()
  const sorted = sortYearProjections(rows)

  /** Track which year cards are expanded; default = latest row open */
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const ordered = sortYearProjections(rows)
    const last = ordered[ordered.length - 1]
    return last ? { [last.id]: true } : {}
  })

  const rowIds = sorted.map((r) => r.id).join('|')

  // Keep expansion map in sync only when years are added/removed
  useEffect(() => {
    const ids = rowIds ? rowIds.split('|') : []
    setExpanded((prev) => {
      let changed = false
      const next: Record<string, boolean> = {}
      for (const id of ids) {
        if (id in prev) {
          next[id] = prev[id]
        } else {
          next[id] = true // newly added year opens expanded
          changed = true
        }
      }
      for (const id of Object.keys(prev)) {
        if (!(id in next)) changed = true
      }
      return changed ? next : prev
    })
  }, [rowIds])

  function commit(next: YearProjection[]) {
    onChange(sortYearProjections(next))
  }

  function updateRow(id: string, patch: Partial<YearProjection>) {
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    commit(rows.filter((r) => r.id !== id))
  }

  function addRow() {
    const last = sorted.length ? sorted[sorted.length - 1] : null
    const nextYear = last ? last.year + 1 : currentYear + 5
    commit([...rows, newYearProjection(nextYear, last?.dilutionFactor ?? 1)])
  }

  const cagrGaps = advancedCagrGapYears(rows, currentMarketCap, currentYear)
  const cumulativeByYear = cumulativeDilutionByYear(sorted, currentYear)

  function fillIntermediateYears() {
    if (cagrGaps.length === 0) return
    commit(materializeAdvancedCagrYears(rows, currentMarketCap, currentYear))
  }

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-2">
      {sorted.length === 0 ? (
        <p className="py-1 text-xs text-white/40">No advanced years yet.</p>
      ) : null}
      {sorted.map((row) => {
        const isOpen = expanded[row.id] ?? false
        const yearly = normalizeDilution(row.dilutionFactor)
        const cumulative = cumulativeByYear.get(row.year) ?? yearly
        return (
          <div key={row.id} className="border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => toggle(row.id)}
                className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                aria-expanded={isOpen}
              >
                <span
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-white/40 transition-transform ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                  aria-hidden
                >
                  ▸
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium tabular-nums text-white/90">{row.year}</span>
                  {!isOpen && (
                    <CollapsedOverview
                      row={row}
                      yearly={yearly}
                      cumulative={cumulative}
                      currency={currency}
                    />
                  )}
                </div>
              </button>
              <button
                type="button"
                className="btn-ghost shrink-0 !px-2 !py-1 !text-xs text-white/35 hover:text-red-300"
                onClick={() => removeRow(row.id)}
                title="Remove this year"
              >
                ×
              </button>
            </div>

            {isOpen ? (
              <div className="mt-2 space-y-2 pl-5">
                <div className="grid items-start gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                  <NumberInput
                    label="Year"
                    value={row.year}
                    min={currentYear}
                    step="1"
                    commitOnBlur
                    onChange={(year) =>
                      updateRow(row.id, {
                        year:
                          year != null && Number.isFinite(year)
                            ? Math.floor(year)
                            : currentYear + 5,
                      })
                    }
                  />
                  <div>
                    <NumberInput
                      label="Dilution this year"
                      value={row.dilutionFactor}
                      min={0.0001}
                      step="0.01"
                      placeholder="1.0"
                      commitOnBlur
                      onChange={(dilutionFactor) =>
                        updateRow(row.id, {
                          dilutionFactor:
                            dilutionFactor != null && dilutionFactor > 0 ? dilutionFactor : 1,
                        })
                      }
                    />
                    <p className="mt-0.5 text-[11px] text-white/35">
                      {dilutionHint(yearly, cumulative)}
                    </p>
                  </div>
                </div>

                <BasisBlock
                  title="P/S"
                  accent="text-sky-300"
                  left={
                    <MoneyInput
                      label="Revenue"
                      value={row.revenue}
                      onChange={(revenue) => updateRow(row.id, { revenue })}
                      placeholder="e.g. 400B"
                      currency={currency}
                      hideHint
                    />
                  }
                  right={
                    <NumberInput
                      label="Multiple"
                      value={row.psMultiple}
                      onChange={(psMultiple) => updateRow(row.id, { psMultiple })}
                      placeholder="e.g. 8"
                      min={0}
                      commitOnBlur
                    />
                  }
                />

                <BasisBlock
                  title="P/FCF"
                  accent="text-violet-300"
                  left={
                    <MoneyInput
                      label="Free cash flow"
                      value={row.fcf}
                      onChange={(fcf) => updateRow(row.id, { fcf })}
                      placeholder="e.g. 100B"
                      currency={currency}
                      hideHint
                    />
                  }
                  right={
                    <NumberInput
                      label="Multiple"
                      value={row.pfcfMultiple}
                      onChange={(pfcfMultiple) => updateRow(row.id, { pfcfMultiple })}
                      placeholder="e.g. 25"
                      min={0}
                      commitOnBlur
                    />
                  }
                />

                <BasisBlock
                  title="P/E"
                  accent="text-amber-300"
                  left={
                    <MoneyInput
                      label="Earnings"
                      value={row.profit}
                      onChange={(profit) => updateRow(row.id, { profit })}
                      placeholder="e.g. 90B"
                      currency={currency}
                      hideHint
                    />
                  }
                  right={
                    <NumberInput
                      label="Multiple"
                      value={row.peMultiple}
                      onChange={(peMultiple) => updateRow(row.id, { peMultiple })}
                      placeholder="e.g. 30"
                      min={0}
                      commitOnBlur
                    />
                  }
                />
              </div>
            ) : null}
          </div>
        )
      })}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addRow}>
          + Year
        </button>
        <button
          type="button"
          className="btn-ghost !py-1 !text-xs"
          onClick={fillIntermediateYears}
          disabled={cagrGaps.length === 0}
          title="Fills missing years using implied CAGR from today / between stated years"
        >
          Fill in years
        </button>
      </div>
    </div>
  )
}

function dilutionHint(yearly: number, cumulative: number): string {
  if (!Number.isFinite(yearly) || yearly <= 0) return '1.0 = no extra shares this year'
  const yPct = (yearly - 1) * 100
  const ySign = yPct > 0 ? '+' : ''
  if (Math.abs(yearly - 1) < 1e-9 && Math.abs(cumulative - 1) < 1e-9) {
    return '1.0 = no extra shares this year'
  }
  if (Math.abs(yearly - 1) < 1e-9) {
    return `No extra this year · still ${cumulative.toFixed(2)}× vs today`
  }
  return `${ySign}${yPct.toFixed(1)}% this year · ${cumulative.toFixed(2)}× vs today`
}

function CollapsedOverview({
  row,
  yearly,
  cumulative,
  currency,
}: {
  row: YearProjection
  yearly: number
  cumulative: number
  currency: string
}) {
  const chips: { key: string; label: string; detail: string; accent: string }[] = []

  if (Math.abs(yearly - 1) >= 1e-9 || Math.abs(cumulative - 1) >= 1e-9) {
    const pct = (yearly - 1) * 100
    const detail =
      Math.abs(yearly - 1) < 1e-9
        ? `no extra this year · ${cumulative.toFixed(2)}× vs today`
        : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% this year · ${cumulative.toFixed(2)}× vs today`
    chips.push({
      key: 'dilution',
      label: 'Dilution',
      detail,
      accent: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    })
  }

  if (row.revenue != null && row.psMultiple != null) {
    chips.push({
      key: 'ps',
      label: 'P/S',
      detail: `${formatMoney(row.revenue, currency)} × ${formatMultiple(row.psMultiple)} → ${formatMoney(row.revenue * row.psMultiple, currency)}`,
      accent: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    })
  } else if (row.revenue != null || row.psMultiple != null) {
    chips.push({
      key: 'ps',
      label: 'P/S',
      detail: partialLabel(
        row.revenue != null ? `rev ${formatMoney(row.revenue, currency)}` : null,
        row.psMultiple != null ? `${formatMultiple(row.psMultiple)}` : null,
      ),
      accent: 'border-white/10 bg-white/5 text-white/50',
    })
  }

  if (row.fcf != null && row.pfcfMultiple != null) {
    chips.push({
      key: 'pfcf',
      label: 'P/FCF',
      detail: `${formatMoney(row.fcf, currency)} × ${formatMultiple(row.pfcfMultiple)} → ${formatMoney(row.fcf * row.pfcfMultiple, currency)}`,
      accent: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
    })
  } else if (row.fcf != null || row.pfcfMultiple != null) {
    chips.push({
      key: 'pfcf',
      label: 'P/FCF',
      detail: partialLabel(
        row.fcf != null ? `fcf ${formatMoney(row.fcf, currency)}` : null,
        row.pfcfMultiple != null ? `${formatMultiple(row.pfcfMultiple)}` : null,
      ),
      accent: 'border-white/10 bg-white/5 text-white/50',
    })
  }

  if (row.profit != null && row.peMultiple != null) {
    chips.push({
      key: 'pe',
      label: 'P/E',
      detail: `${formatMoney(row.profit, currency)} × ${formatMultiple(row.peMultiple)} → ${formatMoney(row.profit * row.peMultiple, currency)}`,
      accent: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    })
  } else if (row.profit != null || row.peMultiple != null) {
    chips.push({
      key: 'pe',
      label: 'P/E',
      detail: partialLabel(
        row.profit != null ? `earn ${formatMoney(row.profit, currency)}` : null,
        row.peMultiple != null ? `${formatMultiple(row.peMultiple)}` : null,
      ),
      accent: 'border-white/10 bg-white/5 text-white/50',
    })
  }

  if (chips.length === 0 || (chips.length === 1 && chips[0].key === 'dilution')) {
    const onlyDilution = chips.length === 1 && chips[0].key === 'dilution'
    return (
      <div className="mt-1.5 space-y-1">
        {onlyDilution && (
          <div className="flex flex-wrap gap-1.5">
            <span
              className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] leading-snug ${chips[0].accent}`}
            >
              <span className="shrink-0 font-semibold">{chips[0].label}</span>
              <span className="truncate opacity-90">{chips[0].detail}</span>
            </span>
          </div>
        )}
        <p className="text-xs text-white/35">
          {onlyDilution ? 'No valuation bases yet — expand to edit' : 'Not configured yet — expand to edit'}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] leading-snug ${chip.accent}`}
        >
          <span className="shrink-0 font-semibold">{chip.label}</span>
          <span className="truncate opacity-90">{chip.detail}</span>
        </span>
      ))}
    </div>
  )
}

function partialLabel(...parts: (string | null)[]): string {
  return parts.filter(Boolean).join(' · ') + ' (incomplete)'
}

function BasisBlock({
  title,
  accent,
  left,
  right,
}: {
  title: string
  accent: string
  left: ReactNode
  right: ReactNode
}) {
  return (
    <div>
      <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${accent}`}>
        {title}
      </div>
      <div className="grid items-end gap-2 sm:grid-cols-2">
        {left}
        {right}
      </div>
    </div>
  )
}

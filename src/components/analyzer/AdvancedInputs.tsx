import { useEffect, useState, type ReactNode } from 'react'
import type { YearProjection } from '../../types'
import {
  advancedCagrGapYears,
  equityValueAfterDilution,
  materializeAdvancedCagrYears,
  newYearProjection,
  sortYearProjections,
} from '../../lib/valuation'
import { impliedSharePrice } from '../../lib/sharePrice'
import { MoneyInput, NumberInput } from '../common/MoneyInput'
import { formatMoney, formatMultiple, formatPrice } from '../../lib/format'

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
  sharesOutstanding = null,
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

  function fillIntermediateYears() {
    if (cagrGaps.length === 0) return
    commit(materializeAdvancedCagrYears(rows, currentMarketCap, currentYear))
  }

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <p className="py-2 text-center text-xs text-white/40">No advanced years yet.</p>
      ) : null}
      {sorted.map((row, index) => {
        const isOpen = expanded[row.id] ?? false
        return (
          <div
            key={row.id}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] transition-colors"
          >
            <div className="flex items-start gap-2 p-3">
              <button
                type="button"
                onClick={() => toggle(row.id)}
                className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left transition hover:bg-white/[0.03] -m-1 p-1"
                aria-expanded={isOpen}
              >
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs text-white/70 transition-transform ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                  aria-hidden
                >
                  ▸
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-white/90">{row.year}</span>
                    <span className="text-xs text-white/40">Year projection {index + 1}</span>
                  </div>
                  {!isOpen && <CollapsedOverview row={row} currency={currency} />}
                </div>
              </button>

              <button
                type="button"
                className="btn-ghost shrink-0 !py-1 !text-xs text-white/45 hover:text-red-300"
                onClick={() => removeRow(row.id)}
                title="Remove this year"
              >
                Remove
              </button>
            </div>

            {isOpen && (
              <div className="space-y-3 border-t border-white/5 px-3 pb-3 pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
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
                      label="Share dilution factor"
                      value={row.dilutionFactor}
                      min={0.0001}
                      step="0.01"
                      placeholder="1.0"
                      onChange={(dilutionFactor) =>
                        updateRow(row.id, {
                          dilutionFactor:
                            dilutionFactor != null && dilutionFactor > 0 ? dilutionFactor : 1,
                        })
                      }
                    />
                    <p className="mt-1 text-[11px] text-white/35">
                      {dilutionHint(row.dilutionFactor)}
                    </p>
                  </div>
                </div>

                <BasisBlock
                  title="P/S — Price / Sales"
                  accent="text-sky-300"
                  left={
                    <MoneyInput
                      label="Revenue"
                      value={row.revenue}
                      onChange={(revenue) => updateRow(row.id, { revenue })}
                      placeholder="e.g. 400B"
                      currency={currency}
                    />
                  }
                  right={
                    <NumberInput
                      label="P/S multiple"
                      value={row.psMultiple}
                      onChange={(psMultiple) => updateRow(row.id, { psMultiple })}
                      placeholder="e.g. 8"
                      min={0}
                    />
                  }
                  implied={formatImplied(
                    row.revenue != null && row.psMultiple != null
                      ? row.revenue * row.psMultiple
                      : null,
                    row.dilutionFactor,
                    sharesOutstanding,
                    currency,
                  )}
                />

                <BasisBlock
                  title="P/FCF — Price / Free cash flow"
                  accent="text-violet-300"
                  left={
                    <MoneyInput
                      label="Free cash flow"
                      value={row.fcf}
                      onChange={(fcf) => updateRow(row.id, { fcf })}
                      placeholder="e.g. 100B"
                      currency={currency}
                    />
                  }
                  right={
                    <NumberInput
                      label="P/FCF multiple"
                      value={row.pfcfMultiple}
                      onChange={(pfcfMultiple) => updateRow(row.id, { pfcfMultiple })}
                      placeholder="e.g. 25"
                      min={0}
                    />
                  }
                  implied={formatImplied(
                    row.fcf != null && row.pfcfMultiple != null
                      ? row.fcf * row.pfcfMultiple
                      : null,
                    row.dilutionFactor,
                    sharesOutstanding,
                    currency,
                  )}
                />

                <BasisBlock
                  title="P/E — Price / Earnings"
                  accent="text-amber-300"
                  left={
                    <MoneyInput
                      label="Net profit (earnings)"
                      value={row.profit}
                      onChange={(profit) => updateRow(row.id, { profit })}
                      placeholder="e.g. 90B"
                      currency={currency}
                    />
                  }
                  right={
                    <NumberInput
                      label="P/E multiple"
                      value={row.peMultiple}
                      onChange={(peMultiple) => updateRow(row.id, { peMultiple })}
                      placeholder="e.g. 30"
                      min={0}
                    />
                  }
                  implied={formatImplied(
                    row.profit != null && row.peMultiple != null
                      ? row.profit * row.peMultiple
                      : null,
                    row.dilutionFactor,
                    sharesOutstanding,
                    currency,
                  )}
                />
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-ghost flex-1" onClick={addRow}>
          + Add year
        </button>
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={fillIntermediateYears}
          disabled={cagrGaps.length === 0}
          title={
            cagrGaps.length === 0
              ? 'Need a fillable future year (and today’s mcap, or a second year) with a multi-year gap'
              : `Create ${cagrGaps.length} intermediate year${cagrGaps.length === 1 ? '' : 's'} via implied CAGR from today / between years`
          }
        >
          {cagrGaps.length === 0
            ? 'Fill intermediate years (CAGR)'
            : `Fill ${cagrGaps.length} intermediate year${cagrGaps.length === 1 ? '' : 's'} (CAGR)`}
        </button>
      </div>
    </div>
  )
}

function dilutionHint(factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return '1.0 = no dilution'
  if (Math.abs(factor - 1) < 1e-9) return 'No dilution — ROI uses full mcap growth'
  const pct = (factor - 1) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}% share count vs today · equity ROI ÷ ${factor.toFixed(2)}`
}

function formatImplied(
  mcap: number | null,
  dilutionFactor: number,
  sharesOutstanding: number | null,
  currency: string,
): string | null {
  if (mcap == null || mcap <= 0) return null
  const equity = equityValueAfterDilution(mcap, dilutionFactor)
  const px = impliedSharePrice(equity, sharesOutstanding)
  const mcapStr = formatMoney(mcap, currency)
  if (px != null) {
    return `${mcapStr} mcap · ${formatPrice(px, currency)} /sh`
  }
  return mcapStr
}

function CollapsedOverview({ row, currency }: { row: YearProjection; currency: string }) {
  const chips: { key: string; label: string; detail: string; accent: string }[] = []
  const dilution = row.dilutionFactor > 0 ? row.dilutionFactor : 1

  if (Math.abs(dilution - 1) >= 1e-9) {
    const pct = (dilution - 1) * 100
    chips.push({
      key: 'dilution',
      label: 'Dilution',
      detail: `${dilution.toFixed(2)}× shares (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`,
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
  implied,
}: {
  title: string
  accent: string
  left: ReactNode
  right: ReactNode
  implied: string | null
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className={`mb-2 text-xs font-semibold ${accent}`}>{title}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {left}
        {right}
      </div>
      {implied && (
        <p className="mt-2 text-xs text-white/45">
          Implied market cap: <span className="font-medium text-white/80">{implied}</span>
        </p>
      )}
    </div>
  )
}

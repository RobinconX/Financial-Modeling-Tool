import { useEffect, useMemo, useState } from 'react'
import type {
  CashflowLine,
  DisplayCurrency,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import { formatMoney, parseMoney } from '../../lib/format'
import { amountToDisplay, toDisplay } from '../../lib/fx'
import {
  buildGoalSpeedTable,
  formatGoalSpeedDate,
  formatGoalSpeedDuration,
  formatGoalSpeedDurationExact,
  formatGoalSpeedExtras,
  formatGoalSpeedRelEffect,
  goalSpeedBlockReason,
  goalSpeedBreakdown,
  splitMonths,
  type GoalSpeedBreakdownStep,
  type GoalSpeedTableRow,
} from '../../lib/goalSpeed'
import {
  portfolioNowUsd,
  statedGoalSpeedContributions,
  withResolvedDepositAmounts,
} from '../../lib/portfolio'
import { InfoTip } from '../common/InfoTip'
import { formatInputNumber } from '../common/MoneyInput'
import { GoalSpeedChart } from './GoalSpeedChart'

type GoalSpeedState = NonNullable<SavedPortfolio['goalSpeed']>

type Props = {
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  incomeCostLines?: CashflowLine[]
  onChange: (patch: Partial<SavedPortfolio>) => void
}

function convAmount(
  amount: number,
  from: DisplayCurrency,
  to: DisplayCurrency,
  usdToChf: number | null,
): number {
  return amountToDisplay(amount, from, to, usdToChf)
}

export function GoalSpeedPanel({
  portfolio,
  scenarios,
  displayCurrency,
  usdToChf,
  incomeCostLines = [],
  onChange,
}: Props) {
  const today = useMemo(() => new Date(), [])
  const currentYear = today.getFullYear()
  const stored = portfolio.goalSpeed ?? null
  const fromCur: DisplayCurrency = stored?.currency ?? displayCurrency

  const nowUsd = useMemo(
    () => portfolioNowUsd(portfolio, scenarios, currentYear),
    [portfolio, scenarios, currentYear],
  )
  const nowDisplay = toDisplay(nowUsd, displayCurrency, usdToChf)

  const goalDisplay =
    stored && stored.goalAmount > 0
      ? convAmount(stored.goalAmount, fromCur, displayCurrency, usdToChf)
      : 0
  const customDisplay =
    stored?.customStart != null
      ? convAmount(stored.customStart, fromCur, displayCurrency, usdToChf)
      : null
  const extrasMode: 'stated' | 'custom' =
    stored?.extrasMode === 'stated' || stored?.extrasMode === 'custom'
      ? stored.extrasMode
      : (stored?.extras?.length ?? 0) > 0
        ? 'custom'
        : 'stated'

  const customExtras = useMemo(
    () =>
      (stored?.extras ?? []).map((e) => ({
        ...e,
        amount: convAmount(e.amount, fromCur, displayCurrency, usdToChf),
      })),
    [stored?.extras, fromCur, displayCurrency, usdToChf],
  )

  const statedExtras = useMemo(() => {
    const resolved = withResolvedDepositAmounts(portfolio, {
      incomeCostLines,
      usdToChf,
    })
    return statedGoalSpeedContributions(resolved, currentYear).map((e) => ({
      id: `stated-${e.year}`,
      year: e.year,
      amount: toDisplay(e.amount, displayCurrency, usdToChf),
    }))
  }, [portfolio, incomeCostLines, usdToChf, currentYear, displayCurrency])

  const extras = extrasMode === 'stated' ? statedExtras : customExtras

  const perpetual = portfolio.perpetualGrowthPercent
  const ratePercent =
    stored?.ratePercent != null && Number.isFinite(stored.ratePercent)
      ? stored.ratePercent
      : perpetual != null && Number.isFinite(perpetual) && perpetual !== 0
        ? perpetual
        : null
  const usingPortfolioRate = stored?.ratePercent == null

  const start = customDisplay != null ? customDisplay : nowDisplay
  const usingCustom = customDisplay != null

  const [goalDraft, setGoalDraft] = useState('')
  const [rateDraft, setRateDraft] = useState('')
  const [startDraft, setStartDraft] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => {
    setGoalDraft(goalDisplay > 0 ? formatInputNumber(goalDisplay, 2) : '')
  }, [portfolio.id, goalDisplay])

  useEffect(() => {
    setRateDraft(ratePercent != null ? formatInputNumber(ratePercent, 4) : '')
  }, [portfolio.id, ratePercent])

  useEffect(() => {
    setStartDraft(
      customDisplay != null ? formatInputNumber(customDisplay, 2) : '',
    )
  }, [portfolio.id, customDisplay])

  function persist(patch: Partial<GoalSpeedState>) {
    const nextExtras = [...(patch.extras ?? customExtras)].sort(
      (a, b) => a.year - b.year || a.id.localeCompare(b.id),
    )
    const next: GoalSpeedState = {
      goalAmount: patch.goalAmount ?? (goalDisplay > 0 ? goalDisplay : 0),
      currency: displayCurrency,
      ratePercent:
        patch.ratePercent !== undefined ? patch.ratePercent : (stored?.ratePercent ?? null),
      customStart:
        patch.customStart !== undefined ? patch.customStart : customDisplay,
      extrasMode: patch.extrasMode ?? extrasMode,
      extras: nextExtras,
    }
    onChange({ goalSpeed: next })
  }

  function commitGoal(raw: string) {
    const parsed = parseMoney(raw.trim())
    if (parsed == null || !(parsed > 0)) {
      persist({ goalAmount: 0 })
      setGoalDraft('')
      return
    }
    persist({ goalAmount: parsed })
    setGoalDraft(formatInputNumber(parsed, 2))
  }

  function commitRate(raw: string) {
    const trimmed = raw.trim().replace(/%/g, '')
    if (!trimmed) {
      persist({ ratePercent: null })
      setRateDraft(
        perpetual != null && perpetual !== 0 ? formatInputNumber(perpetual, 4) : '',
      )
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      setRateDraft(ratePercent != null ? formatInputNumber(ratePercent, 4) : '')
      return
    }
    persist({ ratePercent: n })
    setRateDraft(formatInputNumber(n, 4))
  }

  function commitCustomStart(raw: string) {
    const parsed = parseMoney(raw.trim())
    if (parsed == null || !(parsed > 0)) {
      persist({ customStart: null })
      setStartDraft('')
      return
    }
    persist({ customStart: parsed })
    setStartDraft(formatInputNumber(parsed, 2))
  }

  function setExtrasMode(mode: 'stated' | 'custom') {
    if (mode === extrasMode) return
    if (mode === 'custom' && customExtras.length === 0 && statedExtras.length > 0) {
      persist({
        extrasMode: 'custom',
        extras: statedExtras.map((e) => ({
          ...e,
          id: crypto.randomUUID(),
        })),
      })
      return
    }
    persist({ extrasMode: mode })
  }

  function addExtra() {
    const last = customExtras[customExtras.length - 1]
    const used = new Set(customExtras.map((e) => e.year))
    let year = last ? last.year + 1 : currentYear
    if (year < currentYear) year = currentYear
    while (used.has(year)) year += 1
    persist({
      extras: [
        ...customExtras,
        { id: crypto.randomUUID(), year, amount: last?.amount ?? 0 },
      ],
    })
  }

  function updateExtra(id: string, patch: { year?: number; amount?: number }) {
    persist({
      extras: customExtras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
  }

  function removeExtra(id: string) {
    persist({ extras: customExtras.filter((e) => e.id !== id) })
  }

  const block = goalSpeedBlockReason({
    start,
    goal: goalDisplay,
    ratePercent,
    extrasCount: extras.filter((e) => e.amount > 0).length,
  })

  const rows = useMemo(() => {
    if (block || ratePercent == null) return []
    return buildGoalSpeedTable({
      start,
      goal: goalDisplay,
      ratePercent,
      extras: extras.filter((e) => e.amount > 0 && e.year >= currentYear),
      today,
    })
  }, [block, start, goalDisplay, ratePercent, extras, today, currentYear])

  const base = rows[0]
  const last = rows.length > 1 ? rows[rows.length - 1] : null
  const vsBaseDur =
    base?.hit.reached && last?.hit.reached && last.key !== 'base'
      ? splitMonths(base.hit.duration.totalMonths - last.hit.duration.totalMonths)
      : null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        <h3 className="section-title">Contribution effectiveness</h3>
        <InfoTip label="About contribution effectiveness">
          How much sooner extra contributions get you to a wealth goal. Base is
          today&apos;s book (Now) with no planned future deposits. Stated mode
          copies planned deposits from the Cash tab (read-only here). Custom mode
          is a local what-if and never writes back. Contributions land at year-end
          and start compounding the year after. Relative effectiveness is exact
          time saved per unit vs the last contribution year (last year is 1.00×).
        </InfoTip>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Goal</label>
          <div className="relative">
            <input
              className="input !pr-12 tabular-nums"
              inputMode="decimal"
              value={goalDraft}
              placeholder="e.g. 1M"
              onChange={(e) => setGoalDraft(e.target.value)}
              onBlur={() => commitGoal(goalDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-white/35">
              {displayCurrency}
            </span>
          </div>
        </div>
        <div>
          <label className="label">Compounding rate</label>
          <div className="relative">
            <input
              className="input !pr-7 tabular-nums"
              inputMode="decimal"
              value={rateDraft}
              placeholder="e.g. 7"
              onChange={(e) => setRateDraft(e.target.value)}
              onBlur={() => commitRate(rateDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/35">
              %
            </span>
          </div>
          <p className="mt-1 text-[11px] text-white/40">
            {usingPortfolioRate
              ? 'Using portfolio perpetual growth. Clear to reset.'
              : 'Custom rate. Clear the field to use perpetual growth.'}
          </p>
        </div>
        <div>
          <label className="label">Start</label>
          <div className="mb-1.5 flex gap-1 border-b border-white/10" role="group" aria-label="Start amount">
            <button
              type="button"
              className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                !usingCustom
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
              onClick={() => persist({ customStart: null })}
            >
              Now
            </button>
            <button
              type="button"
              className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                usingCustom
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
              onClick={() => persist({ customStart: Math.max(0, nowDisplay) })}
            >
              Custom
            </button>
          </div>
          {usingCustom ? (
            <div className="relative">
              <input
                className="input !pr-12 tabular-nums"
                inputMode="decimal"
                value={startDraft}
                onChange={(e) => setStartDraft(e.target.value)}
                onBlur={() => commitCustomStart(startDraft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-white/35">
                {displayCurrency}
              </span>
            </div>
          ) : (
            <p className="py-2 text-sm tabular-nums text-white/80">
              {formatMoney(nowDisplay, displayCurrency)}
              <span className="ml-1.5 text-[11px] text-white/40">live book, no future deposits</span>
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Contributions (year-end)
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex gap-1 border-b border-white/10"
              role="group"
              aria-label="Contribution source"
            >
              <button
                type="button"
                className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                  extrasMode === 'stated'
                    ? 'border-emerald-400 text-white'
                    : 'border-transparent text-white/50 hover:text-white/80'
                }`}
                onClick={() => setExtrasMode('stated')}
              >
                Stated
              </button>
              <button
                type="button"
                className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                  extrasMode === 'custom'
                    ? 'border-emerald-400 text-white'
                    : 'border-transparent text-white/50 hover:text-white/80'
                }`}
                onClick={() => setExtrasMode('custom')}
              >
                Custom
              </button>
            </div>
            {extrasMode === 'custom' && (
              <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addExtra}>
                + Add year
              </button>
            )}
          </div>
        </div>
        {extrasMode === 'stated' && (
          <p className="text-[11px] text-white/40">
            Planned deposits from the Cash tab. This view does not change them.
          </p>
        )}
        {extras.length === 0 ? (
          <p className="text-[12px] text-white/40">
            {extrasMode === 'stated'
              ? 'No planned Cash-tab deposits from this year on.'
              : 'Optional. Add a year to see how much sooner contributions get you to the goal.'}
          </p>
        ) : extrasMode === 'stated' ? (
          <div className="space-y-1.5">
            <div className="hidden grid-cols-[5.5rem_minmax(0,1fr)] gap-2 px-0.5 text-[10px] uppercase tracking-wider text-white/40 sm:grid">
              <span>Year</span>
              <span>Amount ({displayCurrency})</span>
            </div>
            {extras.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-sm tabular-nums text-white/80"
              >
                <span>{e.year}</span>
                <span>{formatMoney(e.amount, displayCurrency)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="hidden grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-2 px-0.5 text-[10px] uppercase tracking-wider text-white/40 sm:grid">
              <span>Year</span>
              <span>Amount ({displayCurrency})</span>
              <span />
            </div>
            {extras.map((e) => (
              <ContributionRow
                key={e.id}
                year={e.year}
                amount={e.amount}
                currency={displayCurrency}
                minYear={currentYear}
                onYear={(year) => updateExtra(e.id, { year })}
                onAmount={(amount) => updateExtra(e.id, { amount })}
                onRemove={() => removeExtra(e.id)}
              />
            ))}
          </div>
        )}
      </div>

      {block ? (
        <p className="text-sm text-white/45">{block}</p>
      ) : (
        <>
          {base?.hit.reached && last?.hit.reached && vsBaseDur && vsBaseDur.totalMonths !== 0 ? (
            <p className="text-sm text-emerald-300/90">
              Contributions get you there{' '}
              <span className="font-semibold">{formatGoalSpeedDuration(vsBaseDur)}</span>{' '}
              sooner ({formatGoalSpeedDuration(last.hit.duration)} vs{' '}
              {formatGoalSpeedDuration(base.hit.duration)}).
            </p>
          ) : !base?.hit.reached && last?.hit.reached ? (
            <p className="text-sm text-emerald-300/90">
              Base does not reach the goal; contributions do in{' '}
              {formatGoalSpeedDuration(last.hit.duration)}.
            </p>
          ) : base?.hit.reached ? (
            <p className="text-sm text-white/70">
              Base reaches in {formatGoalSpeedDuration(base.hit.duration)}
              {base.hit.already ? ' (already there).' : ` (${formatGoalSpeedDate(base.hit.date)}).`}
            </p>
          ) : (
            <p className="text-sm text-white/45">Does not reach within 80 years.</p>
          )}

          <div className="table-shell">
            <table className="min-w-[32rem] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-white/40">
                  <th className="py-1.5 pr-3 font-medium">Path</th>
                  <th className="py-1.5 pr-3 font-medium">
                    Contributions{' '}
                    <span className="font-normal normal-case tracking-normal text-white/35">
                      {displayCurrency}
                    </span>
                  </th>
                  <th className="py-1.5 pr-3 font-medium">Goal date</th>
                  <th className="py-1.5 pr-3 font-medium">Time from today</th>
                  <th className="py-1.5 pr-3 font-medium">Faster than previous</th>
                  <th className="relative z-20 py-1.5 font-medium">
                    <span className="inline-flex items-center gap-1">
                      Rel. effect.
                      <InfoTip label="Relative effectiveness" align="end" side="bottom">
                        Exact time saved per {displayCurrency} this year, divided
                        by exact time saved per {displayCurrency} in the last
                        contribution year. The last year is 1.00×.
                      </InfoTip>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const open = openKey === row.key
                  return (
                    <RowWithBreakdown
                      key={row.key}
                      row={row}
                      open={open}
                      currency={displayCurrency}
                      ratePercent={ratePercent ?? 0}
                      start={start}
                      goal={goalDisplay}
                      today={today}
                      onToggle={() => setOpenKey(open ? null : row.key)}
                    />
                  )
                })}
              </tbody>
            </table>
            <p className="mt-1.5 text-[11px] text-white/35">Click a row for the year-by-year math.</p>
          </div>

          <GoalSpeedChart
            rows={rows}
            goal={goalDisplay}
            currency={displayCurrency}
            today={today}
          />
        </>
      )}
    </div>
  )
}

function ContributionRow({
  year,
  amount,
  currency,
  minYear,
  onYear,
  onAmount,
  onRemove,
}: {
  year: number
  amount: number
  currency: DisplayCurrency
  minYear: number
  onYear: (year: number) => void
  onAmount: (amount: number) => void
  onRemove: () => void
}) {
  const [yearText, setYearText] = useState(String(year))
  const [amountText, setAmountText] = useState(
    amount > 0 ? formatInputNumber(amount, 2) : '',
  )

  useEffect(() => {
    setYearText(String(year))
  }, [year])

  useEffect(() => {
    setAmountText(amount > 0 ? formatInputNumber(amount, 2) : '')
  }, [amount])

  function commitYear(raw: string) {
    const n = Math.floor(Number(raw))
    if (!Number.isFinite(n) || n < 1000 || n > 9999) {
      setYearText(String(year))
      return
    }
    onYear(n)
    setYearText(String(n))
  }

  function commitAmount(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      onAmount(0)
      setAmountText('')
      return
    }
    const parsed = parseMoney(trimmed)
    if (parsed == null || parsed < 0) {
      setAmountText(amount > 0 ? formatInputNumber(amount, 2) : '')
      return
    }
    onAmount(parsed)
    setAmountText(parsed > 0 ? formatInputNumber(parsed, 2) : '')
  }

  const pastYear = year < minYear

  return (
    <div className="space-y-1">
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-2">
      <input
        className={`input !py-1.5 tabular-nums ${
          pastYear ? '!border-amber-400/50 focus:!border-amber-400/70' : ''
        }`}
        inputMode="numeric"
        value={yearText}
        onChange={(e) => setYearText(e.target.value)}
        onBlur={() => commitYear(yearText)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        aria-label="Year"
        aria-invalid={pastYear}
      />
      <div className="relative">
        <input
          className="input !py-1.5 !pr-12 tabular-nums"
          inputMode="decimal"
          value={amountText}
          placeholder="0"
          onChange={(e) => setAmountText(e.target.value)}
          onBlur={() => commitAmount(amountText)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label="Contribution amount"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-white/35">
          {currency}
        </span>
      </div>
      <button
        type="button"
        className="rounded px-1.5 text-white/35 hover:bg-red-500/20 hover:text-red-300"
        title="Remove"
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
    {pastYear && (
      <p className="text-[11px] text-amber-300/90">
        {year} is before this year. Contributions only count from {minYear} on.
      </p>
    )}
    </div>
  )
}

function RowWithBreakdown({
  row,
  open,
  currency,
  ratePercent,
  start,
  goal,
  today,
  onToggle,
}: {
  row: GoalSpeedTableRow
  open: boolean
  currency: DisplayCurrency
  ratePercent: number
  start: number
  goal: number
  today: Date
  onToggle: () => void
}) {
  const steps = useMemo(() => {
    if (!open) return []
    return goalSpeedBreakdown({
      start,
      goal,
      ratePercent,
      extras: row.extrasIncluded,
      today,
    })
  }, [open, start, goal, ratePercent, row.extrasIncluded, today])

  return (
    <>
      <tr
        className={`cursor-pointer border-t border-white/10 hover:bg-white/[0.04] ${
          open ? 'bg-white/[0.04]' : ''
        }`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        tabIndex={0}
        aria-expanded={open}
      >
        <td className="py-1.5 pr-3 font-medium text-white/85">
          <span className="mr-1.5 inline-block w-3 text-[10px] text-white/35" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          {row.label}
        </td>
        <td className="py-1.5 pr-3 tabular-nums text-white/60">
          {formatGoalSpeedExtras(row.extrasIncluded)}
        </td>
        <td className="py-1.5 pr-3 tabular-nums text-white/80">
          {row.hit.reached ? formatGoalSpeedDate(row.hit.date) : 'Does not reach'}
        </td>
        <td className="py-1.5 pr-3 tabular-nums text-white/80">
          {row.hit.reached ? formatGoalSpeedDuration(row.hit.duration) : '—'}
        </td>
        <td
          className="cursor-help py-1.5 pr-3 tabular-nums text-emerald-300/90"
          title={
            row.fasterThanPreviousExact != null
              ? formatGoalSpeedDurationExact(row.fasterThanPreviousExact)
              : undefined
          }
        >
          {row.nowReaches
            ? 'Now reaches'
            : row.fasterThanPrevious
              ? formatGoalSpeedDuration(row.fasterThanPrevious)
              : '—'}
        </td>
        <td className="py-1.5 tabular-nums text-white/80">
          {formatGoalSpeedRelEffect(row.relativeEffectiveness)}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-white/5">
          <td colSpan={6} className="px-1 pb-3 pt-1">
            <BreakdownTable
              steps={steps}
              currency={currency}
              ratePercent={ratePercent}
              reached={row.hit.reached}
            />
          </td>
        </tr>
      )}
    </>
  )
}

const BREAKDOWN_MAX = 24

function BreakdownTable({
  steps,
  currency,
  ratePercent,
  reached,
}: {
  steps: GoalSpeedBreakdownStep[]
  currency: DisplayCurrency
  ratePercent: number
  reached: boolean
}) {
  const clipped = steps.length > BREAKDOWN_MAX
  const shown = clipped ? steps.slice(0, BREAKDOWN_MAX) : steps
  const money = (n: number | null | undefined) =>
    n == null || !Number.isFinite(n) ? '—' : formatMoney(n, currency)

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Calculation
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/35">
              <th className="py-1 pr-3 text-left font-medium">Year</th>
              <th className="py-1 pr-3 text-right font-medium">Prior</th>
              <th className="py-1 pr-3 text-right font-medium">
                After {ratePercent}%
              </th>
              <th className="py-1 pr-3 text-right font-medium">Contribution</th>
              <th className="py-1 text-right font-medium">End</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s, i) => (
              <tr
                key={`${s.title}-${i}`}
                className={`border-t border-white/[0.06] ${
                  s.hit ? 'text-emerald-300/90' : 'text-white/75'
                }`}
              >
                <td className="py-1 pr-3">
                  {s.title}
                  {s.note ? (
                    <span className="ml-1.5 font-normal text-[10px] text-white/35">
                      {s.note}
                    </span>
                  ) : null}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{money(s.prior)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {s.title === 'Now' || !s.grew ? '—' : money(s.grown)}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {s.contribution > 0 ? money(s.contribution) : '—'}
                </td>
                <td className="py-1 text-right tabular-nums">{money(s.wealth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {clipped && (
        <p className="mt-1.5 text-[11px] text-white/40">
          Showing first {BREAKDOWN_MAX} years
          {reached ? '' : ' — does not reach within 80 years'}.
        </p>
      )}
    </div>
  )
}

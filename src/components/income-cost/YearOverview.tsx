import { formatMoney } from '../../lib/format'
import { INCOME_COST_CURRENCY, type ScenarioTotals } from '../../lib/incomeCost'

type Props = {
  title: string
  totals: ScenarioTotals
}

function Card({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const color =
    tone === 'good'
      ? 'text-emerald-400'
      : tone === 'bad'
        ? 'text-amber-300'
        : 'text-white/90'
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>
        {formatMoney(value, INCOME_COST_CURRENCY)}
      </div>
    </div>
  )
}

export function YearOverview({ title, totals }: Props) {
  const netTone = totals.netYearly >= 0 ? 'good' : 'bad'
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
        Scenario overview · {title}
      </h3>
      <p className="text-[11px] text-white/35">
        All amounts in CHF. Monthly totals use recurring positions only; one-time items count in
        yearly totals.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card label="Costs / month" value={totals.costMonthly} />
        <Card label="Costs / year" value={totals.costYearly} />
        <Card label="Income / month" value={totals.incomeMonthly} />
        <Card label="Income / year" value={totals.incomeYearly} />
        <Card label="Net / month" value={totals.netMonthly} tone={netTone} />
        <Card label="Net / year" value={totals.netYearly} tone={netTone} />
      </div>
      {(totals.costOneTimeYearly > 0 || totals.incomeOneTimeYearly > 0) && (
        <p className="text-[11px] text-white/40">
          One-time · costs {formatMoney(totals.costOneTimeYearly, INCOME_COST_CURRENCY)}
          {' · '}
          income {formatMoney(totals.incomeOneTimeYearly, INCOME_COST_CURRENCY)}
        </p>
      )}
    </div>
  )
}

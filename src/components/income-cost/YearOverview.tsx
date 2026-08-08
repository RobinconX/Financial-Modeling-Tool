import { formatMoney } from '../../lib/format'
import { INCOME_COST_CURRENCY, type ScenarioTotals } from '../../lib/incomeCost'
import { InfoTip } from '../common/InfoTip'

type Props = {
  title: string
  totals: ScenarioTotals
}

function Metric({
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
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">
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
    <div className="panel space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <p className="section-kicker">Summary</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <h3 className="section-title">{title}</h3>
            <InfoTip label="About overview totals">
              Amounts in CHF. Monthly totals use recurring positions only; one-time items count in
              yearly totals.
            </InfoTip>
          </div>
        </div>
      </div>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Costs / month" value={totals.costMonthly} />
        <Metric label="Costs / year" value={totals.costYearly} />
        <Metric label="Income / month" value={totals.incomeMonthly} />
        <Metric label="Income / year" value={totals.incomeYearly} />
        <Metric label="Net / month" value={totals.netMonthly} tone={netTone} />
        <Metric label="Net / year" value={totals.netYearly} tone={netTone} />
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

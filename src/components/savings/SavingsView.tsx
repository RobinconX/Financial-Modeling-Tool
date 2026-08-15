import { useMemo, useState } from 'react'
import { useSavings } from '../../hooks/useSavings'
import { FullscreenChart } from '../common/FullscreenChart'
import { InfoTip } from '../common/InfoTip'
import { SavingsActualsEditor } from './SavingsActualsEditor'
import { SavingsChart } from './SavingsChart'
import { SavingsProjectionTable } from './SavingsProjectionTable'
import { SavingsTable } from './SavingsTable'

type SubTab = 'inputs' | 'actuals' | 'projection'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'actuals', label: 'Actuals' },
  { id: 'projection', label: 'Projection' },
]

export function SavingsView() {
  const {
    accounts,
    total,
    error,
    addAccount,
    removeAccount,
    setActual,
    setContribution,
    setCadence,
    setRate,
    setCompoundUntilYear,
    setContributeUntilYear,
    setName,
    addPastPeriodKey,
    removePastPeriod,
  } = useSavings()

  const [subTab, setSubTab] = useState<SubTab>('inputs')
  const asOf = useMemo(() => new Date(), [])

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div
        className="inline-flex gap-1 border-b border-white/10"
        role="group"
        aria-label="Savings view"
      >
        {SUB_TABS.map((t) => {
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'inputs' && (
        <div className="panel space-y-3">
          <div className="section-header">
            <div className="flex items-center gap-1.5">
              <h3 className="section-title text-sky-300/90">Accounts & compounding</h3>
              <InfoTip label="About savings inputs">
                Current end-of-month balances, contribution cadence, and annual rate (CHF).
                Compounding is always yearly (December → January). Year-end and optional monthly
                history are on Actuals; Projection stays year-end + forward path.
              </InfoTip>
            </div>
          </div>
          <SavingsTable
            accounts={accounts}
            total={total}
            asOf={asOf}
            onName={setName}
            onContribution={setContribution}
            onCadence={setCadence}
            onRate={setRate}
            onCompoundUntil={setCompoundUntilYear}
            onContributeUntil={setContributeUntilYear}
            onActual={setActual}
            onAdd={addAccount}
            onRemove={removeAccount}
          />
        </div>
      )}

      {subTab === 'actuals' && (
        <div className="panel space-y-3">
          <SavingsActualsEditor accounts={accounts} asOf={asOf} onActual={setActual} />
        </div>
      )}

      {subTab === 'projection' && (
        <div className="space-y-5">
          <div className="panel space-y-3">
            <div className="flex items-center gap-1.5">
              <h3 className="section-title">Balance progression</h3>
              <InfoTip label="About balance progression">
                Past columns are year-end (December) only — monthly detail stays on Actuals and
                History. Now is the current month; later columns are projected. Compounding
                applies only December → January.
              </InfoTip>
            </div>
            <SavingsProjectionTable
              accounts={accounts}
              asOf={asOf}
              onActual={setActual}
              onAddPastPeriodKey={addPastPeriodKey}
              onRemovePastPeriod={removePastPeriod}
            />
          </div>

          <div className="panel space-y-3">
            <h3 className="section-title">
              All accounts
              <span className="ml-2 font-normal text-white/40">· stacked</span>
            </h3>
            <FullscreenChart title="Savings · all accounts">
              <SavingsChart accounts={accounts} asOf={asOf} />
            </FullscreenChart>
            <div className="flex flex-wrap gap-3 text-[11px] text-white/40">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-emerald-400/80" /> Year-end actual
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-sky-400/80 ring-1 ring-white/50" /> Now
                (live)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-white/25" /> Projected
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

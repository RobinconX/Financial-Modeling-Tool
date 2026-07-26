import { useMemo, useState } from 'react'
import { useSavings } from '../../hooks/useSavings'
import { FullscreenChart } from '../common/FullscreenChart'
import { SavingsChart } from './SavingsChart'
import { SavingsProjectionTable } from './SavingsProjectionTable'
import { SavingsTable } from './SavingsTable'

type SubTab = 'inputs' | 'projection'

const SUB_TABS: { id: SubTab; label: string; hint: string }[] = [
  {
    id: 'inputs',
    label: 'Inputs',
    hint: 'Accounts, current balances, contributions, and rates',
  },
  {
    id: 'projection',
    label: 'Projection',
    hint: 'Past actuals, progression, and stacked chart',
  },
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

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {SUB_TABS.map((t) => {
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-white text-black shadow'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          )
        })}
        <span className="ml-2 hidden text-xs text-white/35 sm:inline">
          {SUB_TABS.find((t) => t.id === subTab)?.hint}
        </span>
      </div>

      {subTab === 'inputs' ? (
        <div className="card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              Accounts & compounding
            </h3>
            <p className="mt-0.5 text-xs text-white/35">
              Current end-of-month balances, contribution cadence, and annual rate (CHF).
            </p>
          </div>
          <SavingsTable
            accounts={accounts}
            total={total}
            asOf={asOf}
            onName={setName}
            onContribution={setContribution}
            onCadence={setCadence}
            onRate={setRate}
            onActual={setActual}
            onAdd={addAccount}
            onRemove={removeAccount}
          />
        </div>
      ) : (
        <>
          <div className="card p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
                Balance progression
              </h3>
              <p className="mt-0.5 text-xs text-white/35">
                Enter past actuals by month or year-end, then review projections.
              </p>
            </div>
            <SavingsProjectionTable
              accounts={accounts}
              asOf={asOf}
              onActual={setActual}
              onAddPastPeriodKey={addPastPeriodKey}
              onRemovePastPeriod={removePastPeriod}
            />
          </div>

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
              All accounts · stacked
            </h3>
            <FullscreenChart title="Savings · all accounts">
              <SavingsChart accounts={accounts} asOf={asOf} />
            </FullscreenChart>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/40">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-emerald-400/80" /> Actual (past + now)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-white/25" /> Projected
              </span>
              <span className="text-white/30">Monthly or yearly scale · Expand for full view</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

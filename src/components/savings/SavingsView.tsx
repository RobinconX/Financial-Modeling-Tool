import { useEffect, useMemo, useState } from 'react'
import type { SavingsAccount } from '../../types'
import type { SavingsApi } from '../../hooks/useSavings'
import { savingsAccountUsage } from '../../lib/deleteUsage'
import { loadOverview } from '../../lib/overviewStorage'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { DeleteUsageBody } from '../common/DeleteUsageBody'
import { FullscreenChart } from '../common/FullscreenChart'
import { SavingsActualsEditor } from './SavingsActualsEditor'
import { SavingsChart } from './SavingsChart'
import { SavingsProjectionTable } from './SavingsProjectionTable'
import { SavingsTable } from './SavingsTable'
import { FeatureGuideButton } from '../guides/FeatureGuideButton'
import { useGuideTeleport } from '../guides/useGuideTeleport'
import {
  clearActualsFocus,
  readActualsFocus,
  type ActualsFocusRequest,
} from '../../lib/actualsFocus'

type SubTab = 'inputs' | 'actuals' | 'projection'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'actuals', label: 'Actuals' },
  { id: 'projection', label: 'Projection' },
]

export function SavingsView({
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
}: SavingsApi) {

  const [subTab, setSubTab] = useState<SubTab>('inputs')
  const [pendingDelete, setPendingDelete] = useState<SavingsAccount | null>(null)
  const [actualsFocus, setActualsFocus] = useState<ActualsFocusRequest | null>(null)
  const asOf = useMemo(() => new Date(), [])

  useEffect(() => {
    const focus = readActualsFocus()
    if (!focus || focus.tab !== 'savings') return
    clearActualsFocus()
    setSubTab('actuals')
    setActualsFocus(focus)
    const clearTimer = window.setTimeout(() => setActualsFocus(null), 3200)
    return () => window.clearTimeout(clearTimer)
  }, [])

  const pendingSavingsUsage = useMemo(() => {
    if (!pendingDelete) return { refs: [] }
    return savingsAccountUsage(pendingDelete.id, loadOverview().scenarios)
  }, [pendingDelete])

  useGuideTeleport('savings', (view) => {
    if (view === 'inputs' || view === 'actuals' || view === 'projection') setSubTab(view)
  })

  return (
    <div className="space-y-5" data-guide-anchor="savings">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
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
        <FeatureGuideButton id="savings" className="mb-1.5" />
      </div>

      {subTab === 'inputs' && (
        <div className="panel space-y-3" data-guide-anchor="savings.accounts">
          <div className="section-header">
            <div className="flex items-center gap-1.5">
              <h3 className="section-title text-sky-300/90">Accounts & compounding</h3>
              <FeatureGuideButton id="savings.accounts" />
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
            onRemove={(id) => {
              const acc = accounts.find((a) => a.id === id)
              if (acc) setPendingDelete(acc)
            }}
          />
        </div>
      )}

      {subTab === 'actuals' && (
        <div className="panel space-y-3" data-guide-anchor="savings.actuals">
          <SavingsActualsEditor
            accounts={accounts}
            asOf={asOf}
            onActual={setActual}
            focusRequest={actualsFocus}
          />
        </div>
      )}

      {subTab === 'projection' && (
        <div className="space-y-5" data-guide-anchor="savings.progression">
          <div className="panel space-y-3">
            <div className="flex items-center gap-1.5">
              <h3 className="section-title">Balance progression</h3>
              <FeatureGuideButton id="savings.progression" />
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
          </div>
        </div>
      )}
      {pendingDelete ? (
        <ConfirmDialog
          title="Remove savings account"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            removeAccount(pendingDelete.id)
            setPendingDelete(null)
          }}
        >
          <DeleteUsageBody
            usage={pendingSavingsUsage}
            consequence={
              pendingSavingsUsage.refs.length > 0
                ? 'Overview will drop this account from the stack until you add it again.'
                : undefined
            }
          >
            <p>
              <span className="font-semibold text-white">
                {pendingDelete.name.trim() || 'Untitled account'}
              </span>
            </p>
          </DeleteUsageBody>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

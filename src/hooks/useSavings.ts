import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SavingsAccount, SavingsCadence } from '../types'
import {
  ensurePastPeriodKey,
  ensurePermanentCashAccount,
  isPermanentCashAccount,
  newSavingsAccount,
  removePastPeriodKey,
  sortedAccounts,
  totalNow,
} from '../lib/savings'
import { loadSavings, saveSavings, SAVINGS_STORAGE_KEY } from '../lib/savingsStorage'

export function useSavings() {
  const initial = loadSavings()
  const [accounts, setAccounts] = useState<SavingsAccount[]>(() =>
    ensurePermanentCashAccount(initial.accounts),
  )
  const [error, setError] = useState<string | null>(null)
  /** Always-current list so consecutive cell edits stack correctly. */
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts

  const persist = useCallback((next: SavingsAccount[]) => {
    const ensured = ensurePermanentCashAccount(next)
    const result = saveSavings({ version: 1, accounts: ensured })
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    accountsRef.current = ensured
    setAccounts(ensured)
    return true
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== SAVINGS_STORAGE_KEY) return
      const loaded = ensurePermanentCashAccount(loadSavings().accounts)
      accountsRef.current = loaded
      setAccounts(loaded)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const ordered = useMemo(() => sortedAccounts(accounts), [accounts])

  const total = useMemo(() => totalNow(ordered), [ordered])

  const upsertAccount = useCallback(
    (account: SavingsAccount) => {
      const current = accountsRef.current
      // Permanent cash keeps role + id
      const prev = current.find((a) => a.id === account.id)
      const nextAccount =
        prev && isPermanentCashAccount(prev)
          ? {
              ...account,
              id: prev.id,
              role: 'cash' as const,
              name: account.name.trim() || 'Cash',
            }
          : account
      const exists = current.some((a) => a.id === nextAccount.id)
      const next = exists
        ? current.map((a) => (a.id === nextAccount.id ? nextAccount : a))
        : [...current, nextAccount]
      return persist(next)
    },
    [persist],
  )

  const removeAccount = useCallback(
    (id: string) => {
      const acc = accountsRef.current.find((a) => a.id === id)
      if (acc && isPermanentCashAccount(acc)) return false
      return persist(accountsRef.current.filter((a) => a.id !== id))
    },
    [persist],
  )

  const addAccount = useCallback(() => {
    const current = accountsRef.current
    const maxOrder = current.reduce((m, a) => Math.max(m, a.sortOrder), -1)
    const acc = newSavingsAccount(maxOrder + 1)
    const ok = persist([...current, acc])
    return ok ? acc : null
  }, [persist])

  /**
   * Set end-of-month actual for an account. Pass `null` to clear that month.
   */
  const setActual = useCallback(
    (accountId: string, periodKey: string, amount: number | null) => {
      const next = accountsRef.current.map((a) => {
        if (a.id !== accountId) return a
        const actuals = { ...a.actuals }
        if (amount == null || !Number.isFinite(amount)) {
          delete actuals[periodKey]
        } else {
          actuals[periodKey] = Math.max(0, amount)
        }
        return { ...a, actuals }
      })
      return persist(next)
    },
    [persist],
  )

  const setContribution = useCallback(
    (accountId: string, contribution: number) => {
      const next = accountsRef.current.map((a) =>
        a.id === accountId ? { ...a, contribution: Math.max(0, contribution) } : a,
      )
      return persist(next)
    },
    [persist],
  )

  const setCadence = useCallback(
    (accountId: string, cadence: SavingsCadence) => {
      const next = accountsRef.current.map((a) =>
        a.id === accountId ? { ...a, cadence } : a,
      )
      return persist(next)
    },
    [persist],
  )

  const setRate = useCallback(
    (accountId: string, annualRatePercent: number) => {
      const next = accountsRef.current.map((a) =>
        a.id === accountId
          ? { ...a, annualRatePercent: Number.isFinite(annualRatePercent) ? annualRatePercent : 0 }
          : a,
      )
      return persist(next)
    },
    [persist],
  )

  const setCompoundUntilYear = useCallback(
    (accountId: string, year: number | null) => {
      const next = accountsRef.current.map((a) =>
        a.id === accountId ? { ...a, compoundUntilYear: year } : a,
      )
      return persist(next)
    },
    [persist],
  )

  const setContributeUntilYear = useCallback(
    (accountId: string, year: number | null) => {
      const next = accountsRef.current.map((a) =>
        a.id === accountId ? { ...a, contributeUntilYear: year } : a,
      )
      return persist(next)
    },
    [persist],
  )

  const setName = useCallback(
    (accountId: string, name: string) => {
      const next = accountsRef.current.map((a) =>
        a.id === accountId ? { ...a, name } : a,
      )
      return persist(next)
    },
    [persist],
  )

  /**
   * Add a past period column by explicit YYYY-MM key (month or year-end Dec).
   * Returns the key on success, null if invalid/future.
   */
  const addPastPeriodKey = useCallback(
    (periodKey: string) => {
      const current = accountsRef.current
      const result = ensurePastPeriodKey(current, periodKey)
      if (!result) return null
      if (result.accounts !== current) persist(result.accounts)
      return result.key
    },
    [persist],
  )

  /** Remove a past actual period column from all accounts. */
  const removePastPeriod = useCallback(
    (periodKey: string) => {
      const next = removePastPeriodKey(accountsRef.current, periodKey)
      if (!next) return false
      return persist(next)
    },
    [persist],
  )

  return {
    accounts: ordered,
    total,
    error,
    addAccount,
    removeAccount,
    upsertAccount,
    setActual,
    setContribution,
    setCadence,
    setRate,
    setCompoundUntilYear,
    setContributeUntilYear,
    setName,
    addPastPeriodKey,
    removePastPeriod,
  }
}

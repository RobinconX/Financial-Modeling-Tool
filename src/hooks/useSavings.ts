import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavingsAccount, SavingsCadence } from '../types'
import {
  ensurePastPeriodKey,
  newSavingsAccount,
  removePastPeriodKey,
  sortedAccounts,
  totalNow,
} from '../lib/savings'
import { loadSavings, saveSavings, SAVINGS_STORAGE_KEY } from '../lib/savingsStorage'

export function useSavings() {
  const initial = loadSavings()
  const [accounts, setAccounts] = useState<SavingsAccount[]>(() => initial.accounts)
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback((next: SavingsAccount[]) => {
    const result = saveSavings({ version: 1, accounts: next })
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    setAccounts(next)
    return true
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== SAVINGS_STORAGE_KEY) return
      setAccounts(loadSavings().accounts)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const ordered = useMemo(() => sortedAccounts(accounts), [accounts])

  const total = useMemo(() => totalNow(ordered), [ordered])

  const upsertAccount = useCallback(
    (account: SavingsAccount) => {
      const exists = accounts.some((a) => a.id === account.id)
      const next = exists
        ? accounts.map((a) => (a.id === account.id ? account : a))
        : [...accounts, account]
      return persist(next)
    },
    [accounts, persist],
  )

  const removeAccount = useCallback(
    (id: string) => persist(accounts.filter((a) => a.id !== id)),
    [accounts, persist],
  )

  const addAccount = useCallback(() => {
    const maxOrder = accounts.reduce((m, a) => Math.max(m, a.sortOrder), -1)
    const acc = newSavingsAccount(maxOrder + 1)
    const ok = persist([...accounts, acc])
    return ok ? acc : null
  }, [accounts, persist])

  const setActual = useCallback(
    (accountId: string, periodKey: string, amount: number) => {
      const next = accounts.map((a) => {
        if (a.id !== accountId) return a
        const actuals = { ...a.actuals, [periodKey]: Math.max(0, amount) }
        return { ...a, actuals }
      })
      return persist(next)
    },
    [accounts, persist],
  )

  const setContribution = useCallback(
    (accountId: string, contribution: number) => {
      const next = accounts.map((a) =>
        a.id === accountId ? { ...a, contribution: Math.max(0, contribution) } : a,
      )
      return persist(next)
    },
    [accounts, persist],
  )

  const setCadence = useCallback(
    (accountId: string, cadence: SavingsCadence) => {
      const next = accounts.map((a) => (a.id === accountId ? { ...a, cadence } : a))
      return persist(next)
    },
    [accounts, persist],
  )

  const setRate = useCallback(
    (accountId: string, annualRatePercent: number) => {
      const next = accounts.map((a) =>
        a.id === accountId
          ? { ...a, annualRatePercent: Number.isFinite(annualRatePercent) ? annualRatePercent : 0 }
          : a,
      )
      return persist(next)
    },
    [accounts, persist],
  )

  const setName = useCallback(
    (accountId: string, name: string) => {
      const next = accounts.map((a) => (a.id === accountId ? { ...a, name } : a))
      return persist(next)
    },
    [accounts, persist],
  )

  /**
   * Add a past period column by explicit YYYY-MM key (month or year-end Dec).
   * Returns the key on success, null if invalid/future.
   */
  const addPastPeriodKey = useCallback(
    (periodKey: string) => {
      const result = ensurePastPeriodKey(accounts, periodKey)
      if (!result) return null
      if (result.accounts !== accounts) persist(result.accounts)
      return result.key
    },
    [accounts, persist],
  )

  /** Remove a past actual period column from all accounts. */
  const removePastPeriod = useCallback(
    (periodKey: string) => {
      const next = removePastPeriodKey(accounts, periodKey)
      if (!next) return false
      return persist(next)
    },
    [accounts, persist],
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
    setName,
    addPastPeriodKey,
    removePastPeriod,
  }
}

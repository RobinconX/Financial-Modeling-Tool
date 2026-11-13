import { describe, expect, it } from 'vitest'
import { COMPARABLES_STORAGE_KEY } from '../../src/lib/comparablesStorage'
import { INCOME_COST_STORAGE_KEY } from '../../src/lib/incomeCostStorage'
import { OVERVIEW_STORAGE_KEY } from '../../src/lib/overviewStorage'
import {
  PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY,
  PORTFOLIO_ACTUALS_KEY,
} from '../../src/lib/portfolioActualsStorage'
import { PORTFOLIO_STORAGE_KEY } from '../../src/lib/portfolioStorage'
import { SAVINGS_STORAGE_KEY } from '../../src/lib/savingsStorage'
import { STORAGE_KEY } from '../../src/lib/storage'
import type { StorageRecoveryNotice } from '../../src/lib/storageLoadRecovery'
import {
  filterStorageRecoveryNoticesForTab,
  storageRecoveryTabForKey,
} from '../../src/lib/storageRecoveryTab'

function notice(storageKey: string, label: string): StorageRecoveryNotice {
  return {
    storageKey,
    label,
    reason: 'parse',
    backupKey: `grok-lab.corrupt-backup:${storageKey}`,
  }
}

describe('storageRecoveryTab', () => {
  it('maps known storage keys to tabs', () => {
    expect(storageRecoveryTabForKey(STORAGE_KEY)).toBe('projections')
    expect(storageRecoveryTabForKey(COMPARABLES_STORAGE_KEY)).toBe('projections')
    expect(storageRecoveryTabForKey(PORTFOLIO_STORAGE_KEY)).toBe('portfolio')
    expect(storageRecoveryTabForKey(PORTFOLIO_ACTUALS_KEY)).toBe('portfolio')
    expect(storageRecoveryTabForKey(PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY)).toBe(
      'portfolio',
    )
    expect(storageRecoveryTabForKey(INCOME_COST_STORAGE_KEY)).toBe('income-cost')
    expect(storageRecoveryTabForKey(SAVINGS_STORAGE_KEY)).toBe('savings')
    expect(storageRecoveryTabForKey(OVERVIEW_STORAGE_KEY)).toBe('overview')
    expect(storageRecoveryTabForKey('unknown-key')).toBeNull()
  })

  it('returns only notices for the active tab', () => {
    const all = [
      notice(SAVINGS_STORAGE_KEY, 'Savings'),
      notice(OVERVIEW_STORAGE_KEY, 'Overview'),
      notice(PORTFOLIO_STORAGE_KEY, 'Portfolio'),
    ]
    expect(filterStorageRecoveryNoticesForTab('savings', all)).toEqual([all[0]])
    expect(filterStorageRecoveryNoticesForTab('overview', all)).toEqual([all[1]])
    expect(filterStorageRecoveryNoticesForTab('portfolio', all)).toEqual([all[2]])
    expect(filterStorageRecoveryNoticesForTab('history', all)).toEqual([])
    expect(filterStorageRecoveryNoticesForTab('settings', all)).toEqual([])
  })

  it('allows multiple notices on one tab when both belong there', () => {
    const all = [
      notice(STORAGE_KEY, 'Projections'),
      notice(COMPARABLES_STORAGE_KEY, 'Comparables'),
      notice(SAVINGS_STORAGE_KEY, 'Savings'),
    ]
    expect(filterStorageRecoveryNoticesForTab('projections', all)).toEqual([all[0], all[1]])
  })
})

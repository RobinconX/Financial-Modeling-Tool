import type { AppTab } from '../types'
import { COMPARABLES_STORAGE_KEY } from './comparablesStorage'
import { INCOME_COST_STORAGE_KEY } from './incomeCostStorage'
import { OVERVIEW_STORAGE_KEY } from './overviewStorage'
import {
  PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY,
  PORTFOLIO_ACTUALS_KEY,
} from './portfolioActualsStorage'
import { PORTFOLIO_STORAGE_KEY } from './portfolioStorage'
import { SAVINGS_STORAGE_KEY } from './savingsStorage'
import type { StorageRecoveryNotice } from './storageLoadRecovery'
import { STORAGE_KEY } from './storage'

/** Which app tab should surface a given corrupt-storage notice. */
const STORAGE_RECOVERY_TAB: Record<string, AppTab> = {
  [STORAGE_KEY]: 'projections',
  [COMPARABLES_STORAGE_KEY]: 'projections',
  [PORTFOLIO_STORAGE_KEY]: 'portfolio',
  [PORTFOLIO_ACTUALS_KEY]: 'portfolio',
  [PORTFOLIO_ACTUALS_EMBEDDED_RECOVERY_KEY]: 'portfolio',
  [INCOME_COST_STORAGE_KEY]: 'income-cost',
  [SAVINGS_STORAGE_KEY]: 'savings',
  [OVERVIEW_STORAGE_KEY]: 'overview',
}

export function storageRecoveryTabForKey(storageKey: string): AppTab | null {
  return STORAGE_RECOVERY_TAB[storageKey] ?? null
}

/** Show only notices for storage that belongs on the active tab (no cross-tab spam). */
export function filterStorageRecoveryNoticesForTab(
  tab: AppTab,
  notices: StorageRecoveryNotice[],
): StorageRecoveryNotice[] {
  return notices.filter((n) => storageRecoveryTabForKey(n.storageKey) === tab)
}

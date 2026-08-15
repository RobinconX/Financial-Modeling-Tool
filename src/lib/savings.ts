import type { SavingsAccount, SavingsCadence, SavingsState } from '../types'

export const SAVINGS_CURRENCY = 'CHF' as const

/** Dense future horizon in months for projection table (2 years). */
export const DENSE_MONTHS = 24

/** Long-term milestone offsets in years for projection table. */
export const MILESTONE_YEARS = [5, 10, 15, 20] as const

/** Chart resolution: monthly near-term vs yearly long-term. */
export type ChartResolution = 'monthly' | 'yearly'

/** Monthly chart: first 12 months, then these year marks. */
export const CHART_MONTHLY_YEAR_MARKS = [2, 3, 4, 5, 10, 15, 20, 25, 30] as const

/** Yearly chart: every year through this horizon. */
export const CHART_YEARLY_HORIZON = 30

/**
 * Month (1–12) when a yearly contribution is applied (end of that month).
 * January: after Dec→Jan compounding, so the new year starts with interest then deposit.
 */
export const YEARLY_CONTRIB_MONTH = 1

export type PeriodKind = 'actual' | 'projected'

export type PeriodPoint = {
  key: string
  label: string
  kind: PeriodKind
  balance: number
}

export type ChartRow = {
  key: string
  label: string
  kind: PeriodKind
  /** True for the live Now category (between past year-ends and projections). */
  isNow?: boolean
  total: number
  /** Per-account balances keyed by account id */
  [accountId: string]: string | number | PeriodKind | boolean | undefined
}

// --- Period keys (end-of-month values) ---

export function periodKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

export function makePeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parsePeriodKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, month }
}

export function comparePeriodKeys(a: string, b: string): number {
  return a.localeCompare(b)
}

/** Add n months to a YYYY-MM key. */
export function addMonthsToKey(key: string, months: number): string {
  const p = parsePeriodKey(key)
  if (!p) return key
  const idx = p.year * 12 + (p.month - 1) + months
  const year = Math.floor(idx / 12)
  const month = (idx % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthsBetween(fromKey: string, toKey: string): number {
  const a = parsePeriodKey(fromKey)
  const b = parsePeriodKey(toKey)
  if (!a || !b) return 0
  return b.year * 12 + (b.month - 1) - (a.year * 12 + (a.month - 1))
}

export function labelForPeriodKey(key: string, opts?: { short?: boolean }): string {
  const p = parsePeriodKey(key)
  if (!p) return key
  if (opts?.short) {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${names[p.month - 1]} ${String(p.year).slice(2)}`
  }
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return `${names[p.month - 1]} ${p.year}`
}

export function currentPeriodKey(asOf: Date = new Date()): string {
  return periodKeyFromDate(asOf)
}

// --- Account helpers ---

/** Stable id for the permanent Cash account (survives reloads). */
export const PERMANENT_CASH_ACCOUNT_ID = 'savings-cash'

export function isPermanentCashAccount(account: SavingsAccount): boolean {
  return account.role === 'cash' || account.id === PERMANENT_CASH_ACCOUNT_ID
}

export function newPermanentCashAccount(asOf: Date = new Date()): SavingsAccount {
  const now = currentPeriodKey(asOf)
  return {
    id: PERMANENT_CASH_ACCOUNT_ID,
    name: 'Cash',
    role: 'cash',
    actuals: { [now]: 0 },
    contribution: 0,
    cadence: 'monthly',
    annualRatePercent: 0,
    compoundUntilYear: null,
    contributeUntilYear: null,
    sortOrder: -1,
  }
}

/** Ensure exactly one permanent Cash account exists (first in list). */
export function ensurePermanentCashAccount(
  accounts: SavingsAccount[],
  asOf: Date = new Date(),
): SavingsAccount[] {
  const cash = accounts.find(isPermanentCashAccount)
  if (cash) {
    // Normalize id/role/name so it stays identifiable
    const fixed: SavingsAccount = {
      ...cash,
      id: PERMANENT_CASH_ACCOUNT_ID,
      role: 'cash',
      name: cash.name.trim() || 'Cash',
      sortOrder: Math.min(cash.sortOrder, -1),
    }
    const others = accounts.filter((a) => !isPermanentCashAccount(a) && a.id !== fixed.id)
    return [fixed, ...others]
  }
  return [newPermanentCashAccount(asOf), ...accounts]
}

export function getPermanentCashAccount(
  accounts: SavingsAccount[],
): SavingsAccount | null {
  return accounts.find(isPermanentCashAccount) ?? null
}

/**
 * End-of-year cash balance for calendar `year` (Dec actual, or latest ≤ Dec).
 * Used as opening working capital for Income/Cost scenario year `year + 1`.
 */
export function yearEndBalance(account: SavingsAccount, year: number): number {
  const y = Math.floor(year)
  if (!Number.isFinite(y)) return 0
  const key = makePeriodKey(y, 12)
  const direct = getActual(account, key)
  if (direct != null) return Math.max(0, direct)
  return Math.max(0, latestActual(account, key))
}

export function emptySavingsState(): SavingsState {
  return { version: 1, accounts: ensurePermanentCashAccount([]) }
}

export function newSavingsAccount(sortOrder: number, asOf: Date = new Date()): SavingsAccount {
  const now = currentPeriodKey(asOf)
  return {
    id: crypto.randomUUID(),
    name: '',
    role: null,
    actuals: { [now]: 0 },
    contribution: 0,
    cadence: 'monthly',
    annualRatePercent: 0,
    compoundUntilYear: null,
    contributeUntilYear: null,
    sortOrder,
  }
}

export function sortedAccounts(accounts: SavingsAccount[]): SavingsAccount[] {
  return [...accounts].sort(
    (a, b) =>
      // Cash always first
      (isPermanentCashAccount(a) ? -1 : 0) - (isPermanentCashAccount(b) ? -1 : 0) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  )
}

/** Balance for a period if stored; undefined if missing. */
export function getActual(account: SavingsAccount, key: string): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(account.actuals, key)) return undefined
  const n = account.actuals[key]
  return Number.isFinite(n) ? n : undefined
}

/**
 * Latest actual on or before asOfKey (inclusive). Prefer last past ≤ now, else 0.
 */
export function latestActual(account: SavingsAccount, asOfKey: string): number {
  let bestKey: string | null = null
  let bestVal = 0
  for (const [k, v] of Object.entries(account.actuals)) {
    if (comparePeriodKeys(k, asOfKey) > 0) continue
    if (!Number.isFinite(v)) continue
    if (bestKey == null || comparePeriodKeys(k, bestKey) > 0) {
      bestKey = k
      bestVal = v
    }
  }
  return bestVal
}

export function balanceNow(account: SavingsAccount, asOf: Date = new Date()): number {
  const key = currentPeriodKey(asOf)
  const direct = getActual(account, key)
  if (direct != null) return direct
  return latestActual(account, key)
}

export function totalNow(accounts: SavingsAccount[], asOf: Date = new Date()): number {
  return accounts.reduce((sum, a) => sum + balanceNow(a, asOf), 0)
}

// --- Projection (end-of-month; compound only Dec → Jan) ---

/**
 * Advance end-of-month balance from previous month into `targetKey`.
 *
 * Rules:
 * - Values are end-of-month (contribution in a month is included in that month).
 * - Compounding is always yearly and applies only when entering January
 *   (growth from Dec 31 → Jan 31 on the prior balance).
 * - Monthly cadence: contribution every month after any compound.
 * - Yearly cadence: contribution only in YEARLY_CONTRIB_MONTH (January), after compound.
 */
export function stepToEndOfMonth(
  previousEndBalance: number,
  targetKey: string,
  contribution: number,
  annualRatePercent: number,
  cadence: SavingsCadence,
): number {
  const p = parsePeriodKey(targetKey)
  if (!p) return previousEndBalance

  const rate = Number.isFinite(annualRatePercent) ? annualRatePercent : 0
  const contrib = Number.isFinite(contribution) ? Math.max(0, contribution) : 0

  let bal = previousEndBalance

  // Dec → Jan: annual compound first
  if (p.month === 1) {
    bal *= 1 + rate / 100
  }

  // Contribution included in this month's end value
  if (cadence === 'monthly') {
    bal += contrib
  } else if (p.month === YEARLY_CONTRIB_MONTH) {
    bal += contrib
  }

  return bal
}

/** Simulate monthly from now for `months` steps; returns map of periodKey → balance. */
export function simulateMonths(
  account: SavingsAccount,
  asOf: Date,
  months: number,
): Map<string, number> {
  const nowKey = currentPeriodKey(asOf)
  let bal = latestActual(account, nowKey)
  const out = new Map<string, number>()
  out.set(nowKey, bal)

  for (let i = 1; i <= months; i++) {
    const key = addMonthsToKey(nowKey, i)
    const p = parsePeriodKey(key)
    const until = account.compoundUntilYear
    const rate =
      until != null && Number.isFinite(until) && p != null && p.month === 1 && p.year > until
        ? 0
        : account.annualRatePercent
    const contribUntil = account.contributeUntilYear
    const contrib =
      contribUntil != null && Number.isFinite(contribUntil) && p != null && p.year > contribUntil
        ? 0
        : account.contribution
    bal = stepToEndOfMonth(bal, key, contrib, rate, account.cadence)
    out.set(key, bal)
  }
  return out
}

/**
 * Project future balances only (never mutates actuals).
 * Always monthly timeline: dense DENSE_MONTHS, then milestone years.
 * Cadence only controls contribution frequency; compounding is always yearly (Dec→Jan).
 */
export function projectAccount(account: SavingsAccount, asOf: Date = new Date()): PeriodPoint[] {
  const nowKey = currentPeriodKey(asOf)
  const maxMonths = Math.max(...MILESTONE_YEARS) * 12
  const sim = simulateMonths(account, asOf, maxMonths)
  const milestoneMonths = new Set(MILESTONE_YEARS.map((y) => y * 12))
  const out: PeriodPoint[] = []

  for (let i = 1; i <= maxMonths; i++) {
    const key = addMonthsToKey(nowKey, i)
    const bal = sim.get(key) ?? 0
    const isDense = i <= DENSE_MONTHS
    const isMilestone = milestoneMonths.has(i)
    if (!isDense && !isMilestone) continue
    out.push({
      key: isMilestone && !isDense ? `+${i / 12}y` : key,
      label: isMilestone && !isDense ? `+${i / 12}y` : labelForPeriodKey(key, { short: true }),
      kind: 'projected',
      balance: bal,
    })
  }
  return out
}

/** Stored actuals ≤ now as PeriodPoints (sorted). */
export function actualPoints(account: SavingsAccount, asOf: Date = new Date()): PeriodPoint[] {
  const nowKey = currentPeriodKey(asOf)
  const keys = Object.keys(account.actuals)
    .filter((k) => parsePeriodKey(k) && comparePeriodKeys(k, nowKey) <= 0)
    .sort(comparePeriodKeys)

  return keys.map((key) => ({
    key,
    label: key === nowKey ? 'Now' : labelForPeriodKey(key, { short: true }),
    kind: 'actual' as const,
    balance: account.actuals[key] ?? 0,
  }))
}

/** Full series: actuals (incl. now) + projections. */
export function seriesForAccount(account: SavingsAccount, asOf: Date = new Date()): PeriodPoint[] {
  const nowKey = currentPeriodKey(asOf)
  const actuals = actualPoints(account, asOf)
  if (!actuals.some((p) => p.key === nowKey)) {
    actuals.push({
      key: nowKey,
      label: 'Now',
      kind: 'actual',
      balance: latestActual(account, nowKey),
    })
    actuals.sort((a, b) => comparePeriodKeys(a.key, b.key))
  } else {
    for (const p of actuals) {
      if (p.key === nowKey) p.label = 'Now'
    }
  }
  return [...actuals, ...projectAccount(account, asOf)]
}

/**
 * Past year-end period keys (YYYY-12) strictly before now, from stored actuals.
 * Projection past columns / chart history use these only (not mid-year months).
 */
export function pastYearEndKeys(
  accounts: SavingsAccount[],
  asOf: Date = new Date(),
): string[] {
  const nowKey = currentPeriodKey(asOf)
  const years = new Set<number>()
  for (const a of accounts) {
    for (const k of Object.keys(a.actuals)) {
      const p = parsePeriodKey(k)
      if (!p || comparePeriodKeys(k, nowKey) >= 0) continue
      if (p.month === 12) years.add(p.year)
    }
  }
  return [...years]
    .map((y) => makePeriodKey(y, 12))
    .filter((k) => comparePeriodKeys(k, nowKey) < 0)
    .sort(comparePeriodKeys)
}

/**
 * Chart categories by resolution (past year-end actuals + now always first):
 * - monthly: months 1–12, then year marks 2,3,4,5,10,15,20,25,30
 * - yearly: every year 1…30
 */
export function buildChartRows(
  accounts: SavingsAccount[],
  asOf: Date = new Date(),
  resolution: ChartResolution = 'monthly',
): ChartRow[] {
  const nowKey = currentPeriodKey(asOf)
  const ordered = sortedAccounts(accounts)
  const pastSorted = pastYearEndKeys(ordered, asOf)

  type Cat = {
    key: string
    label: string
    kind: PeriodKind
    isNow?: boolean
    monthsFromNow: number | null
  }
  const cats: Cat[] = []

  for (const k of pastSorted) {
    const p = parsePeriodKey(k)
    cats.push({
      key: k,
      label: p ? String(p.year) : labelForPeriodKey(k, { short: true }),
      kind: 'actual',
      monthsFromNow: null,
    })
  }
  // Live Now sits between past year-ends and forward projections
  cats.push({
    key: nowKey,
    label: 'Now',
    kind: 'actual',
    isNow: true,
    monthsFromNow: 0,
  })

  if (resolution === 'monthly') {
    for (let i = 1; i <= 12; i++) {
      const k = addMonthsToKey(nowKey, i)
      cats.push({
        key: k,
        label: labelForPeriodKey(k, { short: true }),
        kind: 'projected',
        monthsFromNow: i,
      })
    }
    for (const y of CHART_MONTHLY_YEAR_MARKS) {
      cats.push({
        key: `+${y}y`,
        label: `+${y}y`,
        kind: 'projected',
        monthsFromNow: y * 12,
      })
    }
  } else {
    for (let y = 1; y <= CHART_YEARLY_HORIZON; y++) {
      cats.push({
        key: `+${y}y`,
        label: `+${y}y`,
        kind: 'projected',
        monthsFromNow: y * 12,
      })
    }
  }

  const maxM = Math.max(
    ...cats.map((c) => c.monthsFromNow ?? 0),
    CHART_YEARLY_HORIZON * 12,
  )
  const accountSeries = new Map<string, Map<string, number>>()

  for (const acc of ordered) {
    const byKey = new Map<string, number>()
    let last = 0
    for (const k of pastSorted) {
      const v = getActual(acc, k)
      if (v != null) last = v
      byKey.set(k, v != null ? v : last)
    }

    const sim = simulateMonths(acc, asOf, maxM)
    for (const [k, v] of sim) {
      byKey.set(k, v)
    }
    // Alias year marks onto simulated month balances
    for (const cat of cats) {
      if (cat.monthsFromNow != null && cat.monthsFromNow > 0 && cat.key.startsWith('+')) {
        const monthKey = addMonthsToKey(nowKey, cat.monthsFromNow)
        byKey.set(cat.key, sim.get(monthKey) ?? 0)
      }
    }

    accountSeries.set(acc.id, byKey)
  }

  return cats.map((cat) => {
    const row: ChartRow = {
      key: cat.key,
      label: cat.label,
      kind: cat.kind,
      isNow: cat.isNow === true,
      total: 0,
    }
    let total = 0
    for (const acc of ordered) {
      const v = accountSeries.get(acc.id)?.get(cat.key) ?? 0
      row[acc.id] = v
      total += v
    }
    row.total = total
    return row
  })
}

export type TableColumn = {
  key: string
  label: string
  kind: PeriodKind
  /** If true, cell is user-editable actual (past only on projection; now from inputs) */
  editable: boolean
}

export function buildTableColumns(
  accounts: SavingsAccount[],
  asOf: Date = new Date(),
): TableColumn[] {
  const nowKey = currentPeriodKey(asOf)
  const cols: TableColumn[] = []
  for (const k of pastYearEndKeys(accounts, asOf)) {
    const p = parsePeriodKey(k)
    cols.push({
      key: k,
      label: p ? String(p.year) : labelForPeriodKey(k, { short: true }),
      kind: 'actual',
      editable: true,
    })
  }
  cols.push({ key: nowKey, label: 'Now', kind: 'actual', editable: false })

  for (let i = 1; i <= DENSE_MONTHS; i++) {
    const k = addMonthsToKey(nowKey, i)
    cols.push({
      key: k,
      label: labelForPeriodKey(k, { short: true }),
      kind: 'projected',
      editable: false,
    })
  }

  for (const y of MILESTONE_YEARS) {
    cols.push({
      key: `+${y}y`,
      label: `+${y}y`,
      kind: 'projected',
      editable: false,
    })
  }

  return cols
}

export function cellBalance(
  account: SavingsAccount,
  columnKey: string,
  kind: PeriodKind,
  asOf: Date = new Date(),
): number {
  if (kind === 'actual') {
    if (columnKey === currentPeriodKey(asOf)) return balanceNow(account, asOf)
    return getActual(account, columnKey) ?? 0
  }

  const proj = projectAccount(account, asOf)
  const hit = proj.find((p) => p.key === columnKey)
  if (hit) return hit.balance

  const nowKey = currentPeriodKey(asOf)
  if (parsePeriodKey(columnKey)) {
    const months = monthsBetween(nowKey, columnKey)
    if (months > 0) {
      const sim = simulateMonths(account, asOf, months)
      return sim.get(columnKey) ?? 0
    }
  }

  return 0
}

/**
 * Ensure a past year-end column exists (December only, strictly before now).
 * Seeds 0 on the first account so the column appears.
 * Returns the key, or null if invalid/not year-end/future.
 */
export function ensurePastPeriodKey(
  accounts: SavingsAccount[],
  periodKey: string,
  asOf: Date = new Date(),
): { key: string; accounts: SavingsAccount[] } | null {
  const p = parsePeriodKey(periodKey)
  if (!p || p.month !== 12) return null
  const nowKey = currentPeriodKey(asOf)
  if (comparePeriodKeys(periodKey, nowKey) >= 0) return null
  if (accounts.length === 0) return { key: periodKey, accounts }

  const already = accounts.some((a) =>
    Object.prototype.hasOwnProperty.call(a.actuals, periodKey),
  )
  if (already) return { key: periodKey, accounts }

  const next = accounts.map((a, i) => {
    if (i !== 0) return a
    return { ...a, actuals: { ...a.actuals, [periodKey]: 0 } }
  })
  return { key: periodKey, accounts: next }
}

/**
 * Remove a past actual period key from every account.
 * Cannot remove "now" or future keys. Returns null if invalid.
 */
export function removePastPeriodKey(
  accounts: SavingsAccount[],
  periodKey: string,
  asOf: Date = new Date(),
): SavingsAccount[] | null {
  if (!parsePeriodKey(periodKey)) return null
  const nowKey = currentPeriodKey(asOf)
  if (comparePeriodKeys(periodKey, nowKey) >= 0) return null

  return accounts.map((a) => {
    if (!Object.prototype.hasOwnProperty.call(a.actuals, periodKey)) return a
    const actuals = { ...a.actuals }
    delete actuals[periodKey]
    return { ...a, actuals }
  })
}

export function columnTotal(
  accounts: SavingsAccount[],
  column: TableColumn,
  asOf: Date = new Date(),
): number {
  return accounts.reduce((sum, a) => sum + cellBalance(a, column.key, column.kind, asOf), 0)
}

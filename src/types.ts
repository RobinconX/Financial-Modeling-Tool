export type ValuationBasis = 'ps' | 'pfcf' | 'pe'

export type Quote = {
  symbol: string
  name: string
  price: number
  currency: string
  marketCap: number | null
  sharesOutstanding: number | null
}

export type AnalysisMode = 'easy' | 'advanced'

export type EasyProjection = {
  id: string
  year: number
  /** Absolute projected market cap */
  projectedMarketCap: number | null
}

export type YearProjection = {
  id: string
  year: number
  /**
   * Cumulative share count vs today.
   * 1.0 = no dilution; 1.1 = 10% more shares by this year.
   * Shareholder ROI uses (mcap growth) / dilutionFactor.
   */
  dilutionFactor: number
  revenue: number | null
  psMultiple: number | null
  fcf: number | null
  pfcfMultiple: number | null
  profit: number | null
  peMultiple: number | null
}

export type SeriesPoint = {
  year: number
  current?: number
  easy?: number
  ps?: number
  pfcf?: number
  pe?: number
  /** True when the value is a real assumption (not chart interpolation) */
  easyActual?: boolean
  psActual?: boolean
  pfcfActual?: boolean
  peActual?: boolean
}

export type ProjectionRow = {
  year: number
  basis: ValuationBasis | 'easy'
  marketCap: number
  /** Equity-value equivalent after dilution (= marketCap / dilutionFactor) */
  equityValue: number
  dilutionFactor: number
  totalReturn: number
  cagr: number
  years: number
}

/** Persisted projection set: always stores both Easy and Advanced assumptions */
export type SavedScenario = {
  id: string
  symbol: string
  name: string
  companyName: string | null
  currency: string
  currentPrice: number | null
  currentMarketCap: number | null
  sharesOutstanding: number | null
  mcapOverride: number | null
  easyRows: EasyProjection[]
  advancedRows: YearProjection[]
  createdAt: string
  updatedAt: string
}

export type StoragePayload = {
  version: 1
  scenarios: SavedScenario[]
}

export type AppTab =
  | 'analyzer'
  | 'saved'
  | 'portfolio'
  | 'overview'
  | 'income-cost'
  | 'savings'

/** Portfolio display currency (storage remains USD-based). */
export type DisplayCurrency = 'USD' | 'CHF'

// --- Income / Cost (amounts always stored in CHF) ---

export type CashflowKind = 'income' | 'cost'
export type CashflowCadence = 'recurring' | 'one-time'
export type MoneyEditField = 'monthly' | 'yearly'

/** Named budget scenario (not necessarily a calendar year). */
export type CashflowScenario = {
  id: string
  name: string
  /** Lower = earlier in the top bar */
  sortOrder: number
}

export type CashflowLine = {
  id: string
  scenarioId: string
  kind: CashflowKind
  /** Short label (e.g. taxes, groceries, salary) */
  name: string
  /** Longer text; shown on hover of the name */
  detail?: string
  cadence: CashflowCadence
  /**
   * Recurring: annual CHF amount (source of truth; monthly = yearly / 12).
   * One-time: single CHF amount for this scenario.
   */
  yearlyAmount: number
  lastEdited?: MoneyEditField
}

export type IncomeCostState = {
  version: 2
  scenarios: CashflowScenario[]
  lines: CashflowLine[]
}

// --- Savings (amounts always stored in CHF; end-of-month balances) ---

/** How often the contribution amount is deposited (compounding is always yearly Dec→Jan). */
export type SavingsCadence = 'monthly' | 'yearly'

export type SavingsAccount = {
  id: string
  name: string
  /**
   * Actual end-of-month balances by period key ('YYYY-MM').
   * Only keys ≤ current period are used as actuals; future keys ignored.
   */
  actuals: Record<string, number>
  /** Contribution amount per contribution period (CHF) */
  contribution: number
  /** monthly = every month; yearly = once a year in January (after compound) */
  cadence: SavingsCadence
  /** Annual compounding rate in percent (applied Dec→Jan only), e.g. 3.5 */
  annualRatePercent: number
  /** Lower = earlier in the table */
  sortOrder: number
}

export type SavingsState = {
  version: 1
  accounts: SavingsAccount[]
}

// --- Overview (net-worth stack config; display CHF) ---

export type OverviewSeriesType = 'portfolio' | 'savings' | 'manual'

export type OverviewSeries = {
  id: string
  name: string
  enabled: boolean
  sortOrder: number
  type: OverviewSeriesType
  /**
   * Optional custom stack color (#rrggbb). When unset, a shade is chosen by origin
   * (portfolio greens / savings blues / manual amber–violet).
   */
  color?: string | null
  /** type === 'portfolio' */
  portfolioId?: string | null
  /** type === 'savings' */
  savingsAccountId?: string | null
  /** type === 'manual' */
  baseChf?: number
  annualRatePercent?: number
  /** Year when baseChf applies (defaults to year of creation) */
  baseYear?: number
}

/** Named combination of asset series (+ year range) for the Overview chart. */
export type OverviewScenario = {
  id: string
  name: string
  sortOrder: number
  startYear: number
  endYear: number
  series: OverviewSeries[]
}

export type OverviewState = {
  version: 2
  scenarios: OverviewScenario[]
  selectedScenarioId: string | null
}

/** Payload to load a scenario into an analyzer panel */
export type AnalyzerLoadState = {
  symbol: string
  companyName: string | null
  currency: string
  currentPrice: number | null
  currentMarketCap: number | null
  sharesOutstanding: number | null
  mcapOverride: number | null
  easyRows: EasyProjection[]
  advancedRows: YearProjection[]
}

export type PortfolioYearOverride = {
  year: number
  /** Manual position value in dollars for this year */
  valueDollars: number
}

export type PortfolioHolding = {
  id: string
  symbol: string
  /** Number of shares held (value = shares × price) */
  sharesHeld: number
  scenarioId: string | null
  basis: ValuationBasis | 'easy'
  yearOverrides: PortfolioYearOverride[]
  /** Used when scenario has no current price */
  manualCurrentPrice: number | null
}

/** How a portfolio deposit amount is determined. */
export type PortfolioDepositSource = 'fixed' | 'surplus'

/**
 * A deposit of capital into the portfolio in a given year
 * (including additional deposits planned for the current year).
 * Opening cash is a deposit with `isOpening: true` (counts on the Now bar).
 */
export type PortfolioDeposit = {
  id: string
  year: number
  /**
   * USD book amount for this year when `source` is `fixed` (default).
   * Ignored for cash math when `source` is `surplus` (computed from Income/Cost).
   */
  amount: number
  /** Opening cash already held today — at most one per portfolio when normalized. */
  isOpening?: boolean
  /**
   * `fixed` = use `amount`.
   * `surplus` = deposit = max(0, scenario net yearly) × surplusPercent / 100 (CHF→USD via FX).
   * Income/Cost scenario is not modified.
   */
  source?: PortfolioDepositSource
  /** Income/Cost scenario id when source is surplus */
  surplusScenarioId?: string | null
  /** Percent of that scenario’s yearly surplus (e.g. 50 = half of left-over) */
  surplusPercent?: number
}

export type PortfolioActionType = 'buy' | 'sell'

/** Planned buy/sell taking effect from `year` onward. */
export type PortfolioAction = {
  id: string
  type: PortfolioActionType
  holdingId: string
  year: number
  /** Shares bought or sold (always > 0). */
  shares: number
  note?: string
}

export type SavedPortfolio = {
  id: string
  name: string
  /**
   * @deprecated Prefer deposits with isOpening. Kept for migration; normalize to 0.
   * Cash at year Y = sum(deposits year<=Y) − buys + sells.
   */
  currentCash: number
  /**
   * @deprecated Migrated into opening deposit / deposits.
   */
  cashDollars?: number
  /**
   * @deprecated Migrated into deposits.
   */
  cashByYear?: { year: number; amount: number }[]
  /**
   * Capital contributions by year. First/opening row (isOpening) is current cash.
   */
  deposits: PortfolioDeposit[]
  /** Planned buy/sell trades by year. */
  actions: PortfolioAction[]
  holdings: PortfolioHolding[]
  createdAt: string
  updatedAt: string
}

export type PortfolioGridRow = {
  key: string
  kind: 'equity' | 'cash' | 'total'
  label: string
  holdingId?: string
  /** Parallel to years axis; null = empty cell */
  values: (number | null)[]
  warning?: string | null
}

export type PortfolioGrid = {
  years: number[]
  rows: PortfolioGridRow[]
  totals: (number | null)[]
}

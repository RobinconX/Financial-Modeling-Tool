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

/** Valuation basis used for one comparable row. */
export type ComparableBasis = ValuationBasis | 'easy'

export type ComparableEntry = {
  scenarioId: string
  basis: ComparableBasis
}

/** Named set of stock scenarios for side-by-side price / ROI comparison. */
export type SavedComparable = {
  id: string
  name: string
  entries: ComparableEntry[]
  /** Year whose ROI column is the sort key. Null = ticker order. */
  sortYear: number | null
  sortDir: 'desc' | 'asc'
  /**
   * Years to show in the table. Null / empty = none (user adds years).
   * Period or sparse set — same list.
   */
  filterYears: number[] | null
  createdAt: string
  updatedAt: string
}

export type ComparablesState = {
  version: 1
  comparables: SavedComparable[]
}

/** Optional net-worth target (CHF + year) for Overview / History overlay. */
export type NetWorthGoal = {
  id: string
  name: string
  amountChf: number
  year: number
}

/** Year mark on History / Overview charts (life event, not modeled). */
export type ChartAnnotation = {
  id: string
  year: number
  /** Optional month 1–12; omit for a year-end mark. */
  month?: number | null
  label: string
}

export type AppTab =
  | 'projections'
  | 'portfolio'
  | 'overview'
  | 'history'
  | 'income-cost'
  | 'savings'
  | 'settings'

/** Portfolio display currency (storage remains USD-based). */
export type DisplayCurrency = 'USD' | 'CHF'

// --- Income / Cost (amounts always stored in CHF) ---

export type CashflowKind = 'income' | 'cost'
export type CashflowCadence = 'recurring' | 'one-time'
export type MoneyEditField = 'monthly' | 'yearly'

/** Named budget scenario for a specific calendar year. */
export type CashflowScenario = {
  id: string
  name: string
  /** Lower = earlier in the top bar */
  sortOrder: number
  /** Calendar year this budget describes */
  year: number
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
  /**
   * Calendar month in the scenario year (1 = Jan … 12 = Dec).
   * When set, the full yearlyAmount is paid/received in that month only
   * (other months get none of this line). When null:
   * - recurring: spread yearly÷12 across all months
   * - one-time: omitted from monthly schedule (still in annual totals)
   */
  month?: number | null
}

/**
 * Informative monthly draw from working balance.
 * Not part of Income/Cost budget net, Sankey, or portfolio surplus deposits.
 */
export type WorkingBalanceDraw = {
  id: string
  scenarioId: string
  name: string
  sortOrder: number
  /**
   * CHF taken in each calendar month (index 0 = Jan … 11 = Dec).
   * Always length 12; invalid entries treated as 0.
   */
  amounts: number[]
}

export type IncomeCostState = {
  version: 3
  scenarios: CashflowScenario[]
  lines: CashflowLine[]
  draws: WorkingBalanceDraw[]
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
  /**
   * Last calendar year that still gets the Jan compound (Dec→Jan into this year).
   * Null/omit = compound for the whole horizon.
   */
  compoundUntilYear?: number | null
  /**
   * Last calendar year that still receives contributions.
   * Null/omit = contribute for the whole horizon.
   */
  contributeUntilYear?: number | null
  /** Lower = earlier in the table */
  sortOrder: number
  /**
   * Permanent system role. `cash` is always present, cannot be deleted, and
   * supplies prior-year Dec balance for Income/Cost working capital.
   */
  role?: 'cash' | null
}

export type SavingsState = {
  version: 1
  accounts: SavingsAccount[]
}

/** Shared actual contributions into investing (all portfolio scenarios). ROI only. */
export type PortfolioContributionsState = {
  version: 1
  currency: DisplayCurrency
  /** Calendar year → amount in `currency`. */
  byYear: Record<string, number>
}

// --- Overview (net-worth stack config; display CHF) ---

export type OverviewSeriesType = 'portfolio' | 'savings' | 'manual' | 'incomeLeftover'
export type RunwayDrawTiming = 'growFirst' | 'drawFirst'

/**
 * Calendar year → Income/Cost scenario binding.
 * Manual series also set `percent` of that year's available IC cash for this position;
 * anything unclaimed becomes leftover cash.
 */
export type OverviewYearBinding = {
  year: number
  incomeCostScenarioId: string
  /** type === 'manual': percent of available IC cash (0–100). Ignored on leftover. */
  percent?: number
}

export type OverviewSeries = {
  id: string
  name: string
  enabled: boolean
  sortOrder: number
  type: OverviewSeriesType
  /**
   * Optional custom stack color (#rrggbb). When unset, a shade is chosen by origin
   * (portfolio greens / savings blues / manual amber–violet / leftover pinks).
   */
  color?: string | null
  /** type === 'portfolio' */
  portfolioId?: string | null
  /** type === 'savings' */
  savingsAccountId?: string | null
  /**
   * @deprecated Prefer yearBindings. Migrated on load for incomeLeftover.
   */
  incomeCostScenarioId?: string | null
  /**
   * type === 'incomeLeftover' | 'manual': map calendar year → Income/Cost scenario.
   * Manual bindings include percent of available cash for this position.
   * Leftover is permanent; net residual after all manual % claims.
   */
  yearBindings?: OverviewYearBinding[]
  /**
   * Flat CHF added each year after the last stated year for this series:
   * - incomeLeftover: after the last IC binding on the Overview scenario
   *   (any manual/leftover); if none, every year from baseYear onward.
   * - manual: after this series' last year-binding; if none, every year from
   *   baseYear onward (in addition to any year-binding % claims).
   */
  perpetualYearlyChf?: number
  /**
   * type === 'manual' | 'incomeLeftover': opening balance (CHF).
   * For leftover: current unallocated cash pile (Now).
   */
  baseChf?: number
  /** type === 'manual' | 'incomeLeftover': optional annual compound % */
  annualRatePercent?: number
  /** Year when baseChf applies (defaults to year of creation) */
  baseYear?: number
  /**
   * Last calendar year this series still grows. After that: no compound /
   * perpetual growth (additions can still land). Empty = always.
   */
  compoundUntilYear?: number | null
  /**
   * Last calendar year this series still receives contributions / yearly
   * additions. Empty = always.
   */
  contributeUntilYear?: number | null
  /**
   * First calendar year this series may be drawn from on Runway.
   * Years before this are locked. Empty = always drawable.
   */
  drawLockedUntilYear?: number | null
  /**
   * When this series pays a Runway deficit.
   * growFirst (default) = compound, then draw.
   * drawFirst = draw from last year’s leftover, then compound the rest.
   */
  drawTiming?: RunwayDrawTiming | null
  /**
   * @deprecated Manual funding is yearBindings + percent.
   */
  manualYearlyChf?: number
  /**
   * @deprecated Manual funding is yearBindings + percent.
   */
  manualYearlySource?: 'leftover' | 'fixed'
}

export type RunwayDrawMode = 'percent' | 'fixed'
/** manual = typed income; ic-income = I/C income + own draw; ic-keep = I/C income + I/C costs. */
export type RunwayPeriodMode = 'manual' | 'ic-income' | 'ic-keep'

export type OverviewRunwayPeriod = {
  startYear: number
  mode: RunwayPeriodMode
  incomeCostScenarioId: string | null
  manualIncomeChf: number
  drawMode: RunwayDrawMode
  drawPercent: number
  drawFixedChf: number
}

/** Per-overview-scenario runway: ordered periods (each applies until the next). */
export type OverviewRunwayConfig = {
  periods: OverviewRunwayPeriod[]
  /** Series ids, first = drawn first on a deficit year. Empty = leftover, cash, savings, portfolios, manuals. */
  drawOrder?: string[]
}

/** Named combination of asset series (+ year range) for the Overview chart. */
export type OverviewScenario = {
  id: string
  name: string
  /**
   * Free-text note of assumptions for this scenario (UI only; not used in math).
   */
  description?: string
  sortOrder: number
  startYear: number
  endYear: number
  series: OverviewSeries[]
  runway?: OverviewRunwayConfig
}

export type OverviewState = {
  version: 2
  scenarios: OverviewScenario[]
  selectedScenarioId: string | null
}



export type PortfolioYearOverride = {
  year: number
  /** Manual position value in dollars for this year */
  valueDollars: number
}

/** Listed option contract (OCC). Now value = contracts × premium × multiplier. */
export type OptionContract = {
  underlying: string
  /** Calendar expiration YYYY-MM-DD */
  expiration: string
  right: 'C' | 'P'
  strike: number
  /** Shares per contract (US listed equity = 100) */
  multiplier: number
  occSymbol: string
}

export type PortfolioHolding = {
  id: string
  symbol: string
  /**
   * Optional display name (e.g. "AAPL Dec26 180C"). Falls back to symbol.
   * Useful for options / custom instruments.
   */
  label?: string | null
  /** Number of shares / contracts held (value = qty × price unless absolute override) */
  sharesHeld: number
  /**
   * Linked stock projection. Null = manual position (options, cash-like equity, etc.)
   * valued only via manual price and yearOverrides.
   */
  scenarioId: string | null
  basis: ValuationBasis | 'easy'
  /**
   * Absolute position $ by year (USD book). Wins over shares×price for that year.
   * Use for options mark-to-model or fixed future values without a stock scenario.
   */
  yearOverrides: PortfolioYearOverride[]
  /** Unit price when scenario has no quote, or for pure manual positions */
  manualCurrentPrice: number | null
  /**
   * When true, never uses stock projections even if symbol matches a scenario.
   * Set for options / custom instruments added as manual positions.
   */
  manualOnly?: boolean
  /** When set, this holding is a listed option; quotes refresh the premium. */
  option?: OptionContract
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
   * Nominal amount when `source` is `fixed` (default), in `currency` (default USD).
   * Stored as entered so CHF figures do not drift when the FX rate changes.
   * Ignored for cash math when `source` is `surplus` (computed from Income/Cost).
   */
  amount: number
  /**
   * Denomination of `amount` for fixed deposits. Default / missing = USD (legacy).
   * Display shows this amount as-is when the portfolio display currency matches.
   */
  currency?: DisplayCurrency
  /** Opening cash already held today — at most one per portfolio when normalized. */
  isOpening?: boolean
  /**
   * `fixed` = use `amount` (+ `currency`).
   * `surplus` = deposit = max(0, scenario net yearly) × surplusPercent / 100 (CHF→USD via FX).
   * Income/Cost scenario is not modified.
   */
  source?: PortfolioDepositSource
  /** Income/Cost scenario id when source is surplus */
  surplusScenarioId?: string | null
  /** Percent of that scenario’s yearly surplus (e.g. 50 = half of left-over) */
  surplusPercent?: number
  /**
   * How much of this planned deposit is already in the portfolio (same units as
   * `amount` for fixed; CHF for surplus before resolve). Current-year cash math
   * only adds the remainder so opening cash is not double-counted.
   */
  alreadyDeposited?: number
}

/**
 * Recurring deposit applied every calendar year *after* the last explicit
 * non-opening deposit year (or after the opening year if no other deposits).
 */
export type PerpetualYearlyDeposit = {
  /** Nominal amount when source is fixed, in `currency` (default USD). */
  amount: number
  /** Denomination of `amount` for fixed perpetual deposits. Missing = USD. */
  currency?: DisplayCurrency
  source?: PortfolioDepositSource
  surplusScenarioId?: string | null
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
  /**
   * Optional trade share price in USD book.
   * When set (> 0), used for cash impact instead of scenario/live price for that year.
   * Null/omit = auto (scenario projection or current price).
   */
  price?: number | null
  note?: string
}

/** Display order of holdings on the Positions tab (does not reorder stored array). */
export type PortfolioHoldingSort = 'manual' | 'symbol' | 'value'

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
  /**
   * Optional amount deposited every year after the last explicit deposit year.
   * Null/undefined or zero amount = off.
   */
  perpetualYearlyDeposit?: PerpetualYearlyDeposit | null
  /**
   * Annual % growth applied to the whole portfolio total after the last year
   * with stated projections (holdings scenarios, overrides, deposits, actions).
   * 0 / null / undefined = off. Grid/chart extends a fixed default horizon when on.
   */
  perpetualGrowthPercent?: number | null
  /** Planned buy/sell trades by year. */
  actions: PortfolioAction[]
  holdings: PortfolioHolding[]
  /**
   * Positions tab sort preference for this portfolio.
   * Missing = manual (storage order).
   */
  holdingSort?: PortfolioHoldingSort
  /**
   * End-of-month whole-portfolio totals (manual actuals).
   * Keys: `YYYY-MM`. Amounts in `actualsCurrency` (default USD).
   */
  actuals?: Record<string, number>
  /** Denomination of `actuals` amounts. Missing = USD (legacy). */
  actualsCurrency?: DisplayCurrency
  /**
   * Chart overlay: `amount` (in `currency`) at `year`. Later years:
   * V_y = V_{y-1} × (1 + ratePercent/100) + cash that year.
   * Past years use Money-in; current/future use scheduled deposits.
   * Perpetual yearly cash only after the last stated projection year.
   */
  targetCompound?: {
    amount: number
    currency: DisplayCurrency
    ratePercent: number
    year: number
  } | null
  createdAt: string
  updatedAt: string
}

export type PortfolioGridRow = {
  key: string
  kind: 'equity' | 'cash' | 'total' | 'growth'
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
  /** Last year with explicit inputs; years after may use perpetual growth. */
  lastStatedYear?: number
}

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

export type AppTab = 'analyzer' | 'saved' | 'portfolio'

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

/**
 * A deposit of capital into the portfolio in a given year
 * (including additional deposits planned for the current year).
 */
export type PortfolioDeposit = {
  id: string
  year: number
  /** Dollars deposited in this year (not a running cash balance). */
  amount: number
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
   * Cash already held today (distinct from this year's planned deposit).
   * Cash at year Y = currentCash + deposits − buy costs + sell proceeds (through Y).
   */
  currentCash: number
  /**
   * @deprecated Migrated into currentCash / deposits.
   */
  cashDollars?: number
  /**
   * @deprecated Migrated into deposits.
   */
  cashByYear?: { year: number; amount: number }[]
  /** Capital contributions by year (can include the current year). */
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

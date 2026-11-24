import type { DisplayCurrency, PortfolioTrade } from '../types'
import { amountToDisplay } from './fx'

export function quoteToDisplayCurrency(currency: string | null | undefined): DisplayCurrency {
  return currency === 'CHF' ? 'CHF' : 'USD'
}

/** Convert a stored nominal amount into the active portfolio display currency (live spot). */
export function convertAmountToDisplay(
  amount: number,
  amountCurrency: DisplayCurrency,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): number {
  return amountToDisplay(amount, amountCurrency, displayCurrency, usdToChf)
}

/**
 * Legacy shim for equity-only paths that pre-converted row currency.
 * Option ledger math reads native `currency` / `feesCurrency` via `perfCtx`.
 */
export function tradeInDisplayCurrency(
  trade: PortfolioTrade,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): PortfolioTrade {
  if (trade.instrument === 'option' || trade.feesCurrency != null) return trade
  const book = trade.currency ?? 'USD'
  return {
    ...trade,
    price: convertAmountToDisplay(trade.price, book, displayCurrency, usdToChf),
    fees:
      trade.fees != null
        ? convertAmountToDisplay(trade.fees, book, displayCurrency, usdToChf)
        : 0,
    currency: displayCurrency,
  }
}

export function tradesInDisplayCurrency(
  trades: PortfolioTrade[],
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): PortfolioTrade[] {
  return trades.map((t) => tradeInDisplayCurrency(t, displayCurrency, usdToChf))
}

export type PerfDisplayContext = {
  displayCurrency: DisplayCurrency
  /** Live spot USD→CHF (marks, terminal NAV — not trade cash flows). */
  usdToChf: number | null
  quoteCurrencyBySymbol: Record<string, DisplayCurrency>
  /** Trade-era USD→CHF by trade date; when absent, falls back to `usdToChf`. */
  usdToChfByTradeDate?: Record<string, number>
  /** Shown on capital / MWR / ledger cash-flow metrics when FX data was incomplete. */
  fxWarnings?: string[]
}

/** USD→CHF for converting trade premiums and fees on `tradeDate`. */
export function usdToChfForTradeFlow(
  tradeDate: string,
  ctx?: PerfDisplayContext,
): number | null {
  if (!ctx) return null
  const d = tradeDate?.trim()
  if (d && ctx.usdToChfByTradeDate?.[d] != null) {
    return ctx.usdToChfByTradeDate[d]!
  }
  return ctx.usdToChf ?? null
}

export function quoteCurrencyForSymbol(
  symbol: string,
  quoteCurrencyBySymbol: Record<string, DisplayCurrency>,
): DisplayCurrency {
  return quoteCurrencyBySymbol[symbol.toUpperCase()] ?? 'USD'
}

export function historyCloseInDisplay(
  close: number,
  symbol: string,
  ctx: PerfDisplayContext,
  asOfDate?: string,
): number {
  const quote = quoteCurrencyForSymbol(symbol, ctx.quoteCurrencyBySymbol)
  const fx =
    asOfDate != null ? usdToChfForTradeFlow(asOfDate, ctx) : ctx.usdToChf
  return convertAmountToDisplay(close, quote, ctx.displayCurrency, fx)
}
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

/** Shallow copy with price/fees expressed in display currency for ledger math. */
export function tradeInDisplayCurrency(
  trade: PortfolioTrade,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): PortfolioTrade {
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
  usdToChf: number | null
  quoteCurrencyBySymbol: Record<string, DisplayCurrency>
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
): number {
  const quote = quoteCurrencyForSymbol(symbol, ctx.quoteCurrencyBySymbol)
  return convertAmountToDisplay(
    close,
    quote,
    ctx.displayCurrency,
    ctx.usdToChf,
  )
}
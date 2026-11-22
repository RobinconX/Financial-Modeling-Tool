import type { PortfolioTrade } from '../types'

export type ReturnChartTradeMarker = {
  id: string
  tradeDate: string
  time: number
  side: PortfolioTrade['side']
  symbol: string
  shares: number
  price: number
  fees: number
  currency: PortfolioTrade['currency']
  feesCurrency?: PortfolioTrade['feesCurrency']
  y: number
  instrument?: 'equity' | 'option'
  event?: PortfolioTrade['event']
  occSymbol?: string
  label?: string
  underlying?: string
}

export type ReturnChartOptionMarker = ReturnChartTradeMarker & {
  instrument: 'option'
  occSymbol: string
  underlying: string
  label: string
}
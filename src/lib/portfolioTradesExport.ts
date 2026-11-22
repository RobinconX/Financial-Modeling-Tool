import type { PortfolioTrade, PortfolioTradesState } from '../types'
import { tradesForPortfolio } from './portfolioTrades'

export type PortfolioTradesExportFile = {
  version: 1
  exportedAt: string
  portfolioId: string
  trades: PortfolioTrade[]
}

/** Round-trippable JSON for **Import** on the same book (fields match import rows). */
export function buildPortfolioTradesExport(
  state: PortfolioTradesState,
  portfolioId: string,
): PortfolioTradesExportFile {
  const trades = tradesForPortfolio(state, portfolioId).map((t) => ({
    ...t,
    currency: t.currency ?? 'USD',
    fees: t.fees ?? 0,
  }))
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolioId,
    trades,
  }
}

export function serializePortfolioTradesExport(payload: PortfolioTradesExportFile): string {
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function downloadPortfolioTradesExport(
  state: PortfolioTradesState,
  portfolioId: string,
  fileStem: string,
): void {
  const payload = buildPortfolioTradesExport(state, portfolioId)
  const blob = new Blob([serializePortfolioTradesExport(payload)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileStem}-trades.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function clearTradesForPortfolio(
  state: PortfolioTradesState,
  portfolioId: string,
): PortfolioTradesState {
  return {
    version: 1,
    trades: state.trades.filter((t) => t.portfolioId !== portfolioId),
  }
}
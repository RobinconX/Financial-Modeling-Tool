/** Whether portfolio cash plans are per book or one shared record (like Actuals). */

export const PORTFOLIO_CASH_MODE_KEY = 'grok-lab.portfolio-cash-mode'

export type PortfolioCashMode = 'perPortfolio' | 'shared'

let memoryMode: PortfolioCashMode | null = null

export function parsePortfolioCashMode(raw: unknown): PortfolioCashMode | undefined {
  if (raw === 'perPortfolio' || raw === 'shared') return raw
  return undefined
}

export function getPortfolioCashMode(): PortfolioCashMode {
  try {
    const v = localStorage.getItem(PORTFOLIO_CASH_MODE_KEY)
    if (v === 'perPortfolio' || v === 'shared') return v
  } catch {
    /* ignore */
  }
  return memoryMode ?? 'perPortfolio'
}

export function applyPortfolioCashModeSetting(mode: PortfolioCashMode): void {
  memoryMode = mode
  try {
    localStorage.setItem(PORTFOLIO_CASH_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

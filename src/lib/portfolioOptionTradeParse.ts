import { buildOccSymbol, isOccSymbol, parseOccSymbol } from './optionContract'
import type { OptionContract } from '../types'

const MONTH_ABBR: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
}

/** Interactive Brokers style: `HIMS 16OCT26 25 P` or `PLTR 19SEP25 47 C`. */
export function parseIbOptionDescription(text: string): OptionContract | null {
  const s = text.trim().replace(/\s+/g, ' ')
  const m =
    /^([A-Z][A-Z0-9]{0,5})\s+(\d{1,2})([A-Z]{3})(\d{2})\s+([\d.]+)\s+([CP])\b/i.exec(
      s,
    )
  if (!m) return null
  const underlying = m[1]!.toUpperCase()
  const day = Number(m[2])
  const mon = MONTH_ABBR[m[3]!.toUpperCase()]
  const yy = Number(m[4])
  if (!mon || !Number.isFinite(day) || !Number.isFinite(yy)) return null
  const year = yy >= 70 ? 1900 + yy : 2000 + yy
  const expiration = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const strike = Number(m[5])
  const right = m[6]!.toUpperCase() as 'C' | 'P'
  if (!Number.isFinite(strike) || strike <= 0) return null
  const occSymbol = buildOccSymbol(underlying, expiration, right, strike)
  if (!occSymbol) return null
  return {
    underlying,
    expiration,
    right,
    strike,
    multiplier: 100,
    occSymbol,
  }
}

export function resolveOptionSymbolFromRow(o: Record<string, unknown>): string | null {
  const occRaw =
    (typeof o.occSymbol === 'string' && o.occSymbol.trim()) ||
    (typeof o.symbol === 'string' && isOccSymbol(o.symbol) ? o.symbol.trim() : '') ||
    ''
  if (occRaw) {
    const occ = parseOccSymbol(occRaw)
    if (occ) return occ.occSymbol
  }
  const desc =
    (typeof o.description === 'string' && o.description.trim()) ||
    (typeof o.symbol === 'string' &&
    !isOccSymbol(o.symbol) &&
    /\s+\d{1,2}[A-Z]{3}\d{2}\s+/i.test(o.symbol)
      ? o.symbol.trim()
      : '')
  if (desc) {
    const parsed = parseIbOptionDescription(desc)
    if (parsed) return parsed.occSymbol
  }
  if (
    typeof o.underlying === 'string' &&
    typeof o.expiry === 'string' &&
    (o.right === 'C' || o.right === 'P')
  ) {
    const strike = Number(o.strike)
    if (Number.isFinite(strike) && strike > 0) {
      const occ = buildOccSymbol(
        o.underlying,
        o.expiry,
        o.right,
        strike,
      )
      if (occ) return occ
    }
  }
  return null
}

export function contractFieldsFromOcc(occ: string): OptionContract | null {
  return parseOccSymbol(occ)
}
import type { OptionContract, PortfolioHolding } from '../types'

const OCC_RE = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

export function isOccSymbol(symbol: string): boolean {
  return OCC_RE.test(symbol.trim().toUpperCase())
}

export function buildOccSymbol(
  underlying: string,
  expiration: string,
  right: 'C' | 'P',
  strike: number,
): string {
  const root = underlying.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const day = parseIsoDate(expiration)
  if (!root || !day || !Number.isFinite(strike) || strike < 0) return ''
  const yy = String(day.year).slice(-2)
  const mm = String(day.month).padStart(2, '0')
  const dd = String(day.day).padStart(2, '0')
  const strike8 = Math.round(strike * 1000).toString().padStart(8, '0')
  return `${root}${yy}${mm}${dd}${right}${strike8}`
}

export function parseOccSymbol(occ: string): OptionContract | null {
  const m = OCC_RE.exec(occ.trim().toUpperCase())
  if (!m) return null
  const year = 2000 + Number(m[2]!.slice(0, 2))
  const month = Number(m[2]!.slice(2, 4))
  const day = Number(m[2]!.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const strike = Number(m[4]) / 1000
  if (!Number.isFinite(strike)) return null
  const expiration = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const right = m[3] as 'C' | 'P'
  return {
    underlying: m[1]!,
    expiration,
    right,
    strike,
    multiplier: 100,
    occSymbol: m[0]!,
  }
}

export function optionLabel(opt: OptionContract): string {
  const d = parseIsoDate(opt.expiration)
  const date = d
    ? `${d.day} ${monthShort(d.month)} ${String(d.year).slice(-2)}`
    : opt.expiration
  const strike =
    opt.strike % 1 === 0 ? String(opt.strike) : opt.strike.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return `${opt.underlying} ${date} ${strike}${opt.right}`
}

/** Expired after the expiration calendar day (still live on expiry date). */
export function optionIsExpired(expiration: string, now = new Date()): boolean {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return expiration < today
}

export function holdingMultiplier(holding: PortfolioHolding): number {
  const m = holding.option?.multiplier
  if (m != null && Number.isFinite(m) && m > 0) return m
  return holding.option ? 100 : 1
}

export function parseExpiryGroupLabel(label: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(label.trim())
  if (!m) return null
  const month = MONTHS[m[1]!.toLowerCase()]
  const day = Number(m[2])
  const year = Number(m[3])
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null
  if (day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function monthShort(month: number): string {
  return (
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
      month - 1
    ] ?? ''
  )
}

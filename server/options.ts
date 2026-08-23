import { buildOccSymbol, parseExpiryGroupLabel } from '../src/lib/optionContract'

export type OptionChainContract = {
  occSymbol: string
  strike: number
  right: 'C' | 'P'
  last: number | null
  bid: number | null
  ask: number | null
  volume: number | null
  openInterest: number | null
}

export type OptionChain = {
  underlying: string
  expirations: string[]
  expiration: string | null
  calls: OptionChainContract[]
  puts: OptionChainContract[]
}

type NasdaqRow = {
  expirygroup?: string | null
  strike?: string | null
  c_Last?: string | null
  c_Bid?: string | null
  c_Ask?: string | null
  c_Volume?: string | null
  c_Openinterest?: string | null
  p_Last?: string | null
  p_Bid?: string | null
  p_Ask?: string | null
  p_Volume?: string | null
  p_Openinterest?: string | null
}

type NasdaqChainResponse = {
  data?: {
    table?: { rows?: NasdaqRow[] }
  }
}

const NASDAQ_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

function parseNum(raw: string | null | undefined): number | null {
  if (raw == null || raw === '' || raw === '--') return null
  const n = Number(String(raw).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function side(
  underlying: string,
  expiration: string,
  right: 'C' | 'P',
  strike: number,
  last: string | null | undefined,
  bid: string | null | undefined,
  ask: string | null | undefined,
  volume: string | null | undefined,
  openInterest: string | null | undefined,
): OptionChainContract | null {
  const occSymbol = buildOccSymbol(underlying, expiration, right, strike)
  if (!occSymbol) return null
  return {
    occSymbol,
    strike,
    right,
    last: parseNum(last),
    bid: parseNum(bid),
    ask: parseNum(ask),
    volume: parseNum(volume),
    openInterest: parseNum(openInterest),
  }
}

export async function fetchOptionChain(
  rawUnderlying: string,
  expiration?: string | null,
): Promise<OptionChain> {
  const underlying = rawUnderlying.trim().toUpperCase()
  if (!/^[A-Z]{1,6}$/.test(underlying)) {
    throw new Error('Invalid underlying ticker')
  }

  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(underlying)}/option-chain?assetclass=stocks&fromdate=all`
  const res = await fetch(url, { headers: NASDAQ_HEADERS })
  if (!res.ok) throw new Error(`Options chain failed (${res.status})`)
  const json = (await res.json()) as NasdaqChainResponse
  const rows = json.data?.table?.rows ?? []

  const byExpiry = new Map<
    string,
    { calls: OptionChainContract[]; puts: OptionChainContract[] }
  >()
  let currentExp: string | null = null

  for (const row of rows) {
    if (row.expirygroup) {
      currentExp = parseExpiryGroupLabel(row.expirygroup)
    }
    if (!currentExp) continue
    const strike = parseNum(row.strike)
    if (strike == null || strike <= 0) continue

    let bucket = byExpiry.get(currentExp)
    if (!bucket) {
      bucket = { calls: [], puts: [] }
      byExpiry.set(currentExp, bucket)
    }
    const call = side(
      underlying,
      currentExp,
      'C',
      strike,
      row.c_Last,
      row.c_Bid,
      row.c_Ask,
      row.c_Volume,
      row.c_Openinterest,
    )
    const put = side(
      underlying,
      currentExp,
      'P',
      strike,
      row.p_Last,
      row.p_Bid,
      row.p_Ask,
      row.p_Volume,
      row.p_Openinterest,
    )
    if (call) bucket.calls.push(call)
    if (put) bucket.puts.push(put)
  }

  const expirations = [...byExpiry.keys()].sort()
  if (expirations.length === 0) {
    throw new Error(`No option chain for ${underlying}`)
  }

  const chosen =
    expiration && byExpiry.has(expiration)
      ? expiration
      : (expirations[0] ?? null)
  const picked = chosen ? byExpiry.get(chosen) : undefined

  return {
    underlying,
    expirations,
    expiration: chosen,
    calls: picked?.calls ?? [],
    puts: picked?.puts ?? [],
  }
}

import type { PortfolioTrade, PortfolioTradesState } from '../types'
import { normalizePortfolioTrade } from './portfolioTrades'

export type TradeDuplicatePolicy = 'skip' | 'import'

export type ImportInvalidRow = {
  index: number
  reason: string
}

export type ImportPreviewTrade = {
  index: number
  trade: PortfolioTrade
  reassignedBook: boolean
  strippedHoldingLink: boolean
  duplicateOfFileIndex: number | null
  duplicateOfExisting: boolean
}

export type TradeImportPreview = {
  valid: ImportPreviewTrade[]
  invalid: ImportInvalidRow[]
  duplicateFileCount: number
  duplicateExistingCount: number
  reassignedCount: number
}

export function tradeDuplicateKey(
  t: Pick<PortfolioTrade, 'symbol' | 'side' | 'tradeDate' | 'shares' | 'price' | 'currency'>,
): string {
  return [
    t.symbol.toUpperCase(),
    t.side,
    t.tradeDate,
    String(t.shares),
    String(t.price),
    t.currency ?? 'USD',
  ].join('|')
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

export function parseCsvTradeRows(text: string): unknown[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const headerCells = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase())
  const rows: unknown[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!)
    const o: Record<string, unknown> = {}
    for (let c = 0; c < headerCells.length; c++) {
      const key = headerCells[c]
      if (!key) continue
      const val = cells[c]?.trim() ?? ''
      if (val === '') continue
      if (key === 'symbol') o.symbol = val
      else if (key === 'side') o.side = val.toLowerCase()
      else if (key === 'tradedate') o.tradeDate = val
      else if (key === 'shares') o.shares = val
      else if (key === 'price') o.price = val
      else if (key === 'fees') o.fees = val
      else if (key === 'note') o.note = val
      else if (key === 'id') o.id = val
      else if (key === 'holdingid') o.holdingId = val
      else if (key === 'portfolioid') o.portfolioId = val
      else if (key === 'currency') o.currency = val.toUpperCase()
    }
    rows.push(o)
  }
  return rows
}

export function extractTradeRowsFromJson(text: string): unknown[] {
  const parsed = JSON.parse(text) as unknown
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed !== 'object' || parsed === null) return []
  const o = parsed as Record<string, unknown>
  if (Array.isArray(o.trades)) return o.trades
  const pt = o.portfolioTrades
  if (typeof pt === 'object' && pt !== null && Array.isArray((pt as Record<string, unknown>).trades)) {
    return (pt as Record<string, unknown>).trades as unknown[]
  }
  return []
}

export function describeTradeRowValidationFailure(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) return 'Not an object'
  const o = raw as Record<string, unknown>
  if (!o.symbol || typeof o.symbol !== 'string' || !o.symbol.trim()) return 'Missing symbol'
  if (o.side !== 'buy' && o.side !== 'sell') return 'Side must be buy or sell'
  if (!o.tradeDate || typeof o.tradeDate !== 'string') return 'Missing tradeDate (YYYY-MM-DD)'
  const shares = Number(o.shares)
  if (!Number.isFinite(shares) || shares <= 0) return 'Shares must be > 0'
  const price = Number(o.price)
  if (!Number.isFinite(price) || price <= 0) return 'Price must be > 0'
  if (o.fees != null && o.fees !== '') {
    const f = Number(o.fees)
    if (!Number.isFinite(f) || f < 0) return 'Fees must be >= 0'
  }
  return 'Invalid symbol, date, or ticker format'
}

export function prepareTradeRowForBook(
  raw: unknown,
  bookId: string,
  holdingIds: ReadonlySet<string>,
): { trade: PortfolioTrade | null; reassignedBook: boolean; strippedHoldingLink: boolean; reason?: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { trade: null, reassignedBook: false, strippedHoldingLink: false, reason: 'Not an object' }
  }
  const o = { ...(raw as Record<string, unknown>) }
  let reassignedBook = false
  const rawBook =
    typeof o.portfolioId === 'string' && o.portfolioId.trim() ? o.portfolioId.trim() : ''
  if (rawBook && rawBook !== bookId) reassignedBook = true
  o.portfolioId = bookId
  let strippedHoldingLink = false
  if (typeof o.holdingId === 'string' && o.holdingId.trim()) {
    if (!holdingIds.has(o.holdingId.trim())) {
      delete o.holdingId
      strippedHoldingLink = true
    }
  }
  const trade = normalizePortfolioTrade(o)
  if (!trade) {
    return {
      trade: null,
      reassignedBook,
      strippedHoldingLink,
      reason: describeTradeRowValidationFailure(o),
    }
  }
  return { trade, reassignedBook, strippedHoldingLink }
}

export function buildTradeImportPreview(
  rawRows: unknown[],
  bookId: string,
  existingTrades: PortfolioTrade[],
  holdingIds: ReadonlySet<string>,
): TradeImportPreview {
  const existingKeys = new Set(existingTrades.map(tradeDuplicateKey))
  const seenFile = new Map<string, number>()
  const valid: ImportPreviewTrade[] = []
  const invalid: ImportInvalidRow[] = []
  let duplicateFileCount = 0
  let duplicateExistingCount = 0
  let reassignedCount = 0

  rawRows.forEach((raw, index) => {
    const prep = prepareTradeRowForBook(raw, bookId, holdingIds)
    if (!prep.trade) {
      invalid.push({ index: index + 1, reason: prep.reason ?? 'Invalid row' })
      return
    }
    const key = tradeDuplicateKey(prep.trade)
    const dupFile = seenFile.has(key) ? seenFile.get(key)! : null
    seenFile.set(key, index + 1)
    const dupExisting = existingKeys.has(key)
    if (dupFile != null) duplicateFileCount++
    if (dupExisting) duplicateExistingCount++
    if (prep.reassignedBook) reassignedCount++
    valid.push({
      index: index + 1,
      trade: prep.trade,
      reassignedBook: prep.reassignedBook,
      strippedHoldingLink: prep.strippedHoldingLink,
      duplicateOfFileIndex: dupFile,
      duplicateOfExisting: dupExisting,
    })
  })

  return {
    valid,
    invalid,
    duplicateFileCount,
    duplicateExistingCount,
    reassignedCount,
  }
}

export function appendPortfolioTrades(
  state: PortfolioTradesState,
  preview: TradeImportPreview,
  bookId: string,
  duplicatePolicy: TradeDuplicatePolicy,
): { state: PortfolioTradesState; imported: number; skipped: number } {
  const existingIds = new Set(state.trades.map((t) => t.id))
  const existingKeys = new Set(
    state.trades.filter((t) => t.portfolioId === bookId).map(tradeDuplicateKey),
  )
  let imported = 0
  let skipped = 0
  let next = state
  for (const row of preview.valid) {
    const key = tradeDuplicateKey(row.trade)
    const isDup = row.duplicateOfExisting || row.duplicateOfFileIndex != null
    if (isDup && duplicatePolicy === 'skip') {
      skipped++
      continue
    }
    let trade = row.trade
    if (existingIds.has(trade.id)) {
      trade = { ...trade, id: crypto.randomUUID() }
    }
    if (duplicatePolicy === 'import' || !isDup) {
      existingKeys.add(key)
    }
    next = {
      version: 1,
      trades: [...next.trades.filter((t) => t.id !== trade.id), trade].sort(
        (a, b) =>
          a.tradeDate.localeCompare(b.tradeDate) ||
          a.symbol.localeCompare(b.symbol) ||
          a.id.localeCompare(b.id),
      ),
    }
    existingIds.add(trade.id)
    imported++
  }
  return { state: next, imported, skipped }
}

export function parseTradeImportText(
  text: string,
  format: 'json' | 'csv' | 'auto',
): unknown[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (format === 'csv' || (format === 'auto' && !trimmed.startsWith('[') && !trimmed.startsWith('{'))) {
    return parseCsvTradeRows(trimmed)
  }
  return extractTradeRowsFromJson(trimmed)
}
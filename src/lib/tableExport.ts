/**
 * Human-readable Excel export of the financial model (.xlsx).
 * Distinct from JSON backup: this is for reading/auditing numbers, not restore.
 */
import type { AppDataSnapshot } from './appDataSnapshot'
import { collectAppData } from './appDataSnapshot'
import { getYearBindings } from './overview'
import { getDeposits } from './portfolio'

type Cell = string | number | boolean | null | undefined

export type TableExportSheet = {
  name: string
  headers: string[]
  rows: Cell[][]
}

function icName(data: AppDataSnapshot, id: string | null | undefined): string {
  if (!id) return ''
  return data.incomeCost.scenarios.find((s) => s.id === id)?.name ?? id
}

function portfolioName(data: AppDataSnapshot, id: string | null | undefined): string {
  if (!id) return ''
  return data.portfolios.find((p) => p.id === id)?.name ?? id
}

function savingsName(data: AppDataSnapshot, id: string | null | undefined): string {
  if (!id) return ''
  return data.savings.accounts.find((a) => a.id === id)?.name ?? id
}

function scenarioTicker(data: AppDataSnapshot, id: string | null | undefined): string {
  if (!id) return ''
  const sc = data.scenarios.find((s) => s.id === id)
  return sc ? `${sc.symbol} ${sc.name}`.trim() : id
}

export function buildTableExportSheets(data: AppDataSnapshot): TableExportSheet[] {
  const icById = new Map(data.incomeCost.scenarios.map((s) => [s.id, s]))

  const savingsActuals: Cell[][] = []
  for (const a of data.savings.accounts) {
    for (const key of Object.keys(a.actuals ?? {}).sort()) {
      savingsActuals.push([a.name, key, a.actuals[key]!])
    }
  }

  const holdings: Cell[][] = []
  for (const p of data.portfolios) {
    for (const h of p.holdings) {
      holdings.push([
        p.name,
        h.symbol,
        h.label ?? '',
        h.sharesHeld,
        scenarioTicker(data, h.scenarioId),
        h.basis,
        h.manualCurrentPrice ?? '',
        h.manualOnly === true,
      ])
    }
  }

  const deposits: Cell[][] = []
  for (const p of data.portfolios) {
    for (const d of getDeposits(p)) {
      deposits.push([
        p.name,
        d.isOpening === true,
        d.year,
        d.source ?? 'fixed',
        d.amount,
        d.currency ?? 'USD',
        icName(data, d.surplusScenarioId),
        d.surplusPercent ?? '',
        d.alreadyDeposited ?? '',
      ])
    }
    const per = p.perpetualYearlyDeposit
    if (per && (per.amount > 0 || per.source === 'surplus')) {
      deposits.push([
        p.name,
        false,
        'perpetual',
        per.source ?? 'fixed',
        per.amount,
        per.currency ?? 'USD',
        icName(data, per.surplusScenarioId),
        per.surplusPercent ?? '',
        '',
      ])
    }
  }

  const portActuals: Cell[][] = []
  for (const p of data.portfolios) {
    for (const key of Object.keys(p.actuals ?? {}).sort()) {
      portActuals.push([p.name, key, p.actualsCurrency ?? 'USD', p.actuals![key]!])
    }
  }

  const easy: Cell[][] = []
  const adv: Cell[][] = []
  for (const sc of data.scenarios) {
    for (const r of sc.easyRows ?? []) {
      easy.push([sc.symbol, sc.name, r.year, r.projectedMarketCap ?? ''])
    }
    for (const r of sc.advancedRows ?? []) {
      adv.push([
        sc.symbol,
        sc.name,
        r.year,
        r.revenue ?? '',
        r.psMultiple ?? '',
        r.fcf ?? '',
        r.pfcfMultiple ?? '',
        r.profit ?? '',
        r.peMultiple ?? '',
        r.dilutionFactor,
      ])
    }
  }

  const seriesRows: Cell[][] = []
  const bindRows: Cell[][] = []
  const runwayRows: Cell[][] = []
  for (const sc of data.overview.scenarios) {
    for (const s of [...sc.series].sort((a, b) => a.sortOrder - b.sortOrder)) {
      seriesRows.push([
        sc.name,
        s.name,
        s.type,
        s.enabled,
        s.baseChf ?? '',
        s.annualRatePercent ?? '',
        s.baseYear ?? '',
        s.contributeUntilYear ?? '',
        s.compoundUntilYear ?? '',
        s.perpetualYearlyChf ?? '',
        portfolioName(data, s.portfolioId),
        savingsName(data, s.savingsAccountId),
      ])
      for (const b of getYearBindings(s)) {
        bindRows.push([sc.name, s.name, b.year, icName(data, b.incomeCostScenarioId), b.percent ?? ''])
      }
    }
    for (const p of sc.runway?.periods ?? []) {
      runwayRows.push([
        sc.name,
        p.startYear,
        p.mode,
        icName(data, p.incomeCostScenarioId),
        p.manualIncomeChf,
        p.drawMode,
        p.drawPercent,
        p.drawFixedChf,
      ])
    }
  }

  return [
    {
      name: 'I-C scenarios',
      headers: ['id', 'name', 'year'],
      rows: [...data.incomeCost.scenarios]
        .sort((a, b) => a.year - b.year || a.sortOrder - b.sortOrder)
        .map((s) => [s.id, s.name, s.year]),
    },
    {
      name: 'I-C lines',
      headers: ['scenario', 'kind', 'name', 'cadence', 'yearlyAmount', 'month', 'detail'],
      rows: [...data.incomeCost.lines]
        .sort((a, b) => {
          const ay = icById.get(a.scenarioId)?.year ?? 0
          const by = icById.get(b.scenarioId)?.year ?? 0
          return ay - by || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
        })
        .map((l) => [
          icName(data, l.scenarioId),
          l.kind,
          l.name,
          l.cadence,
          l.yearlyAmount,
          l.month ?? '',
          l.detail ?? '',
        ]),
    },
    {
      name: 'Savings accounts',
      headers: ['name', 'role', 'contribution', 'cadence', 'annualRatePercent', 'contributeUntil', 'compoundUntil'],
      rows: [...data.savings.accounts]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((a) => [
          a.name,
          a.role ?? '',
          a.contribution,
          a.cadence,
          a.annualRatePercent,
          a.contributeUntilYear ?? '',
          a.compoundUntilYear ?? '',
        ]),
    },
    { name: 'Savings actuals', headers: ['account', 'period', 'balance'], rows: savingsActuals },
    {
      name: 'Portfolios',
      headers: ['name', 'perpetualGrowthPercent', 'actualsCurrency'],
      rows: data.portfolios.map((p) => [p.name, p.perpetualGrowthPercent ?? '', p.actualsCurrency ?? 'USD']),
    },
    {
      name: 'Holdings',
      headers: ['portfolio', 'symbol', 'label', 'shares', 'scenario', 'basis', 'manualPrice', 'manualOnly'],
      rows: holdings,
    },
    {
      name: 'Deposits',
      headers: [
        'portfolio',
        'opening',
        'year',
        'source',
        'amount',
        'currency',
        'surplusScenario',
        'surplusPercent',
        'alreadyDeposited',
      ],
      rows: deposits,
    },
    {
      name: 'Portfolio actuals',
      headers: ['portfolio', 'period', 'currency', 'total'],
      rows: portActuals,
    },
    {
      name: 'Stock easy',
      headers: ['symbol', 'name', 'year', 'projectedMarketCap'],
      rows: easy,
    },
    {
      name: 'Stock advanced',
      headers: ['symbol', 'name', 'year', 'revenue', 'ps', 'fcf', 'pfcf', 'profit', 'pe', 'dilution'],
      rows: adv,
    },
    {
      name: 'Overview scenarios',
      headers: ['name', 'from', 'to', 'description'],
      rows: [...data.overview.scenarios]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => [s.name, s.startYear, s.endYear, s.description ?? '']),
    },
    {
      name: 'Overview series',
      headers: [
        'scenario',
        'series',
        'type',
        'enabled',
        'baseChf',
        'ratePercent',
        'baseYear',
        'contributeUntil',
        'compoundUntil',
        'perpetualYearlyChf',
        'portfolio',
        'savingsAccount',
      ],
      rows: seriesRows,
    },
    {
      name: 'Overview bindings',
      headers: ['scenario', 'series', 'year', 'incomeCost', 'percent'],
      rows: bindRows,
    },
    {
      name: 'Runway',
      headers: ['scenario', 'from', 'mode', 'incomeCost', 'manualIncomeChf', 'drawMode', 'drawPercent', 'drawFixedChf'],
      rows: runwayRows,
    },
    {
      name: 'Goals',
      headers: ['name', 'year', 'amountChf'],
      rows: data.goals.map((g) => [g.name, g.year, g.amountChf]),
    },
    {
      name: 'Notes',
      headers: ['year', 'month', 'label'],
      rows: data.annotations.map((a) => [a.year, a.month ?? '', a.label]),
    },
    {
      name: 'Comparables',
      headers: ['set', 'scenario', 'basis'],
      rows: data.comparables.flatMap((c) =>
        c.entries.map((e) => [c.name, scenarioTicker(data, e.scenarioId), e.basis]),
      ),
    },
  ]
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colName(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function sheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'Sheet'
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  let i = 2
  while (used.has(`${name.slice(0, 28)}-${i}`)) i += 1
  name = `${name.slice(0, 28)}-${i}`
  used.add(name)
  return name
}

function cellXml(ref: string, value: Cell): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`
  }
  const text = escapeXml(String(value))
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
}

function worksheetXml(headers: string[], rows: Cell[][]): string {
  const all = [headers, ...rows]
  const lastCol = colName(Math.max(0, headers.length - 1))
  const lastRow = all.length
  const xmlRows: string[] = []
  for (let r = 0; r < all.length; r++) {
    const row = all[r]!
    const cells: string[] = []
    for (let c = 0; c < row.length; c++) {
      const xml = cellXml(`${colName(c)}${r + 1}`, row[c])
      if (xml) cells.push(xml)
    }
    xmlRows.push(`<row r="${r + 1}">${cells.join('')}</row>`)
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    `<sheetData>${xmlRows.join('')}</sheetData>` +
    `</worksheet>`
  )
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2)
  new DataView(b.buffer).setUint16(0, n, true)
  return b
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, true)
  return b
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Store-only ZIP (Excel accepts uncompressed OOXML). */
function zipStore(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.path)
    const crc = crc32(file.data)
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ])
    locals.push(local)
    centrals.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    )
    offset += local.length
  }
  const central = concat(centrals)
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ])
  return concat([...locals, central, eocd])
}

export function buildTableExportXlsx(data: AppDataSnapshot): Uint8Array {
  const encoder = new TextEncoder()
  const used = new Set<string>()
  const sheets = buildTableExportSheets(data).map((s) => ({
    ...s,
    name: sheetName(s.name, used),
  }))

  const files: { path: string; data: Uint8Array }[] = []
  const overrides = [
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
  ]
  const workbookSheets: string[] = []
  const workbookRels: string[] = []

  sheets.forEach((sheet, i) => {
    const n = i + 1
    files.push({
      path: `xl/worksheets/sheet${n}.xml`,
      data: encoder.encode(worksheetXml(sheet.headers, sheet.rows)),
    })
    overrides.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    workbookSheets.push(
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${n}" r:id="rId${n}"/>`,
    )
    workbookRels.push(
      `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
    )
  })

  files.push({
    path: '[Content_Types].xml',
    data: encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        overrides.join('') +
        `</Types>`,
    ),
  })
  files.push({
    path: '_rels/.rels',
    data: encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
  })
  files.push({
    path: 'xl/workbook.xml',
    data: encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${workbookSheets.join('')}</sheets>` +
        `</workbook>`,
    ),
  })
  files.push({
    path: 'xl/_rels/workbook.xml.rels',
    data: encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        workbookRels.join('') +
        `</Relationships>`,
    ),
  })

  return zipStore(files)
}

export function tableExportFileName(exportedAt: string): string {
  return `financial-model-tables-${exportedAt.slice(0, 10)}.xlsx`
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

export function downloadTableExport(snapshot?: AppDataSnapshot): void {
  const data = snapshot ?? collectAppData()
  const blob = new Blob([buildTableExportXlsx(data) as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(tableExportFileName(data.exportedAt), blob)
}

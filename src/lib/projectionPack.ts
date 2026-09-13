/**
 * Small JSON for sharing named stock projections (one or many tickers).
 * Import also accepts a full save file and pulls scenarios out of it.
 */
import type { SavedScenario } from '../types'
import { parseSaveFile } from './accountCatalog'
import { findBySymbolAndName, normalizeScenario } from './storage'

export const PROJECTION_PACK_KIND = 'grok-lab-projections'
export const PROJECTION_PACK_VERSION = 1 as const

export type ProjectionPack = {
  version: typeof PROJECTION_PACK_VERSION
  kind: typeof PROJECTION_PACK_KIND
  exportedAt: string
  /** Same-ticker pack; null when the file mixes tickers. */
  symbol: string | null
  scenarios: SavedScenario[]
}

export type ProjectionCandidate = {
  key: string
  scenario: SavedScenario
  accountName: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function withId(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  if (typeof raw.id === 'string' && raw.id) return raw
  return { ...raw, id: crypto.randomUUID() }
}

function toScenario(raw: unknown): SavedScenario | null {
  return normalizeScenario(withId(raw))
}

export function isProjectionPack(
  raw: unknown,
): raw is { kind: typeof PROJECTION_PACK_KIND; symbol?: unknown; scenarios: unknown[] } {
  return isRecord(raw) && raw.kind === PROJECTION_PACK_KIND && Array.isArray(raw.scenarios)
}

export function buildProjectionPack(scenarios: SavedScenario[]): ProjectionPack {
  const symbols = [
    ...new Set(scenarios.map((s) => s.symbol.toUpperCase())),
  ]
  return {
    version: PROJECTION_PACK_VERSION,
    kind: PROJECTION_PACK_KIND,
    exportedAt: new Date().toISOString(),
    symbol: symbols.length === 1 ? symbols[0]! : null,
    scenarios,
  }
}

function sanitizeFilePart(s: string): string {
  const t = s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return t || 'projection'
}

export function projectionPackFilename(pack: ProjectionPack): string {
  if (pack.scenarios.length === 1) {
    const s = pack.scenarios[0]!
    return `${sanitizeFilePart(s.symbol)}-${sanitizeFilePart(s.name)}.json`
  }
  if (pack.symbol) return `${sanitizeFilePart(pack.symbol)}-projections.json`
  return 'projections.json'
}

export function downloadProjectionPack(pack: ProjectionPack): void {
  const name = projectionPackFilename(pack)
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
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

export function parseProjectionFile(
  raw: unknown,
): { candidates: ProjectionCandidate[] } | { error: string } {
  if (!isRecord(raw)) return { error: 'Invalid file: not a JSON object' }

  if (isProjectionPack(raw)) {
    const symbol =
      typeof raw.symbol === 'string' && raw.symbol.trim()
        ? raw.symbol.trim().toUpperCase()
        : null
    const list = raw.scenarios
      .map(toScenario)
      .filter((s): s is SavedScenario => s != null)
      .filter((s) => !symbol || s.symbol === symbol)
    if (list.length === 0) return { error: 'This file has no projections.' }
    return {
      candidates: list.map((scenario, i) => ({
        key: `${scenario.id}:${i}`,
        scenario,
        accountName: null,
      })),
    }
  }

  const parsed = parseSaveFile(raw)
  if ('error' in parsed) return parsed

  if (parsed.kind === 'snapshot') {
    const list = parsed.snapshot.scenarios
      .map(toScenario)
      .filter((s): s is SavedScenario => s != null)
    if (list.length === 0) return { error: 'This file has no projections.' }
    return {
      candidates: list.map((scenario, i) => ({
        key: `${scenario.id}:${i}`,
        scenario,
        accountName: null,
      })),
    }
  }

  const multi = parsed.catalog.accounts.length > 1
  const candidates: ProjectionCandidate[] = []
  for (const acct of parsed.catalog.accounts) {
    acct.snapshot.scenarios.forEach((s, i) => {
      const scenario = toScenario(s)
      if (!scenario) return
      candidates.push({
        key: `${acct.id}:${scenario.id}:${i}`,
        scenario,
        accountName: multi ? acct.name : null,
      })
    })
  }
  if (candidates.length === 0) return { error: 'This file has no projections.' }
  return { candidates }
}

export async function readProjectionFileFromFile(
  file: File,
): Promise<{ candidates: ProjectionCandidate[] } | { error: string }> {
  try {
    return parseProjectionFile(JSON.parse(await file.text()))
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to read file',
    }
  }
}

/** Names matching this ticker; free name kept, else `Name (imported)`, then numbered. */
export function uniqueImportedName(
  scenarios: SavedScenario[],
  symbol: string,
  name: string,
): string {
  const trimmed = name.trim() || 'Base'
  if (!findBySymbolAndName(scenarios, symbol, trimmed)) return trimmed
  const tagged = `${trimmed} (imported)`
  if (!findBySymbolAndName(scenarios, symbol, tagged)) return tagged
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${trimmed} (imported ${n})`
    if (!findBySymbolAndName(scenarios, symbol, candidate)) return candidate
  }
  return `${trimmed} (imported ${Date.now()})`
}

/**
 * Always insert. Never overwrite an existing ticker+name.
 * New ids; destination rows are untouched.
 */
export function mergeImportedScenarios(
  current: SavedScenario[],
  incoming: SavedScenario[],
): { next: SavedScenario[]; imported: SavedScenario[] } {
  const next = [...current]
  const imported: SavedScenario[] = []
  const now = new Date().toISOString()
  for (const raw of incoming) {
    const normalized = toScenario(raw)
    if (!normalized) continue
    const created: SavedScenario = {
      ...normalized,
      id: crypto.randomUUID(),
      name: uniqueImportedName(next, normalized.symbol, normalized.name),
      createdAt: now,
      updatedAt: now,
    }
    next.push(created)
    imported.push(created)
  }
  return { next, imported }
}

/** Single ticker in the file → all. Mixed → those matching the open ticker. */
export function defaultImportSelection(
  candidates: ProjectionCandidate[],
  openSymbol: string | null,
): string[] {
  if (candidates.length === 0) return []
  const symbols = new Set(candidates.map((c) => c.scenario.symbol))
  if (symbols.size <= 1) return candidates.map((c) => c.key)
  const want = openSymbol?.toUpperCase() ?? null
  if (!want) return []
  return candidates.filter((c) => c.scenario.symbol === want).map((c) => c.key)
}

export function formatImportMessage(imported: SavedScenario[]): string {
  if (imported.length === 0) return 'No projections imported.'
  if (imported.length === 1) {
    const s = imported[0]!
    return `Added ${s.symbol} · ${s.name}`
  }
  return `Added ${imported.length} projections`
}

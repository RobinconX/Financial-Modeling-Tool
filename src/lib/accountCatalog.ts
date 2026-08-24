/**
 * Named full-model accounts on top of the live domain keys.
 * Inactive accounts live only in this catalog; hooks still read/write the selected model.
 */
import {
  applyAppDataToLocalStorage,
  collectAppData,
  emptyAppData,
  parseAppDataSnapshot,
  type AppDataSnapshot,
} from './appDataSnapshot'
import { withLinkedMirrorSuppressed } from './linkedMirrorGate'

export const ACCOUNT_CATALOG_KEY = 'grok-lab.accounts.v1'
export const DEFAULT_ACCOUNT_NAME = 'Mine'
export const EXAMPLE_ACCOUNT_ID = 'acct-example'
export const EXAMPLE_ACCOUNT_NAME = 'Example'
export const ACCOUNT_CATALOG_VERSION = 2 as const

export type AccountRecord = {
  id: string
  name: string
  snapshot: AppDataSnapshot
}

export type AccountCatalog = {
  version: typeof ACCOUNT_CATALOG_VERSION
  selectedId: string
  accounts: AccountRecord[]
}

export type ParsedSaveFile =
  | { kind: 'snapshot'; snapshot: AppDataSnapshot }
  | { kind: 'catalog'; catalog: AccountCatalog }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function newId(): string {
  return crypto.randomUUID()
}

export function wrapSnapshotAsCatalog(
  snapshot: AppDataSnapshot,
  name = DEFAULT_ACCOUNT_NAME,
  id?: string,
): AccountCatalog {
  const accountId = id ?? newId()
  return {
    version: ACCOUNT_CATALOG_VERSION,
    selectedId: accountId,
    accounts: [{ id: accountId, name: name.trim() || DEFAULT_ACCOUNT_NAME, snapshot }],
  }
}

export function parseSaveFile(raw: unknown): ParsedSaveFile | { error: string } {
  if (!isRecord(raw)) return { error: 'Invalid file: not a JSON object' }

  if (raw.version === ACCOUNT_CATALOG_VERSION && Array.isArray(raw.accounts)) {
    const accounts: AccountRecord[] = []
    for (const item of raw.accounts) {
      if (!isRecord(item)) continue
      const snapRaw = item.snapshot ?? item
      const snap = parseAppDataSnapshot(snapRaw)
      if ('error' in snap) continue
      const id = typeof item.id === 'string' && item.id ? item.id : newId()
      const name =
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : DEFAULT_ACCOUNT_NAME
      accounts.push({ id, name, snapshot: snap })
    }
    if (accounts.length === 0) {
      return { error: 'Save file has no accounts' }
    }
    let selectedId =
      typeof raw.selectedId === 'string' ? raw.selectedId : accounts[0]!.id
    if (!accounts.some((a) => a.id === selectedId)) {
      selectedId = accounts[0]!.id
    }
    return {
      kind: 'catalog',
      catalog: { version: ACCOUNT_CATALOG_VERSION, selectedId, accounts },
    }
  }

  const snap = parseAppDataSnapshot(raw)
  if ('error' in snap) return snap
  return { kind: 'snapshot', snapshot: snap }
}

/** Linked file / Export all: v1 snapshot when one account, v2 envelope when several. */
/** True when this snapshot is more than a blank first-run model. */
export function isSnapshotPopulated(s: AppDataSnapshot): boolean {
  if (s.scenarios.length > 0 || s.portfolios.length > 0) return true
  if (s.incomeCost.lines.length > 0 || (s.incomeCost.draws?.length ?? 0) > 0) return true
  if ((s.comparables?.length ?? 0) > 0) return true
  if ((s.goals?.length ?? 0) > 0) return true
  if ((s.annotations?.length ?? 0) > 0) return true
  for (const acc of s.savings.accounts) {
    if (Object.values(acc.actuals).some((v) => Number(v) > 0)) return true
    if (acc.contribution > 0) return true
  }
  for (const sc of s.overview.scenarios) {
    for (const row of sc.series) {
      if (row.type === 'portfolio' || row.type === 'manual') return true
      if (row.type === 'incomeLeftover' && (row.baseChf ?? 0) > 0) return true
    }
  }
  return false
}

function withPopulatedSelection(catalog: AccountCatalog): AccountCatalog {
  const selected = catalog.accounts.find((a) => a.id === catalog.selectedId)
  if (selected && isSnapshotPopulated(selected.snapshot)) return catalog
  const rich = catalog.accounts.find((a) => isSnapshotPopulated(a.snapshot))
  if (!rich) return catalog
  return { ...catalog, selectedId: rich.id }
}

/**
 * Startup / Allow-access: linked file wins when it has data, otherwise keep
 * localStorage. Never overlay an empty file on a populated browser copy.
 */
export function resolveStartupSave(
  parsed: ParsedSaveFile,
  live: AppDataSnapshot,
): ParsedSaveFile {
  const liveRich = isSnapshotPopulated(live)
  if (parsed.kind === 'snapshot') {
    if (!isSnapshotPopulated(parsed.snapshot) && liveRich) {
      return { kind: 'snapshot', snapshot: live }
    }
    return parsed
  }
  const preferred = withPopulatedSelection(parsed.catalog)
  const anyRich = preferred.accounts.some((a) => isSnapshotPopulated(a.snapshot))
  if (!anyRich && liveRich) {
    return { kind: 'snapshot', snapshot: live }
  }
  return { kind: 'catalog', catalog: preferred }
}

function rememberSnapshot(snapshot: AppDataSnapshot): void {
  const cat = loadCatalog()
  if (!cat || cat.accounts.length === 0) {
    saveCatalog(wrapSnapshotAsCatalog(snapshot))
    return
  }
  if (cat.accounts.length === 1) {
    saveCatalog({
      ...cat,
      accounts: [{ ...cat.accounts[0]!, snapshot }],
    })
    return
  }
  saveCatalog({
    ...cat,
    accounts: cat.accounts.map((a) =>
      a.id === cat.selectedId ? { ...a, snapshot } : a,
    ),
  })
}

export function serializeSaveFile(catalog: AccountCatalog): unknown {
  if (catalog.accounts.length <= 1) {
    return catalog.accounts[0]?.snapshot ?? emptyAppData()
  }
  return {
    version: ACCOUNT_CATALOG_VERSION,
    selectedId: catalog.selectedId,
    accounts: catalog.accounts,
  }
}

export function nextAccountName(existing: string[]): string {
  const names = new Set(existing.map((n) => n.trim().toLowerCase()))
  let n = 2
  while (names.has(`account ${n}`)) n += 1
  return `Account ${n}`
}

export function loadCatalog(): AccountCatalog | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_CATALOG_KEY)
    if (!raw) return null
    const parsed = parseSaveFile(JSON.parse(raw))
    if ('error' in parsed) return null
    if (parsed.kind === 'catalog') return parsed.catalog
    return wrapSnapshotAsCatalog(parsed.snapshot)
  } catch {
    return null
  }
}

export function saveCatalog(catalog: AccountCatalog): void {
  localStorage.setItem(ACCOUNT_CATALOG_KEY, JSON.stringify(catalog))
}

export function ensureCatalog(): AccountCatalog {
  const existing = loadCatalog()
  if (existing && existing.accounts.length > 0) return existing
  const created = wrapSnapshotAsCatalog(collectAppData())
  saveCatalog(created)
  return created
}

export function syncLiveIntoCatalog(): AccountCatalog {
  const cat = ensureCatalog()
  const live = collectAppData()
  const next: AccountCatalog = {
    ...cat,
    accounts: cat.accounts.map((a) =>
      a.id === cat.selectedId ? { ...a, snapshot: live } : a,
    ),
  }
  saveCatalog(next)
  return next
}

export function payloadForLinkedFile(): unknown {
  const cat = loadCatalog()
  if (!cat || cat.accounts.length <= 1) {
    if (cat && cat.accounts.length === 1) {
      const live = collectAppData()
      saveCatalog({
        ...cat,
        accounts: [{ ...cat.accounts[0]!, snapshot: live }],
      })
      return live
    }
    return collectAppData()
  }
  return serializeSaveFile(syncLiveIntoCatalog())
}

export function applyLoadedSave(
  parsed: ParsedSaveFile,
): { ok: true } | { ok: false; error: string } {
  return withLinkedMirrorSuppressed(() => {
    if (parsed.kind === 'snapshot') {
      const applied = applyAppDataToLocalStorage(parsed.snapshot)
      if (!applied.ok) return applied
      rememberSnapshot(parsed.snapshot)
      return { ok: true }
    }
    saveCatalog(parsed.catalog)
    const selected =
      parsed.catalog.accounts.find((a) => a.id === parsed.catalog.selectedId) ??
      parsed.catalog.accounts[0]!
    return applyAppDataToLocalStorage(selected.snapshot)
  })
}

/** First paint / Allow file access — keep live data if the file is empty. */
export function hydrateOnStartup(
  parsed: ParsedSaveFile,
): { ok: true } | { ok: false; error: string } {
  return applyLoadedSave(resolveStartupSave(parsed, collectAppData()))
}

/** First-run demo model. Always one account named Example. */
export function applyExampleSnapshot(
  snapshot: AppDataSnapshot,
): { ok: true } | { ok: false; error: string } {
  return withLinkedMirrorSuppressed(() => {
    const applied = applyAppDataToLocalStorage(snapshot)
    if (!applied.ok) return applied
    saveCatalog(wrapSnapshotAsCatalog(snapshot, EXAMPLE_ACCOUNT_NAME, EXAMPLE_ACCOUNT_ID))
    return { ok: true }
  })
}

export function selectedAccount(catalog: AccountCatalog): AccountRecord {
  return (
    catalog.accounts.find((a) => a.id === catalog.selectedId) ?? catalog.accounts[0]!
  )
}

/** Name under the app title only when more than one account exists. */
export function getAccountHint(): { name: string; count: number } | null {
  const cat = loadCatalog()
  if (!cat || cat.accounts.length < 2) return null
  return { name: selectedAccount(cat).name, count: cat.accounts.length }
}

export function renameAccount(id: string, name: string): AccountCatalog {
  const cat = ensureCatalog()
  const trimmed = name.trim() || DEFAULT_ACCOUNT_NAME
  const next: AccountCatalog = {
    ...cat,
    accounts: cat.accounts.map((a) => (a.id === id ? { ...a, name: trimmed } : a)),
  }
  saveCatalog(next)
  return next
}

export function addAccount(opts: {
  name: string
  snapshot: AppDataSnapshot
  select?: boolean
}): AccountCatalog {
  const cat = syncLiveIntoCatalog()
  const id = newId()
  const record: AccountRecord = {
    id,
    name: opts.name.trim() || nextAccountName(cat.accounts.map((a) => a.name)),
    snapshot: opts.snapshot,
  }
  const next: AccountCatalog = {
    ...cat,
    selectedId: opts.select === false ? cat.selectedId : id,
    accounts: [...cat.accounts, record],
  }
  saveCatalog(next)
  if (opts.select !== false) {
    applyAppDataToLocalStorage(record.snapshot)
  }
  return next
}

export function duplicateAccount(id: string): AccountCatalog | { error: string } {
  const cat = syncLiveIntoCatalog()
  const src = cat.accounts.find((a) => a.id === id)
  if (!src) return { error: 'Unknown account' }
  const copySnap = JSON.parse(JSON.stringify(src.snapshot)) as AppDataSnapshot
  copySnap.exportedAt = new Date().toISOString()
  return addAccount({
    name: `Copy of ${src.name}`,
    snapshot: copySnap,
    select: true,
  })
}

export function createEmptyAccount(name?: string): AccountCatalog {
  const cat = syncLiveIntoCatalog()
  return addAccount({
    name: name?.trim() || nextAccountName(cat.accounts.map((a) => a.name)),
    snapshot: emptyAppData(),
    select: false,
  })
}

export function switchAccount(id: string): { ok: true } | { ok: false; error: string } {
  const cat = syncLiveIntoCatalog()
  if (id === cat.selectedId) return { ok: true }
  const target = cat.accounts.find((a) => a.id === id)
  if (!target) return { ok: false, error: 'Unknown account' }
  const next: AccountCatalog = { ...cat, selectedId: id }
  saveCatalog(next)
  const applied = applyAppDataToLocalStorage(target.snapshot)
  if (!applied.ok) return applied
  return { ok: true }
}

export function deleteAccount(id: string): AccountCatalog | { error: string } {
  const cat = syncLiveIntoCatalog()
  if (cat.accounts.length <= 1) return { error: 'Keep at least one account' }
  const remaining = cat.accounts.filter((a) => a.id !== id)
  if (remaining.length === cat.accounts.length) return { error: 'Unknown account' }
  const selectedId =
    cat.selectedId === id ? remaining[0]!.id : cat.selectedId
  const next: AccountCatalog = { ...cat, selectedId, accounts: remaining }
  saveCatalog(next)
  if (selectedId !== cat.selectedId) {
    const sel = remaining.find((a) => a.id === selectedId)!
    applyAppDataToLocalStorage(sel.snapshot)
  }
  return next
}

export function replaceSelectedSnapshot(snapshot: AppDataSnapshot): { ok: true } | { ok: false; error: string } {
  return withLinkedMirrorSuppressed(() => {
    const applied = applyAppDataToLocalStorage(snapshot)
    if (!applied.ok) return applied
    const cat = ensureCatalog()
    saveCatalog({
      ...cat,
      accounts: cat.accounts.map((a) =>
        a.id === cat.selectedId ? { ...a, snapshot } : a,
      ),
    })
    return { ok: true }
  })
}

export function suggestedImportName(fileName: string): string {
  const base = fileName.replace(/\.json$/i, '').trim()
  const cleaned = base
    .replace(/^financial-model(-export|-save)?-?/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}$/, '')
    .trim()
  return cleaned || 'Imported'
}

function triggerDownload(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/** Whole-file backup (v2 envelope when 2+ accounts). */
export async function readSaveFileFromFile(
  file: File,
): Promise<ParsedSaveFile | { error: string }> {
  try {
    return parseSaveFile(JSON.parse(await file.text()))
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to read file',
    }
  }
}

export function downloadAllAccountsExport(): void {
  const cat = syncLiveIntoCatalog()
  const data = serializeSaveFile(cat)
  const day = new Date().toISOString().slice(0, 10)
  const name =
    cat.accounts.length <= 1
      ? `financial-model-export-${day}.json`
      : `financial-model-save-${day}.json`
  triggerDownload(data, name)
}

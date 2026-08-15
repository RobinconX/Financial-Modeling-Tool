/**
 * Unified app data snapshot for Export / Import and linked data file.
 * Source of truth domains stay in their own loaders; this package is the portable envelope.
 */
import type {
  IncomeCostState,
  OverviewState,
  ChartAnnotation,
  SavedComparable,
  SavedPortfolio,
  SavedScenario,
  SavingsState,
} from '../types'
import { loadScenarios, saveScenarios } from './storage'
import { loadPortfolios, savePortfolios } from './portfolioStorage'
import { loadIncomeCost, saveIncomeCost } from './incomeCostStorage'
import { loadSavings, saveSavings } from './savingsStorage'
import { loadOverview, saveOverview } from './overviewStorage'
import { loadComparables, saveComparables } from './comparablesStorage'
import { loadAnnotations, saveAnnotations } from './annotationsStorage'
import { normalizeChartAnnotation } from './annotations'
import { withLinkedMirrorSuppressed } from './linkedMirrorGate'

export const APP_DATA_FILE_NAME = 'financial-model.json'
export const APP_DATA_SNAPSHOT_VERSION = 1 as const

export type AppDataSnapshot = {
  version: typeof APP_DATA_SNAPSHOT_VERSION
  exportedAt: string
  scenarios: SavedScenario[]
  portfolios: SavedPortfolio[]
  incomeCost: IncomeCostState
  savings: SavingsState
  overview: OverviewState
  comparables: SavedComparable[]
  annotations: ChartAnnotation[]
}

export function collectAppData(): AppDataSnapshot {
  return {
    version: APP_DATA_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    scenarios: loadScenarios(),
    portfolios: loadPortfolios(),
    incomeCost: loadIncomeCost(),
    savings: loadSavings(),
    overview: loadOverview(),
    comparables: loadComparables(),
    annotations: loadAnnotations(),
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Parse and lightly validate a snapshot from JSON. */
export function parseAppDataSnapshot(raw: unknown): AppDataSnapshot | { error: string } {
  if (!isRecord(raw)) return { error: 'Invalid file: not a JSON object' }
  if (raw.version !== 1 && raw.version !== APP_DATA_SNAPSHOT_VERSION) {
    // Accept missing version only if domains look present
    if (raw.version != null && raw.version !== 1) {
      return { error: `Unsupported snapshot version: ${String(raw.version)}` }
    }
  }
  if (!Array.isArray(raw.scenarios)) return { error: 'Invalid file: missing scenarios' }
  if (!Array.isArray(raw.portfolios)) return { error: 'Invalid file: missing portfolios' }
  if (!isRecord(raw.incomeCost)) return { error: 'Invalid file: missing incomeCost' }
  if (!isRecord(raw.savings)) return { error: 'Invalid file: missing savings' }
  if (!isRecord(raw.overview)) return { error: 'Invalid file: missing overview' }

  return {
    version: APP_DATA_SNAPSHOT_VERSION,
    exportedAt:
      typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    scenarios: raw.scenarios as SavedScenario[],
    portfolios: raw.portfolios as SavedPortfolio[],
    incomeCost: raw.incomeCost as IncomeCostState,
    savings: raw.savings as SavingsState,
    overview: raw.overview as OverviewState,
    comparables: Array.isArray(raw.comparables)
      ? (raw.comparables as SavedComparable[])
      : [],
    annotations: Array.isArray(raw.annotations)
      ? raw.annotations
          .map(normalizeChartAnnotation)
          .filter((a): a is ChartAnnotation => a != null)
      : [],
  }
}

/**
 * Write snapshot into browser localStorage via existing domain savers.
 * Does not update React state — caller should remountApp() (or reload) after import.
 * Suppresses linked-file mirror so hydrate/import does not immediately re-prompt for write.
 */
export function applyAppDataToLocalStorage(
  snapshot: AppDataSnapshot,
): { ok: true } | { ok: false; error: string } {
  return withLinkedMirrorSuppressed(() => {
    const r1 = saveScenarios(snapshot.scenarios)
    if (!r1.ok) return { ok: false, error: r1.error }

    const r2 = savePortfolios(snapshot.portfolios)
    if (!r2.ok) return { ok: false, error: r2.error }

    const r3 = saveIncomeCost(snapshot.incomeCost)
    if (!r3.ok) return { ok: false, error: r3.error }

    const r4 = saveSavings(snapshot.savings)
    if (!r4.ok) return { ok: false, error: r4.error }

    const r5 = saveOverview(snapshot.overview)
    if (!r5.ok) return { ok: false, error: r5.error }

    const r6 = saveComparables(snapshot.comparables ?? [])
    if (!r6.ok) return { ok: false, error: r6.error }

    const r7 = saveAnnotations(snapshot.annotations ?? [])
    if (!r7.ok) return { ok: false, error: r7.error }

    return { ok: true }
  })
}

export function downloadAppDataExport(snapshot?: AppDataSnapshot): void {
  const data = snapshot ?? collectAppData()
  const name = `financial-model-export-${data.exportedAt.slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  // iOS Safari often needs the node in the DOM and a user gesture (caller provides gesture)
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Delay revoke so iOS can start the download/share pipeline
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/**
 * Prefer the system Share sheet on mobile (Save to Files / AirDrop).
 * Falls back to a normal download when Share is unavailable.
 */
export async function exportAppData(snapshot?: AppDataSnapshot): Promise<
  { ok: true; method: 'share' | 'download' } | { ok: false; error: string }
> {
  try {
    const data = snapshot ?? collectAppData()
    const name = `financial-model-export-${data.exportedAt.slice(0, 10)}.json`
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const file = new File([blob], name, { type: 'application/json' })

    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
    }

    if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
      try {
        if (nav.canShare({ files: [file] })) {
          await nav.share({
            files: [file],
            title: 'Financial model backup',
            text: name,
          })
          return { ok: true, method: 'share' }
        }
      } catch (e) {
        // User cancelled share — not an error for the app
        if (e instanceof DOMException && e.name === 'AbortError') {
          return { ok: true, method: 'share' }
        }
        // Fall through to download
      }
    }

    downloadAppDataExport(data)
    return { ok: true, method: 'download' }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Export failed',
    }
  }
}

export async function readSnapshotFromFile(
  file: File,
): Promise<AppDataSnapshot | { error: string }> {
  try {
    const text = await file.text()
    const json: unknown = JSON.parse(text)
    return parseAppDataSnapshot(json)
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to read file',
    }
  }
}

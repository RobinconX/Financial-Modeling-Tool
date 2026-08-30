import type { ChartAnnotation } from '../types'
import { normalizeChartAnnotation } from './annotations'
import { queueAppDataChanged } from './linkedMirrorGate'

export const ANNOTATIONS_STORAGE_KEY = 'grok-lab.chart-annotations.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function loadAnnotations(): ChartAnnotation[] {
  try {
    const raw = localStorage.getItem(ANNOTATIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.annotations)) {
      console.warn('[annotationsStorage] Invalid payload; resetting')
      return []
    }
    return parsed.annotations
      .map(normalizeChartAnnotation)
      .filter((a): a is ChartAnnotation => a != null)
      .sort((a, b) => a.year - b.year || a.label.localeCompare(b.label))
  } catch (err) {
    console.warn('[annotationsStorage] Failed to load', err)
    return []
  }
}

export function saveAnnotations(
  annotations: ChartAnnotation[],
): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(
      ANNOTATIONS_STORAGE_KEY,
      JSON.stringify({ version: 1, annotations }),
    )
    queueAppDataChanged()
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'QuotaExceededError'
        ? 'Browser storage is full.'
        : err instanceof Error
          ? err.message
          : 'Failed to save notes'
    return { ok: false, error: message }
  }
}
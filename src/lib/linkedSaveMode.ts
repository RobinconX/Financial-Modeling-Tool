/** Linked-file auto-save preference. Lives in the save JSON and a localStorage cache. */

export const LINKED_SAVE_MODE_KEY = 'grok-lab-linked-save-mode'
export type LinkedSaveMode = 'edits-periodic' | 'edits'

let memorySaveMode: LinkedSaveMode | null = null

export function parseLinkedSaveMode(raw: unknown): LinkedSaveMode | undefined {
  if (raw === 'edits' || raw === 'edits-periodic') return raw
  return undefined
}

export function getLinkedSaveMode(): LinkedSaveMode {
  try {
    const v = localStorage.getItem(LINKED_SAVE_MODE_KEY)
    if (v === 'edits' || v === 'edits-periodic') return v
  } catch {
    /* ignore */
  }
  return memorySaveMode ?? 'edits-periodic'
}

/** Apply from a save file or UI. Does not write the linked file. */
export function applyLinkedSaveMode(mode: LinkedSaveMode): void {
  memorySaveMode = mode
  try {
    localStorage.setItem(LINKED_SAVE_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}
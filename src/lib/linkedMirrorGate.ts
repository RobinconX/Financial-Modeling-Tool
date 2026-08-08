/**
 * Gate for linked-file auto-save. Tiny module with no imports so hydrate/import
 * can suppress mirrors without circular deps (domain savers → dataSync → …).
 */

let suppressCount = 0

export function withLinkedMirrorSuppressed<T>(fn: () => T): T {
  suppressCount += 1
  try {
    return fn()
  } finally {
    suppressCount -= 1
  }
}

export function isLinkedMirrorSuppressed(): boolean {
  return suppressCount > 0
}

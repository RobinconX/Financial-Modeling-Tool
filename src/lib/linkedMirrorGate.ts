/**
 * Gate for linked-file auto-save. No static imports so hydrate/import
 * can suppress mirrors without circular deps (domain savers → dataSync → …).
 *
 * Domain savers must call queueAppDataChanged() so the suppress check runs
 * at save time. `import('./dataSync').then(notify)` after hydrate would
 * fire once suppress is already off and rewrite the linked file on refresh.
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

/** After a localStorage domain write: mirror to the linked file unless suppressed. */
export function queueAppDataChanged(): void {
  if (suppressCount > 0) return
  void import('./dataSync').then((m) => m.notifyAppDataChanged())
}

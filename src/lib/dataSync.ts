/**
 * Cross-cutting save hook: after any domain persists to localStorage,
 * optionally mirror into the user-linked data file.
 */
import { isLinkedMirrorSuppressed } from './linkedMirrorGate'
import { notifyAppDataChanged as notifyLinked } from './linkedDataFile'

export { withLinkedMirrorSuppressed } from './linkedMirrorGate'

export function notifyAppDataChanged(): void {
  if (isLinkedMirrorSuppressed()) return
  notifyLinked()
}

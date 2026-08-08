/**
 * Cross-cutting save hook: after any domain persists to localStorage,
 * optionally mirror into the user-linked data file.
 */
import { notifyAppDataChanged } from './linkedDataFile'

export { notifyAppDataChanged }

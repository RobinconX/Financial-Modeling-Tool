/**
 * User-chosen data file (File System Access API).
 * App data lives in the JSON file + localStorage mirror — never in IndexedDB.
 * IndexedDB is used only to remember the FileSystemFileHandle between sessions
 * (the browser API requires it; Chromium).
 */
import {
  APP_DATA_FILE_NAME,
  applyAppDataToLocalStorage,
  collectAppData,
  parseAppDataSnapshot,
  type AppDataSnapshot,
} from './appDataSnapshot'

/** Minimal typings — not all TS DOM libs include File System Access yet. */
type FsPermissionMode = 'read' | 'readwrite'
type FsFileHandle = {
  name: string
  queryPermission?: (opts: { mode?: FsPermissionMode }) => Promise<PermissionState>
  requestPermission?: (opts: { mode?: FsPermissionMode }) => Promise<PermissionState>
  getFile: () => Promise<File>
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>
    close: () => Promise<void>
  }>
}

const IDB_NAME = 'fmt-meta-handles'
const IDB_STORE = 'handles'
const IDB_KEY = 'dataFile'

/** Session access to the remembered handle (Chromium resets this each load). */
export type LinkedFilePermission = 'none' | 'granted' | 'prompt' | 'denied'

export type LinkedFileStatus = {
  supported: boolean
  /**
   * True when a file handle is remembered (linked), even if this session
   * still needs the user to Allow access.
   */
  linked: boolean
  /** Whether we can read/write the file in this browser session. */
  permission: LinkedFilePermission
  fileName: string | null
  lastError: string | null
}

type FsWindow = Window & {
  showOpenFilePicker?: (opts?: unknown) => Promise<FsFileHandle[]>
  showSaveFilePicker?: (opts?: unknown) => Promise<FsFileHandle>
}

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as FsWindow
  return typeof w.showSaveFilePicker === 'function' && typeof w.showOpenFilePicker === 'function'
}

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

async function idbGetHandle(): Promise<FsFileHandle | null> {
  try {
    const db = await openMetaDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const store = tx.objectStore(IDB_STORE)
      const req = store.get(IDB_KEY)
      req.onsuccess = () => {
        const v = req.result
        resolve((v as FsFileHandle) ?? null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbSetHandle(handle: FsFileHandle | null): Promise<void> {
  const db = await openMetaDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    if (handle) store.put(handle, IDB_KEY)
    else store.delete(IDB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function ensurePermission(
  handle: FsFileHandle,
  mode: FsPermissionMode,
): Promise<boolean> {
  const opts = { mode }
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  if ((await handle.requestPermission?.(opts)) === 'granted') return true
  return false
}

let cachedHandle: FsFileHandle | null = null
let lastError: string | null = null

/**
 * Query-only status. Does not call requestPermission (that needs a user gesture
 * and was making the UI flash "Not linked" until a full refresh + second grant).
 */
export async function getLinkedFileStatus(): Promise<LinkedFileStatus> {
  const supported = isFileSystemAccessSupported()
  if (!supported) {
    return {
      supported: false,
      linked: false,
      permission: 'none',
      fileName: null,
      lastError: null,
    }
  }
  if (!cachedHandle) {
    cachedHandle = await idbGetHandle()
  }
  if (!cachedHandle) {
    return {
      supported: true,
      linked: false,
      permission: 'none',
      fileName: null,
      lastError: lastError,
    }
  }

  const permission = await queryPermissionState(cachedHandle, 'readwrite')
  if (permission === 'granted') {
    return {
      supported: true,
      linked: true,
      permission: 'granted',
      fileName: cachedHandle.name,
      lastError: lastError,
    }
  }

  return {
    supported: true,
    linked: true,
    permission,
    fileName: cachedHandle.name,
    lastError:
      lastError ??
      (permission === 'denied'
        ? 'File access denied — use Open / link file… to pick it again'
        : 'Click Allow file access to reconnect this session'),
  }
}

async function queryPermissionState(
  handle: FsFileHandle,
  mode: FsPermissionMode,
): Promise<LinkedFilePermission> {
  if (!handle.queryPermission) return 'prompt'
  try {
    const state = await handle.queryPermission({ mode })
    if (state === 'granted') return 'granted'
    if (state === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'prompt'
  }
}

/**
 * Request read+write on the remembered handle. Must run from a click/tap.
 * Optionally re-loads the file into localStorage when access is granted.
 */
export async function requestLinkedFileAccess(options?: {
  reloadFromFile?: boolean
}): Promise<
  | { ok: true; fileName: string; reloaded: boolean }
  | { ok: false; error: string }
> {
  if (!cachedHandle) {
    cachedHandle = await idbGetHandle()
  }
  if (!cachedHandle) {
    return { ok: false, error: 'No data file linked' }
  }
  const granted = await ensurePermission(cachedHandle, 'readwrite')
  if (!granted) {
    lastError = 'Permission denied'
    return { ok: false, error: 'Permission denied — choose the file again with Open / link' }
  }
  lastError = null

  let reloaded = false
  if (options?.reloadFromFile !== false) {
    const snap = await readLinkedSnapshot()
    if (snap && !('error' in snap)) {
      const applied = applyAppDataToLocalStorage(snap)
      if (applied.ok) reloaded = true
    } else if (snap && 'error' in snap) {
      return { ok: false, error: snap.error }
    }
  }

  return { ok: true, fileName: cachedHandle.name, reloaded }
}

/**
 * Open / re-attach a data file.
 * - Non-empty valid file → load into localStorage (never overwrite with browser state).
 * - Empty file → seed with current browser data.
 * createWritable() truncates immediately, so we must read before any write.
 */
export async function linkDataFile(): Promise<
  | { ok: true; fileName: string; action: 'loaded' | 'seeded' }
  | { ok: false; error: string }
> {
  if (!isFileSystemAccessSupported()) {
    return {
      ok: false,
      error: 'This browser cannot link a file. Use Export / Import instead (works everywhere).',
    }
  }
  try {
    cancelPendingLinkedWrite()

    let handle: FsFileHandle
    const w = window as FsWindow
    try {
      const [h] = await w.showOpenFilePicker!({
        multiple: false,
        types: [
          {
            description: 'Financial model JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })
      handle = h
    } catch (openErr) {
      if (openErr instanceof DOMException && openErr.name === 'AbortError') {
        return { ok: false, error: 'Cancelled' }
      }
      // Fallback: create new file
      handle = await w.showSaveFilePicker!({
        suggestedName: APP_DATA_FILE_NAME,
        types: [
          {
            description: 'Financial model JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })
    }

    const canWrite = await ensurePermission(handle, 'readwrite')
    if (!canWrite) {
      return { ok: false, error: 'Write permission denied' }
    }

    // Read first — never seed-over an existing snapshot
    const file = await handle.getFile()
    const text = await file.text()

    if (text.trim()) {
      let parsed: AppDataSnapshot | { error: string }
      try {
        parsed = parseAppDataSnapshot(JSON.parse(text) as unknown)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'File is not valid JSON'
        lastError = msg
        return { ok: false, error: msg }
      }
      if ('error' in parsed) {
        lastError = parsed.error
        return { ok: false, error: parsed.error }
      }

      cachedHandle = handle
      await idbSetHandle(handle)
      lastError = null

      const applied = applyAppDataToLocalStorage(parsed)
      if (!applied.ok) {
        cachedHandle = null
        try {
          await idbSetHandle(null)
        } catch {
          /* ignore */
        }
        return { ok: false, error: applied.error }
      }

      return { ok: true, fileName: handle.name, action: 'loaded' }
    }

    // Empty file only — write current browser data into it
    cachedHandle = handle
    await idbSetHandle(handle)
    lastError = null

    const writeResult = await writeLinkedSnapshot(collectAppData())
    if (!writeResult.ok) return writeResult

    return { ok: true, fileName: handle.name, action: 'seeded' }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'Cancelled' }
    }
    const msg = e instanceof Error ? e.message : 'Failed to link file'
    lastError = msg
    return { ok: false, error: msg }
  }
}

/** Create a new data file (overwrite / new path). */
export async function createDataFile(): Promise<
  { ok: true; fileName: string } | { ok: false; error: string }
> {
  if (!isFileSystemAccessSupported()) {
    return {
      ok: false,
      error: 'This browser cannot create a linked file. Use Export instead.',
    }
  }
  try {
    const w = window as FsWindow
    const handle = await w.showSaveFilePicker!({
      suggestedName: APP_DATA_FILE_NAME,
      types: [
        {
          description: 'Financial model JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    })
    const canWrite = await ensurePermission(handle, 'readwrite')
    if (!canWrite) return { ok: false, error: 'Write permission denied' }
    cachedHandle = handle
    await idbSetHandle(handle)
    lastError = null
    const writeResult = await writeLinkedSnapshot(collectAppData())
    if (!writeResult.ok) return writeResult
    return { ok: true, fileName: handle.name }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'Cancelled' }
    }
    const msg = e instanceof Error ? e.message : 'Failed to create file'
    lastError = msg
    return { ok: false, error: msg }
  }
}

export async function unlinkDataFile(): Promise<void> {
  cancelPendingLinkedWrite()
  cachedHandle = null
  lastError = null
  try {
    await idbSetHandle(null)
  } catch {
    /* ignore */
  }
}

export async function writeLinkedSnapshot(
  snapshot?: AppDataSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!cachedHandle) {
    cachedHandle = await idbGetHandle()
  }
  if (!cachedHandle) {
    return { ok: false, error: 'No data file linked' }
  }
  try {
    const canWrite = await ensurePermission(cachedHandle, 'readwrite')
    if (!canWrite) {
      return { ok: false, error: 'Write permission denied — re-link the data file' }
    }
    const data = snapshot ?? collectAppData()
    const writable = await cachedHandle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
    lastError = null
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to write data file'
    lastError = msg
    return { ok: false, error: msg }
  }
}

export async function readLinkedSnapshot(): Promise<
  AppDataSnapshot | { error: string } | null
> {
  if (!cachedHandle) {
    cachedHandle = await idbGetHandle()
  }
  if (!cachedHandle) return null
  try {
    // Prefer readwrite so one Allow covers later autosave (avoids a second "edit" prompt).
    let canRead = await ensurePermission(cachedHandle, 'readwrite')
    if (!canRead) canRead = await ensurePermission(cachedHandle, 'read')
    if (!canRead) {
      return { error: 'Read permission denied — re-link the data file' }
    }
    const file = await cachedHandle.getFile()
    const text = await file.text()
    if (!text.trim()) {
      // Empty new file — treat as no data yet
      return null
    }
    return parseAppDataSnapshot(JSON.parse(text))
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to read data file',
    }
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null
/** True while a debounce window is open (pending → until write finishes). */
let debounceActive = false

function cancelPendingLinkedWrite(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  debounceActive = false
}

export type LinkedFileSaveEvent = {
  status: 'pending' | 'saving' | 'saved' | 'error' | 'idle'
  /** Short label for UI toast */
  message: string
  fileName?: string | null
}

type SaveListener = (event: LinkedFileSaveEvent) => void
const saveListeners = new Set<SaveListener>()

export function subscribeLinkedFileSave(listener: SaveListener): () => void {
  saveListeners.add(listener)
  return () => {
    saveListeners.delete(listener)
  }
}

function emitSaveEvent(event: LinkedFileSaveEvent): void {
  for (const fn of saveListeners) {
    try {
      fn(event)
    } catch {
      /* ignore listener errors */
    }
  }
}

/** Wait this long after the last edit before writing the linked file. */
export const LINKED_FILE_SAVE_DEBOUNCE_MS = 4000

/** Debounced write of current localStorage snapshot to the linked file. */
export function scheduleLinkedFileWrite(
  delayMs = LINKED_FILE_SAVE_DEBOUNCE_MS,
): void {
  if (writeTimer) clearTimeout(writeTimer)
  // Announce “pending” only once per save cycle (not every keystroke)
  if (!debounceActive) {
    debounceActive = true
    void (async () => {
      if (!cachedHandle) cachedHandle = await idbGetHandle()
      if (!cachedHandle) {
        debounceActive = false
        return
      }
      emitSaveEvent({
        status: 'pending',
        message: 'Will save after you pause editing…',
        fileName: cachedHandle.name,
      })
    })()
  }
  writeTimer = setTimeout(() => {
    writeTimer = null
    void (async () => {
      if (!cachedHandle) cachedHandle = await idbGetHandle()
      if (!cachedHandle) {
        debounceActive = false
        return
      }
      emitSaveEvent({
        status: 'saving',
        message: 'Saving to data file…',
        fileName: cachedHandle.name,
      })
      const result = await writeLinkedSnapshot()
      debounceActive = false
      if (result.ok) {
        emitSaveEvent({
          status: 'saved',
          message: `Saved · ${cachedHandle.name}`,
          fileName: cachedHandle.name,
        })
      } else {
        emitSaveEvent({
          status: 'error',
          message: result.error,
          fileName: cachedHandle?.name,
        })
      }
    })()
  }, delayMs)
}

/** Call from domain savers after successful localStorage write. */
export function notifyAppDataChanged(): void {
  scheduleLinkedFileWrite()
}

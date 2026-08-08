/**
 * User-chosen data file (File System Access API).
 * App data lives in the JSON file + localStorage mirror — never in IndexedDB.
 * IndexedDB is used only to remember the FileSystemFileHandle between sessions
 * (the browser API requires it; Chromium).
 */
import {
  APP_DATA_FILE_NAME,
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

export type LinkedFileStatus = {
  supported: boolean
  linked: boolean
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

export async function getLinkedFileStatus(): Promise<LinkedFileStatus> {
  const supported = isFileSystemAccessSupported()
  if (!supported) {
    return { supported: false, linked: false, fileName: null, lastError: null }
  }
  if (!cachedHandle) {
    cachedHandle = await idbGetHandle()
  }
  if (!cachedHandle) {
    return { supported: true, linked: false, fileName: null, lastError: lastError }
  }
  const ok = await ensurePermission(cachedHandle, 'read')
  if (!ok) {
    return {
      supported: true,
      linked: false,
      fileName: cachedHandle.name,
      lastError: 'Permission needed — click Re-link data file',
    }
  }
  return {
    supported: true,
    linked: true,
    fileName: cachedHandle.name,
    lastError: lastError,
  }
}

/** Create or pick a file for ongoing read/write of the app snapshot. */
export async function linkDataFile(): Promise<
  { ok: true; fileName: string } | { ok: false; error: string }
> {
  if (!isFileSystemAccessSupported()) {
    return {
      ok: false,
      error: 'This browser cannot link a file. Use Export / Import instead (works everywhere).',
    }
  }
  try {
    // Prefer open existing so user can re-attach; allow create via save picker
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

    cachedHandle = handle
    await idbSetHandle(handle)
    lastError = null

    // Seed file with current localStorage data
    const writeResult = await writeLinkedSnapshot(collectAppData())
    if (!writeResult.ok) return writeResult

    return { ok: true, fileName: handle.name }
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
    const canRead = await ensurePermission(cachedHandle, 'read')
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

/** Debounced write of current localStorage snapshot to the linked file. */
export function scheduleLinkedFileWrite(delayMs = 600): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    void writeLinkedSnapshot()
  }, delayMs)
}

/** Call from domain savers after successful localStorage write. */
export function notifyAppDataChanged(): void {
  scheduleLinkedFileWrite()
}

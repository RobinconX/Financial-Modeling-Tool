import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyAppDataToLocalStorage,
  downloadAppDataExport,
  readSnapshotFromFile,
} from '../../lib/appDataSnapshot'
import {
  createDataFile,
  getLinkedFileStatus,
  isFileSystemAccessSupported,
  linkDataFile,
  unlinkDataFile,
  writeLinkedSnapshot,
  type LinkedFileStatus,
} from '../../lib/linkedDataFile'

type Props = {
  onClose?: () => void
}

export function DataSettingsPanel({ onClose }: Props) {
  const [status, setStatus] = useState<LinkedFileStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshStatus = useCallback(async () => {
    const s = await getLinkedFileStatus()
    setStatus(s)
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  async function handleLink() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const result = await linkDataFile()
    setBusy(false)
    if (!result.ok) {
      if (result.error !== 'Cancelled') setError(result.error)
      return
    }
    await refreshStatus()
    if (result.action === 'loaded') {
      setMessage(
        `Loaded data from ${result.fileName}. Reloading so the app shows the file contents…`,
      )
      window.setTimeout(() => window.location.reload(), 400)
      return
    }
    setMessage(
      `Linked empty file: ${result.fileName}. Current browser data was written to it.`,
    )
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const result = await createDataFile()
    setBusy(false)
    if (!result.ok) {
      if (result.error !== 'Cancelled') setError(result.error)
      return
    }
    setMessage(`Created data file: ${result.fileName}`)
    await refreshStatus()
  }

  async function handleUnlink() {
    setBusy(true)
    await unlinkDataFile()
    setBusy(false)
    setMessage('Unlinked data file. Browser storage is still used.')
    await refreshStatus()
  }

  async function handleSaveNow() {
    setBusy(true)
    setError(null)
    const result = await writeLinkedSnapshot()
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage('Saved current data to the linked file.')
  }

  function handleExport() {
    downloadAppDataExport()
    setMessage('Download started — keep that JSON file as a backup.')
    setError(null)
  }

  async function handleImportFile(file: File) {
    setBusy(true)
    setError(null)
    setMessage(null)
    const parsed = await readSnapshotFromFile(file)
    setBusy(false)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    if (
      !confirm(
        'Import will replace all app data in this browser with the file contents. Continue?',
      )
    ) {
      return
    }
    const applied = applyAppDataToLocalStorage(parsed)
    if (!applied.ok) {
      setError(applied.error)
      return
    }
    // Also write to linked file if any
    void writeLinkedSnapshot(parsed)
    setMessage('Import complete. Reloading…')
    window.setTimeout(() => window.location.reload(), 500)
  }

  const fsa = isFileSystemAccessSupported()

  return (
    <div className="card max-w-xl space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Data &amp; backup</h2>
          <p className="mt-1 text-sm text-white/45">
            Your data stays on this device. Link a JSON file you control (e.g. in Documents or
            OneDrive), or use Export / Import. No multi-user cloud database.
          </p>
        </div>
        {onClose && (
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Browser storage
        </h3>
        <p className="text-[12px] text-white/40">
          Always used as a fast local mirror. Cleared if you wipe site data — use a linked file or
          export for safety.
        </p>
      </section>

      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Linked data file
        </h3>
        {!fsa ? (
          <p className="text-[12px] text-amber-200/80">
            This browser does not support linking a file for continuous save (use Chrome or Edge).
            Export / Import still works here.
          </p>
        ) : (
          <>
            <p className="text-[12px] text-white/50">
              Status:{' '}
              {status == null
                ? '…'
                : status.linked
                  ? (
                      <span className="text-emerald-400/90">
                        Linked — {status.fileName ?? 'financial-model.json'}
                      </span>
                    )
                  : (
                      <span className="text-white/40">Not linked</span>
                    )}
            </p>
            {status?.lastError && (
              <p className="text-[12px] text-amber-200/80">{status.lastError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary !py-1.5 !text-xs"
                disabled={busy}
                onClick={() => void handleLink()}
              >
                Open / link file…
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !text-xs"
                disabled={busy}
                onClick={() => void handleCreate()}
              >
                Create new file…
              </button>
              {status?.linked && (
                <>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !text-xs"
                    disabled={busy}
                    onClick={() => void handleSaveNow()}
                  >
                    Save now
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !text-xs text-white/50"
                    disabled={busy}
                    onClick={() => void handleUnlink()}
                  >
                    Unlink
                  </button>
                </>
              )}
            </div>
            <p className="text-[11px] text-white/30">
              <strong className="font-medium text-white/45">Open / link</strong> loads an existing
              file into the app (does not overwrite it with empty browser data).{' '}
              <strong className="font-medium text-white/45">Create new</strong> writes current
              browser data to a new path. After linking, edits wait ~4s of idle, then save once.
              Put the file in OneDrive/Dropbox for multi-PC backup.
            </p>
          </>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Export / Import
        </h3>
        <p className="text-[12px] text-white/40">
          Works in every browser. Use for backup or to move data into another browser profile.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary !py-1.5 !text-xs"
            disabled={busy}
            onClick={handleExport}
          >
            Export JSON…
          </button>
          <button
            type="button"
            className="btn-ghost !py-1.5 !text-xs"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Import JSON…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void handleImportFile(f)
            }}
          />
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200/90">
          {message}
        </p>
      )}
    </div>
  )
}

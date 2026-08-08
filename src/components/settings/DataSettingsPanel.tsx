import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyAppDataToLocalStorage,
  downloadAppDataExport,
  readSnapshotFromFile,
} from '../../lib/appDataSnapshot'
import { remountApp } from '../../lib/appRemount'
import {
  createDataFile,
  getLinkedFileStatus,
  isFileSystemAccessSupported,
  linkDataFile,
  requestLinkedFileAccess,
  unlinkDataFile,
  writeLinkedSnapshot,
  type LinkedFileStatus,
} from '../../lib/linkedDataFile'
import { InfoTip } from '../common/InfoTip'

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
      setMessage(`Loaded data from ${result.fileName}.`)
      remountApp()
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

  async function handleAllowAccess() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const result = await requestLinkedFileAccess({ reloadFromFile: true })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      await refreshStatus()
      return
    }
    await refreshStatus()
    if (result.reloaded) {
      setMessage(`Access granted — loaded ${result.fileName}.`)
      remountApp()
      return
    }
    setMessage(`Access granted for ${result.fileName}.`)
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
      await refreshStatus()
      return
    }
    setMessage('Saved current data to the linked file.')
    await refreshStatus()
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
    void writeLinkedSnapshot(parsed)
    setMessage('Import complete.')
    remountApp()
  }

  const fsa = isFileSystemAccessSupported()
  const needsAccess =
    status?.linked === true && status.permission !== 'granted'

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-white">Data &amp; backup</h2>
          <InfoTip label="About data storage">
            Your data stays on this device. Link a JSON file you control (Documents, OneDrive, etc.)
            or use Export / Import. No multi-user cloud database.
          </InfoTip>
        </div>
        {onClose && (
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <section className="panel space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title">Browser storage</h3>
          <InfoTip label="About browser storage">
            Always used as a fast local mirror. Cleared if you wipe site data — use a linked file or
            export for safety.
          </InfoTip>
        </div>
        <p className="text-sm text-white/50">
          Active. Data is mirrored here while you work.
        </p>
      </section>

      <section className="panel space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-emerald-300/90">Linked data file</h3>
          <InfoTip label="About linked file">
            Open / link loads an existing file into the app. Create new writes current browser data
            to a new path. After linking, edits wait ~4s of idle, then save once. Put the file in
            OneDrive/Dropbox for multi-PC backup.
          </InfoTip>
        </div>
        {!fsa ? (
          <p className="text-sm text-amber-200/80">
            This browser does not support linking a file for continuous save (use Chrome or Edge).
            Export / Import still works here.
          </p>
        ) : (
          <>
            <p className="text-sm text-white/60">
              Status:{' '}
              {status == null ? (
                '…'
              ) : status.linked ? (
                <span className="text-emerald-400/90">
                  Linked — {status.fileName ?? 'financial-model.json'}
                  {status.permission === 'granted' ? (
                    <span className="text-white/40"> · access ok</span>
                  ) : (
                    <span className="text-amber-200/90"> · needs access</span>
                  )}
                </span>
              ) : (
                <span className="text-white/40">Not linked</span>
              )}
            </p>
            {needsAccess && (
              <p className="text-sm text-amber-200/80">
                This session must re-allow the file (normal after a refresh). Use Allow file
                access — you should not need to pick the file again.
              </p>
            )}
            {status?.lastError && status.permission === 'granted' && (
              <p className="text-sm text-amber-200/80">{status.lastError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {needsAccess && (
                <button
                  type="button"
                  className="btn-primary !py-1.5 !text-xs"
                  disabled={busy}
                  onClick={() => void handleAllowAccess()}
                >
                  Allow file access…
                </button>
              )}
              <button
                type="button"
                className={
                  needsAccess ? 'btn-ghost !py-1.5 !text-xs' : 'btn-primary !py-1.5 !text-xs'
                }
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
                    disabled={busy || status.permission !== 'granted'}
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
          </>
        )}
      </section>

      <section className="panel space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title">Export / Import</h3>
          <InfoTip label="About export and import">
            Works in every browser. Use for backup or to move data into another browser profile.
          </InfoTip>
        </div>
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

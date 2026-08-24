import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addAccount,
  applyLoadedSave,
  createEmptyAccount,
  deleteAccount,
  downloadAllAccountsExport,
  duplicateAccount,
  DEFAULT_ACCOUNT_NAME,
  ensureCatalog,
  isSnapshotPopulated,
  loadCatalog,
  readSaveFileFromFile,
  renameAccount,
  replaceSelectedSnapshot,
  suggestedImportName,
  switchAccount,
  type AccountCatalog,
  type ParsedSaveFile,
} from '../../lib/accountCatalog'
import { collectAppData, downloadAppDataExport } from '../../lib/appDataSnapshot'
import { fillAccountWithExample } from '../../lib/exampleSeed'
import { downloadTableExport } from '../../lib/tableExport'
import { remountApp } from '../../lib/appRemount'
import {
  createDataFile,
  getFileLinkingSupport,
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
  const [pendingImport, setPendingImport] = useState<
    | { kind: 'snapshot'; parsed: Extract<ParsedSaveFile, { kind: 'snapshot' }>; name: string }
    | { kind: 'catalog'; parsed: Extract<ParsedSaveFile, { kind: 'catalog' }> }
    | null
  >(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const catalog = loadCatalog()
  const accountCount = catalog?.accounts.length ?? 1
  const multi = accountCount > 1

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
    setError(null)
    downloadAppDataExport()
    setMessage('Download started — this file is the current account (same format as before).')
  }

  function handleExportAll() {
    setError(null)
    downloadAllAccountsExport()
    setMessage('Download started — all accounts in one save file.')
  }

  function handleExportTables() {
    setError(null)
    downloadTableExport()
    setMessage('Download started — open the Excel file.')
  }

  function finishChange() {
    void writeLinkedSnapshot()
    remountApp()
  }

  async function handleImportFile(file: File) {
    setBusy(true)
    setError(null)
    setMessage(null)
    setPendingImport(null)
    const parsed = await readSaveFileFromFile(file)
    setBusy(false)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    if (parsed.kind === 'catalog') {
      setPendingImport({ kind: 'catalog', parsed })
      return
    }
    setPendingImport({
      kind: 'snapshot',
      parsed,
      name: suggestedImportName(file.name),
    })
  }

  function confirmReplaceAll(catalogFile: AccountCatalog) {
    const applied = applyLoadedSave({ kind: 'catalog', catalog: catalogFile })
    if (!applied.ok) {
      setError(applied.error)
      return
    }
    setPendingImport(null)
    setMessage('Imported all accounts.')
    finishChange()
  }

  function confirmAddSnapshot(name: string, snapshot: ParsedSaveFile & { kind: 'snapshot' }) {
    addAccount({ name, snapshot: snapshot.snapshot, select: true })
    setPendingImport(null)
    setMessage(`Added account “${name}”.`)
    finishChange()
  }

  function confirmReplaceSnapshot(snapshot: ParsedSaveFile & { kind: 'snapshot' }) {
    const applied = replaceSelectedSnapshot(snapshot.snapshot)
    if (!applied.ok) {
      setError(applied.error)
      return
    }
    setPendingImport(null)
    setMessage('Replaced the current account.')
    finishChange()
  }

  const fsa = isFileSystemAccessSupported()
  const linking = getFileLinkingSupport()
  const needsAccess =
    status?.linked === true && status.permission !== 'granted'
  // On mobile without continuous link, Export/Import is the primary backup path
  const exportPrimary = !fsa

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-white">Data &amp; backup</h2>
          <InfoTip label="About data storage">
            Your data stays on this device. On desktop Chrome/Edge you can link a JSON file for
            continuous save. On iPhone/iPad use Export / Import. No multi-user cloud database.
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
            Continuous link needs the File System Access API (desktop Chrome or Edge). After
            linking, edits wait ~4s of idle, then save once. Put the file in OneDrive/Dropbox for
            multi-PC backup. iPhone/iPad cannot do continuous linking — use Export / Import.
          </InfoTip>
        </div>
        {!fsa ? (
          <div className="space-y-2 text-sm text-amber-200/85">
            <p>{linking.unsupportedReason}</p>
            {linking.isAppleMobile ? (
              <p className="text-white/50">
                Tip: Export downloads a file. Import picks a JSON from Files to restore.
              </p>
            ) : null}
          </div>
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

        <AccountsSection
          catalog={catalog}
          busy={busy}
          onError={setError}
          onMessage={setMessage}
          onChanged={finishChange}
        />
      </section>

      <section className="panel space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title">Export / Import</h3>
          <InfoTip label="About export and import">
            Export JSON is the current account in the same format as before — send that file back
            to someone. Import a one-account file to add it or replace this account. A multi-account
            save file restores the whole list. Tables (.xlsx) is Excel-only, not for import.
          </InfoTip>
        </div>
        {exportPrimary ? (
          <p className="text-sm text-white/50">
            Primary backup on this device: export a JSON, store it in Files, import when you need
            it back.
          </p>
        ) : null}
        {pendingImport?.kind === 'snapshot' ? (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-sm text-white/70">
              Import “{pendingImport.name}” as a new account, or replace the current one?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={accountCount > 1 ? 'btn-primary !py-1.5 !text-xs' : 'btn-ghost !py-1.5 !text-xs'}
                disabled={busy}
                onClick={() => confirmAddSnapshot(pendingImport.name, pendingImport.parsed)}
              >
                Add as new account
              </button>
              <button
                type="button"
                className={accountCount > 1 ? 'btn-ghost !py-1.5 !text-xs' : 'btn-primary !py-1.5 !text-xs'}
                disabled={busy}
                onClick={() => confirmReplaceSnapshot(pendingImport.parsed)}
              >
                Replace this account
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !text-xs text-white/45"
                onClick={() => setPendingImport(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {pendingImport?.kind === 'catalog' ? (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-sm text-white/70">
              This file has {pendingImport.parsed.catalog.accounts.length} accounts. Replace every
              account in this browser?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary !py-1.5 !text-xs"
                disabled={busy}
                onClick={() => confirmReplaceAll(pendingImport.parsed.catalog)}
              >
                Replace all
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !text-xs text-white/45"
                onClick={() => setPendingImport(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary !py-1.5 !text-xs"
            disabled={busy}
            onClick={handleExport}
          >
            Export JSON
          </button>
          {multi ? (
            <button
              type="button"
              className="btn-ghost !py-1.5 !text-xs"
              disabled={busy}
              onClick={handleExportAll}
            >
              Export all
            </button>
          ) : null}
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
            accept="application/json,.json,text/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void handleImportFile(f)
            }}
          />
          <button
            type="button"
            className="btn-ghost !py-1.5 !text-xs"
            disabled={busy}
            onClick={handleExportTables}
          >
            Export tables
          </button>
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

function AccountsSection({
  catalog,
  busy,
  onError,
  onMessage,
  onChanged,
}: {
  catalog: AccountCatalog | null
  busy: boolean
  onError: (msg: string | null) => void
  onMessage: (msg: string) => void
  onChanged: () => void
}) {
  const multi = (catalog?.accounts.length ?? 1) > 1

  function handleNew() {
    onError(null)
    createEmptyAccount()
    onMessage('Created an empty account. Open it when you want a blank model — this one stays as-is.')
    onChanged()
  }

  function handleOpen(id: string) {
    onError(null)
    const result = switchAccount(id)
    if (!result.ok) {
      onError(result.error)
      return
    }
    onChanged()
  }

  function handleDuplicate(id: string) {
    onError(null)
    const result = duplicateAccount(id)
    if ('error' in result) {
      onError(result.error)
      return
    }
    onMessage('Duplicated account.')
    onChanged()
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete account “${name}”? This cannot be undone.`)) return
    onError(null)
    const result = deleteAccount(id)
    if ('error' in result) {
      onError(result.error)
      return
    }
    onMessage('Deleted account.')
    onChanged()
  }

  function handleLoadExample(id: string | null) {
    onError(null)
    const result = fillAccountWithExample(id)
    if (!result.ok) {
      onError(result.error)
      return
    }
    onMessage('Loaded example data into this account.')
    onChanged()
  }

  function handleRename(id: string | null, name: string) {
    const cat = catalog ?? ensureCatalog()
    const target =
      id && cat.accounts.some((a) => a.id === id) ? id : cat.selectedId
    renameAccount(target, name)
    onChanged()
  }

  const rows = catalog?.accounts ?? [
    { id: '', name: DEFAULT_ACCOUNT_NAME, active: true },
  ]

  return (
    <div className="space-y-2 border-t border-white/10 pt-4">
      <div className="flex items-center gap-1.5">
        <h4 className="text-[11px] font-semibold tracking-wide text-white/55">Accounts</h4>
        <InfoTip label="About accounts">
          Accounts live in this save file. Each is a full model (Income/Cost, savings, overview,
          portfolios, projections). Not the same as Savings accounts.
        </InfoTip>
      </div>
      {!multi ? (
        <p className="text-[11px] leading-snug text-white/40">
          This save file has only this account — the model you are in.
        </p>
      ) : null}
      <ul className={multi ? 'divide-y divide-white/[0.06]' : undefined}>
        {rows.map((a) => {
          const active = catalog ? a.id === catalog.selectedId : true
          const snap = 'snapshot' in a ? a.snapshot : undefined
          const empty = !isSnapshotPopulated(
            active ? collectAppData() : (snap ?? collectAppData()),
          )
          return (
            <li key={a.id || 'current'}>
              <AccountRow
                id={a.id}
                name={a.name}
                active={active}
                empty={empty}
                multi={multi}
                busy={busy}
                onOpen={() => a.id && handleOpen(a.id)}
                onRename={(name) => handleRename(a.id || null, name)}
                onDuplicate={() => a.id && handleDuplicate(a.id)}
                onDelete={() => a.id && handleDelete(a.id, a.name)}
                onLoadExample={() => handleLoadExample(a.id || null)}
              />
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="text-[11px] text-white/45 transition hover:text-white/80 disabled:opacity-40"
        disabled={busy}
        onClick={handleNew}
      >
        Add account
      </button>
    </div>
  )
}

function AccountRow({
  id,
  name,
  active,
  empty,
  multi,
  busy,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onLoadExample,
}: {
  id: string
  name: string
  active: boolean
  empty: boolean
  multi: boolean
  busy: boolean
  onOpen: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
  onLoadExample: () => void
}) {
  const [draft, setDraft] = useState(name)
  useEffect(() => {
    setDraft(name)
  }, [name])

  return (
    <div className="group flex items-center gap-2.5 py-1.5">
      {multi ? (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            active ? 'bg-emerald-400' : 'bg-white/15'
          }`}
          aria-hidden
        />
      ) : null}
      <input
        className="min-w-0 flex-1 border-0 border-b border-transparent bg-transparent px-0 py-0.5 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-emerald-500/40"
        value={draft}
        aria-label={id ? `Account name ${id}` : 'Current account name'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== name) onRename(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {active ? (
        <span className="shrink-0 text-[11px] text-white/35">Current</span>
      ) : (
        <button
          type="button"
          className="shrink-0 text-[11px] text-white/45 transition hover:text-white/80 disabled:opacity-40"
          disabled={busy}
          onClick={onOpen}
        >
          Open
        </button>
      )}
      {empty ? (
        <button
          type="button"
          className="shrink-0 text-[11px] text-emerald-400/70 transition hover:text-emerald-300 disabled:opacity-40"
          disabled={busy}
          onClick={onLoadExample}
        >
          Load example
        </button>
      ) : null}
      {multi ? (
        <span className="flex shrink-0 gap-2.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            className="text-[11px] text-white/40 transition hover:text-white/75 disabled:opacity-40"
            disabled={busy}
            onClick={onDuplicate}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="text-[11px] text-white/35 transition hover:text-red-300/80 disabled:opacity-40"
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
        </span>
      ) : null}
    </div>
  )
}

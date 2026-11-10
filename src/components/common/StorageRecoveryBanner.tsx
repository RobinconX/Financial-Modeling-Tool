import type { StorageRecoveryNotice } from '../../lib/storageLoadRecovery'
import {
  downloadCorruptBackup,
  recoveryUserMessage,
} from '../../lib/storageLoadRecovery'

type Props = {
  notices: StorageRecoveryNotice[]
  onDismiss: (storageKey: string) => void
  onOpenDataSettings?: () => void
}

export function StorageRecoveryBanner({
  notices,
  onDismiss,
  onOpenDataSettings,
}: Props) {
  if (notices.length === 0) return null

  return (
    <div
      className="mb-4 space-y-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      role="alert"
    >
      <p className="font-medium text-amber-50">Saved data could not be loaded</p>
      {notices.map((notice) => (
        <div key={notice.storageKey} className="space-y-2 border-t border-amber-500/20 pt-2 first:border-t-0 first:pt-0">
          <p>{recoveryUserMessage(notice)}</p>
          <p className="text-amber-100/80">
            A copy of the unreadable data was kept in browser storage under backup key{' '}
            <code className="rounded bg-black/30 px-1 py-0.5 text-xs text-amber-50">
              {notice.backupKey}
            </code>
            . Download it before editing this section, or use Data &amp; backup to import a JSON
            export if you have one.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-500/25"
              onClick={() => downloadCorruptBackup(notice)}
            >
              Download corrupt backup
            </button>
            {onOpenDataSettings ? (
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/90 hover:bg-white/10"
                onClick={onOpenDataSettings}
              >
                Open Data &amp; backup
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md px-3 py-1 text-xs text-amber-100/70 hover:text-amber-50"
              onClick={() => onDismiss(notice.storageKey)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

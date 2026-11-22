import { useEffect, useState } from 'react'
import {
  getLastLinkedFileSaveEvent,
  getLinkedFileLastModified,
  getLinkedFileStatus,
  subscribeLinkedFileSave,
  type LinkedFileSaveEvent,
} from '../../lib/linkedDataFile'

/** Local clock time for last successful save (seconds included for safety). */
function formatSaveTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

type Props = {
  onOpenDataSettings?: () => void
  /** Opens the file picker to re-attach the linked JSON (same user gesture rules as Settings). */
  onRelinkFile?: () => void
}

/**
 * Permanent, subtle save status (Excel Online–style) for the linked data file.
 * Always visible in the app chrome — not a transient toast.
 */
export function LinkedFileSaveHint({ onOpenDataSettings, onRelinkFile }: Props) {
  const [event, setEvent] = useState<LinkedFileSaveEvent>(() =>
    getLastLinkedFileSaveEvent(),
  )
  const [relinkSuggested, setRelinkSuggested] = useState(false)

  useEffect(() => {
    const unsub = subscribeLinkedFileSave(setEvent)
    void (async () => {
      const s = await getLinkedFileStatus()
      setRelinkSuggested(s.linked && s.permission !== 'granted')
      if (s.linked) {
        const mtime = await getLinkedFileLastModified()
        const savedAt = mtime ?? getLastLinkedFileSaveEvent().savedAt ?? Date.now()
        setEvent((cur) => {
          if (
            cur.status === 'pending' ||
            cur.status === 'saving' ||
            cur.status === 'error' ||
            cur.status === 'load-failed'
          ) {
            return cur
          }
          return {
            status: 'saved',
            message: 'Saved',
            fileName: s.fileName,
            savedAt,
          }
        })
      } else {
        setEvent((prev) => {
          if (prev.status === 'pending' || prev.status === 'saving') return prev
          return {
            status: 'idle',
            message: 'No linked file',
            fileName: null,
            savedAt: null,
          }
        })
      }
    })()
    return unsub
  }, [])

  const timeLabel =
    event.savedAt != null && Number.isFinite(event.savedAt)
      ? formatSaveTime(event.savedAt)
      : null

  const showRelink =
    event.status === 'load-failed' || relinkSuggested

  let label: string
  let tone = 'text-white/40'
  let showSpinner = false
  let secondary: string | null = null

  switch (event.status) {
    case 'pending':
      label = 'Unsaved changes'
      tone = 'text-amber-200/70'
      secondary = timeLabel ? `last saved ${timeLabel}` : event.fileName ?? null
      break
    case 'saving':
      label = 'Saving…'
      tone = 'text-white/55'
      showSpinner = true
      secondary = timeLabel ? `last ${timeLabel}` : event.fileName ?? null
      break
    case 'saved':
      label = showRelink ? 'Re-link file' : 'Saved'
      tone = showRelink ? 'text-amber-200/90' : 'text-white/40'
      secondary = showRelink
        ? 'Pick the same JSON again'
        : [timeLabel, event.fileName].filter(Boolean).join(' · ') || null
      break
    case 'error':
      label = 'Couldn’t save'
      tone = 'text-red-300/90'
      secondary = event.message
      break
    case 'load-failed':
      label = 'Re-link file'
      tone = 'text-amber-200/90'
      secondary =
        'Pick the same JSON again (recommended on Brave / OneDrive)'
      break
    default:
      label = 'No linked file'
      tone = 'text-white/30'
      secondary = null
  }

  if (showRelink && event.status === 'saved') {
    secondary = secondary ?? 'Pick the same JSON again'
  }

  const fullTitle =
    event.status === 'error' || event.status === 'load-failed' || showRelink
      ? [label, event.message, event.fileName].filter(Boolean).join(' — ')
      : [
          label,
          timeLabel ? `at ${timeLabel}` : null,
          event.fileName ? `(${event.fileName})` : null,
        ]
          .filter(Boolean)
          .join(' ')

  const relinkAction = onRelinkFile ?? onOpenDataSettings

  return (
    <div
      className={`flex max-w-[min(100%,22rem)] items-center justify-end gap-1.5 text-right text-[11px] leading-snug ${tone}`}
      role="status"
      aria-live="polite"
      title={fullTitle}
    >
      {showSpinner ? (
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-white/25 border-t-white/70"
          aria-hidden
        />
      ) : event.status === 'saved' && !showRelink ? (
        <span className="text-[10px] text-emerald-400/50" aria-hidden>
          ✓
        </span>
      ) : showRelink || event.status === 'load-failed' ? (
        <span className="text-[10px] text-amber-300/70" aria-hidden>
          !
        </span>
      ) : null}
      <span className="min-w-0 truncate">
        <span className="font-medium">{label}</span>
        {secondary && event.status !== 'error' ? (
          <span
            className={`block truncate text-[10px] ${
              showRelink || event.status === 'load-failed'
                ? 'opacity-90'
                : 'text-white/25'
            }`}
          >
            {event.status !== 'load-failed' && !showRelink && event.status !== 'saved'
              ? ` · ${secondary}`
              : secondary}
          </span>
        ) : null}
        {event.status === 'error' && secondary ? (
          <span className="block truncate text-[10px] opacity-90">{secondary}</span>
        ) : null}
      </span>
      {showRelink && relinkAction ? (
        <button
          type="button"
          className="shrink-0 rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/25"
          onClick={() => relinkAction()}
        >
          Re-link file
        </button>
      ) : null}
    </div>
  )
}
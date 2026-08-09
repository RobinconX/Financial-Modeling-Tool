import { useEffect, useState } from 'react'
import {
  getLastLinkedFileSaveEvent,
  getLinkedFileStatus,
  subscribeLinkedFileSave,
  type LinkedFileSaveEvent,
} from '../../lib/linkedDataFile'

/**
 * Permanent, subtle save status (Excel Online–style) for the linked data file.
 * Always visible in the app chrome — not a transient toast.
 */
export function LinkedFileSaveHint() {
  const [event, setEvent] = useState<LinkedFileSaveEvent>(() =>
    getLastLinkedFileSaveEvent(),
  )

  useEffect(() => {
    const unsub = subscribeLinkedFileSave(setEvent)
    void (async () => {
      // Hydrate initial state: linked + idle → Saved; else no file
      const s = await getLinkedFileStatus()
      if (s.linked) {
        setEvent((prev) => {
          // Don't clobber an in-flight pending/saving from a concurrent edit
          if (prev.status === 'pending' || prev.status === 'saving' || prev.status === 'error') {
            return prev
          }
          return {
            status: 'saved',
            message: 'Saved',
            fileName: s.fileName,
          }
        })
      } else {
        setEvent((prev) => {
          if (prev.status === 'pending' || prev.status === 'saving') return prev
          return {
            status: 'idle',
            message: 'No linked file',
            fileName: null,
          }
        })
      }
    })()
    return unsub
  }, [])

  const fileHint = event.fileName ? ` · ${event.fileName}` : ''

  let label: string
  let detail: string | null = null
  let tone = 'text-white/40'
  let showSpinner = false

  switch (event.status) {
    case 'pending':
      label = 'Unsaved changes'
      detail = event.fileName ?? null
      tone = 'text-amber-200/70'
      break
    case 'saving':
      label = 'Saving…'
      detail = event.fileName ?? null
      tone = 'text-white/55'
      showSpinner = true
      break
    case 'saved':
      label = 'Saved'
      detail = event.fileName ?? null
      tone = 'text-white/40'
      break
    case 'error':
      label = 'Couldn’t save'
      detail = event.message
      tone = 'text-red-300/90'
      break
    default:
      label = 'No linked file'
      detail = null
      tone = 'text-white/30'
  }

  return (
    <div
      className={`flex max-w-[min(100%,16rem)] items-center justify-end gap-1.5 text-right text-[11px] leading-snug ${tone}`}
      role="status"
      aria-live="polite"
      title={
        event.status === 'error'
          ? event.message
          : event.fileName
            ? `${label}${fileHint}`
            : label
      }
    >
      {showSpinner ? (
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-white/25 border-t-white/70"
          aria-hidden
        />
      ) : event.status === 'saved' ? (
        <span className="text-[10px] text-emerald-400/50" aria-hidden>
          ✓
        </span>
      ) : null}
      <span className="min-w-0 truncate">
        <span className="font-medium">{label}</span>
        {detail && event.status !== 'error' ? (
          <span className="text-white/25"> · {detail}</span>
        ) : null}
        {event.status === 'error' && detail ? (
          <span className="block truncate text-[10px] opacity-90">{detail}</span>
        ) : null}
      </span>
    </div>
  )
}

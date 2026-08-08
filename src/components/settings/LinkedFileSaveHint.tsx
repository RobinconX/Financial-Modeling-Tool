import { useEffect, useState } from 'react'
import {
  subscribeLinkedFileSave,
  type LinkedFileSaveEvent,
} from '../../lib/linkedDataFile'

/**
 * Fixed toast when the linked data file is written (auto-save after edits).
 */
export function LinkedFileSaveHint() {
  const [event, setEvent] = useState<LinkedFileSaveEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeLinkedFileSave((e) => {
      setEvent(e)
      setVisible(true)
      if (hideTimer) clearTimeout(hideTimer)
      // Pending stays until save/error; hide success/error after a short beat
      if (e.status === 'saved') {
        hideTimer = setTimeout(() => setVisible(false), 2500)
      } else if (e.status === 'error') {
        hideTimer = setTimeout(() => setVisible(false), 5000)
      }
    })
    return () => {
      unsub()
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  if (!visible || !event) return null

  const tone =
    event.status === 'error'
      ? 'border-red-500/40 bg-red-500/15 text-red-100'
      : event.status === 'saved'
        ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-100'
        : 'border-white/15 bg-[#121820]/95 text-white/75'

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] max-w-xs"
      role="status"
      aria-live="polite"
    >
      <div
        className={`rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-sm transition ${tone}`}
      >
        <div className="font-medium">
          {event.status === 'pending' || event.status === 'saving'
            ? 'Data file'
            : event.status === 'saved'
              ? 'Data file'
              : 'Data file error'}
        </div>
        <div className="mt-0.5 text-[11px] opacity-90">{event.message}</div>
      </div>
    </div>
  )
}

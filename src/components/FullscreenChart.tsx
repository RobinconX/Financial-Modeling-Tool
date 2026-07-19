import { useEffect, useState, type ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  /** Optional class for the inline chart container */
  className?: string
}

/**
 * Wraps a chart with an Expand control and a fullscreen overlay (Esc / Close).
 */
export function FullscreenChart({ title, children, className }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <div className={className}>
        <div className="mb-2 flex items-center justify-end">
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => setOpen(true)}>
            Expand
          </button>
        </div>
        {children}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0f14]/95 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 p-6">
            <div className="h-full min-h-[70vh] w-full rounded-xl border border-white/10 bg-black/30 p-4">
              {children}
            </div>
          </div>
          <p className="pb-4 text-center text-xs text-white/30">Press Esc to close</p>
        </div>
      )}
    </>
  )
}

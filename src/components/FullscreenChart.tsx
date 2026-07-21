import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  children: ReactNode
  /** Optional class for the inline chart container */
  className?: string
}

/**
 * Wraps a chart with an Expand control and a true viewport fullscreen overlay.
 * Overlay is portaled to document.body so ancestors (e.g. .card backdrop-filter)
 * cannot trap position:fixed.
 */
export function FullscreenChart({ title, children, className }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filledChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child
    return cloneElement(child as ReactElement<{ fillContainer?: boolean }>, {
      fillContainer: true,
    })
  })

  const overlay =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 flex flex-col bg-[#0b0f14]"
            style={{ zIndex: 9999 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-3">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/30">Esc to close</span>
                <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4">
                {filledChildren}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

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
      {overlay}
    </>
  )
}

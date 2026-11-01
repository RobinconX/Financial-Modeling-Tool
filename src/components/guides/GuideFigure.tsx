import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  src: string
  alt: string
  caption?: string
}

/** Inline guide figure; click opens a full-viewport lightbox (Esc / backdrop / Close). */
export function GuideFigure({ src, alt, caption }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  const lightbox =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 flex flex-col bg-black/90"
            style={{ zIndex: 9999 }}
            role="dialog"
            aria-modal="true"
            aria-label={alt || 'Guide illustration'}
            onClick={() => setOpen(false)}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
              <p className="min-w-0 truncate text-sm text-white/70">{alt || 'Illustration'}</p>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-white/30 sm:inline">Esc to close</span>
                <button
                  type="button"
                  className="btn-primary !py-1.5 !text-xs"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
              <img
                src={src}
                alt={alt}
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {caption ? (
              <p className="shrink-0 border-t border-white/10 px-4 py-3 text-center text-[12px] text-white/50 sm:px-6">
                {caption}
              </p>
            ) : null}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <figure className="mt-3 first:mt-0">
        <button
          type="button"
          className="block w-full cursor-zoom-in rounded-lg border border-white/10 bg-black/20 p-0 text-left transition hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          onClick={() => setOpen(true)}
          aria-label={`View full size: ${alt || 'illustration'}`}
        >
          <img src={src} alt={alt} className="w-full rounded-lg" loading="lazy" />
        </button>
        {caption ? (
          <figcaption className="mt-1.5 text-[11px] leading-snug text-white/45">
            {caption}
          </figcaption>
        ) : null}
      </figure>
      {lightbox}
    </>
  )
}

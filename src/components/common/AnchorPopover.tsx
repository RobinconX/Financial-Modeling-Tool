import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  label: string
  trigger: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'bottom' | 'top'
  panelClassName?: string
}

/** Click-to-open anchored panel (editable content; unlike hover-only InfoTip). */
export function AnchorPopover({
  label,
  trigger,
  open,
  onOpenChange,
  children,
  align = 'end',
  side = 'bottom',
  panelClassName = '',
}: Props) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) onOpenChange(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  const pos =
    align === 'end'
      ? 'right-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0'
  const place = side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'

  return (
    <span ref={rootRef} className="relative inline-flex shrink-0 align-middle">
      <span
        onClick={(e) => {
          e.stopPropagation()
          onOpenChange(!open)
        }}
      >
        {trigger}
      </span>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className={`absolute z-[90] w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-white/12 bg-[#121820] px-3 py-2.5 text-left shadow-xl ${place} ${pos} ${panelClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </span>
  )
}

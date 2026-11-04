import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

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

type PanelPos = { top: number; left: number }

const VIEWPORT_PAD = 8
const GAP = 6

/** Click-to-open panel portaled to body so table overflow cannot clip it. */
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
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const root = rootRef.current
      const panel = panelRef.current
      const t = e.target as Node
      if (root?.contains(t) || panel?.contains(t)) return
      onOpenChange(false)
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

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null)
      return
    }

    function measure(): PanelPos | null {
      const anchor = rootRef.current
      const panel = panelRef.current
      if (!anchor || !panel) return null

      const rect = anchor.getBoundingClientRect()
      const panelW = panel.offsetWidth
      const panelH = panel.offsetHeight
      const maxW = window.innerWidth - VIEWPORT_PAD * 2
      const maxH = window.innerHeight - VIEWPORT_PAD * 2

      const spaceBelow = window.innerHeight - rect.bottom - GAP
      const spaceAbove = rect.top - GAP
      let useSide = side
      if (useSide === 'top' && panelH > spaceAbove && spaceBelow > spaceAbove) {
        useSide = 'bottom'
      } else if (useSide === 'bottom' && panelH > spaceBelow && spaceAbove > spaceBelow) {
        useSide = 'top'
      }

      let left =
        align === 'end'
          ? rect.right - panelW
          : align === 'center'
            ? rect.left + rect.width / 2 - panelW / 2
            : rect.left
      left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - panelW - VIEWPORT_PAD))

      let top =
        useSide === 'bottom'
          ? rect.bottom + GAP
          : rect.top - GAP - panelH

      top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - panelH - VIEWPORT_PAD))

      if (panelH > maxH) {
        top = VIEWPORT_PAD
      }
      if (panelW > maxW) {
        left = VIEWPORT_PAD
      }

      return { top, left }
    }

    function update() {
      const next = measure()
      if (next) setPanelPos(next)
    }

    update()
    const raf = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, side, align, children])

  const panel = open ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label={label}
      className={`fixed z-[200] w-72 max-w-[min(18rem,calc(100vw-2rem))] max-h-[min(24rem,calc(100vh-1rem))] overflow-y-auto rounded-lg border border-white/12 bg-[#121820] px-3 py-2.5 text-left shadow-xl ${panelClassName}`}
      style={
        panelPos
          ? { top: panelPos.top, left: panelPos.left }
          : { top: -9999, left: -9999, visibility: 'hidden' as const }
      }
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  ) : null

  return (
    <>
      <span ref={rootRef} className="relative inline-flex shrink-0 align-middle">
        <span
          onClick={(e) => {
            e.stopPropagation()
            onOpenChange(!open)
          }}
        >
          {trigger}
        </span>
      </span>
      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </>
  )
}

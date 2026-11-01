import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { FeatureGuideArticle } from './FeatureGuideArticle'
import { FeatureGuideIndex } from './FeatureGuideIndex'
import { useFeatureGuide } from './FeatureGuideProvider'

const WIDTH_KEY = 'grok-lab-guide-rail-width'
const DEFAULT_WIDTH = 384
/** Narrowest readable rail */
const MIN_WIDTH = 280
/** Guide may use up to half of the live viewport width. */
const MAX_VIEWPORT_FRACTION = 0.5
/** Floor left for nav + main when the viewport is narrow. */
const MIN_APP_PX = 320

function readWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isFinite(n)) return clampWidth(n)
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH
}

/** Max guide width from the live viewport — up to half the display. */
function maxWidthForViewport(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  const vw = window.innerWidth
  const half = Math.floor(vw * MAX_VIEWPORT_FRACTION)
  return Math.max(MIN_WIDTH, Math.min(half, vw - MIN_APP_PX))
}

function clampWidth(px: number): number {
  return Math.round(Math.min(maxWidthForViewport(), Math.max(MIN_WIDTH, px)))
}

/** Non-blocking right rail — push layout sibling, not a modal overlay. */
export function FeatureGuideRail() {
  const { open, pane, activeId, close } = useFeatureGuide()
  const [width, setWidth] = useState(readWidth)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    function onResize() {
      setWidth((w) => clampWidth(w))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width))
    } catch {
      /* ignore */
    }
  }, [width])

  const onResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setDragging(true)

    function onMove(ev: PointerEvent) {
      // Dragging the left edge: move left → wider
      const next = startW + (startX - ev.clientX)
      setWidth(clampWidth(next))
    }
    function onUp(ev: PointerEvent) {
      setDragging(false)
      try {
        target.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [width])

  if (!open) return null

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-white/10 bg-[#121820]"
      style={{ width }}
      aria-label="Feature guides"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize guides panel"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidthForViewport()}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onResizePointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setWidth((w) => clampWidth(w + 16))
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            setWidth((w) => clampWidth(w - 16))
          }
        }}
        className={`absolute top-0 left-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize touch-none ${
          dragging ? 'bg-emerald-400/50' : 'bg-transparent hover:bg-white/20'
        }`}
      />

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white">
          {pane === 'index' ? 'Guides' : 'Guide'}
        </h2>
        <button type="button" className="btn-ghost shrink-0 !py-1 !text-xs" onClick={close}>
          Close
        </button>
      </div>

      {pane === 'index' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <FeatureGuideIndex />
        </div>
      ) : activeId != null ? (
        <FeatureGuideArticle id={activeId} />
      ) : null}
    </aside>
  )
}

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { LightMarkdown } from '../../lib/lightMarkdown'
import {
  InvestmentThesisModalLazy,
  investmentThesisModalWarmHandlers,
} from './investmentThesisModalLazy'
import { useThesisRail } from './ThesisRailProvider'

const WIDTH_KEY = 'grok-lab-thesis-rail-width'
const DEFAULT_WIDTH = 384
const MIN_WIDTH = 280
const MAX_VIEWPORT_FRACTION = 0.5
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

function maxWidthForViewport(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  const vw = window.innerWidth
  const half = Math.floor(vw * MAX_VIEWPORT_FRACTION)
  return Math.max(MIN_WIDTH, Math.min(half, vw - MIN_APP_PX))
}

function clampWidth(px: number): number {
  return Math.round(Math.min(maxWidthForViewport(), Math.max(MIN_WIDTH, px)))
}

/** Investment thesis shelf — read-only body; edit opens Analyze's thesis modal. */
export function ThesisRail() {
  const { open, view, close, patchThesis } = useThesisRail()
  const [width, setWidth] = useState(readWidth)
  const [dragging, setDragging] = useState(false)
  const [thesisModalOpen, setThesisModalOpen] = useState(false)

  useEffect(() => {
    if (open) return
    setThesisModalOpen(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !thesisModalOpen) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, thesisModalOpen])

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

  const onThesisChange = useCallback(
    (next: string) => {
      if (!view) return
      patchThesis(view.scenarioId, next)
    },
    [view, patchThesis],
  )

  if (!open || !view) return null

  return (
    <>
      <aside
        className="fixed inset-y-0 right-0 z-[59] flex flex-col border-l border-white/10 bg-[#121820] shadow-2xl shadow-black/50"
        style={{ width }}
        aria-label="Investment thesis"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize thesis panel"
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
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
              {view.symbol}
            </p>
            <h2 className="truncate text-sm font-semibold text-white">{view.scenarioName}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="btn-ghost shrink-0 !py-1 !text-xs"
              onClick={() => setThesisModalOpen(true)}
              {...investmentThesisModalWarmHandlers}
            >
              Edit
            </button>
            <button type="button" className="btn-ghost shrink-0 !py-1 !text-xs" onClick={close}>
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <LightMarkdown source={view.thesis} />
        </div>
      </aside>

      <Suspense fallback={null}>
        {thesisModalOpen ? (
          <InvestmentThesisModalLazy
            open={thesisModalOpen}
            onClose={() => setThesisModalOpen(false)}
            symbol={view.symbol}
            scenarioName={view.scenarioName}
            value={view.thesis}
            onChange={onThesisChange}
            placeholder="Why you own it; what would make you add or trim."
          />
        ) : null}
      </Suspense>
    </>
  )
}
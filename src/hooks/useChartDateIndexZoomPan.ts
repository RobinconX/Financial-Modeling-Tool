import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import {
  CHART_ZOOM_MIN_SPAN,
  indexWindowFromDates,
  panIndexWindow,
  zoomIndexWindow,
} from '../lib/chartIndexWindow'

type DateWindow = { from: string; to: string }

type Options = {
  yAxisPx?: number
  rightPx?: number
  minSpan?: number
}

export function useChartDateIndexZoomPan<T extends { date: string }>(
  data: readonly T[],
  options: Options = {},
) {
  const yAxisPx = options.yAxisPx ?? 56
  const rightPx = options.rightPx ?? 12
  const minSpan = options.minSpan ?? CHART_ZOOM_MIN_SPAN

  const [win, setWin] = useState<DateWindow | null>(null)
  const [panning, setPanning] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; start: number; end: number } | null>(null)

  const { start, end } = useMemo(
    () => indexWindowFromDates(data, win),
    [data, win],
  )

  const last = Math.max(0, data.length - 1)
  const visible = useMemo(
    () => (data.length > 0 ? data.slice(start, end + 1) : [...data]),
    [data, start, end],
  )
  const zoomed = data.length > 1 && (start > 0 || end < last)

  useEffect(() => {
    const node = chartRef.current
    if (!node || data.length < 2) return
    const host: HTMLDivElement = node
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      e.stopPropagation()
      const rect = host.getBoundingClientRect()
      const plotW = Math.max(1, rect.width - yAxisPx - rightPx)
      const frac = (e.clientX - rect.left - yAxisPx) / plotW
      const zoomIn = e.deltaY < 0
      setWin((w) => {
        const { start: curStart, end: curEnd } = indexWindowFromDates(data, w)
        const next = zoomIndexWindow(
          data.length,
          curStart,
          curEnd,
          frac,
          zoomIn,
          minSpan,
        )
        const from = data[next.start]?.date
        const to = data[next.end]?.date
        if (!from || !to) return w
        if (next.start <= 0 && next.end >= data.length - 1) return null
        return { from, to }
      })
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [data, yAxisPx, rightPx, minSpan])

  function applyWindow(nextStart: number, nextEnd: number) {
    const from = data[nextStart]?.date
    const to = data[nextEnd]?.date
    if (!from || !to) return
    if (nextStart <= 0 && nextEnd >= last) {
      setWin(null)
      return
    }
    setWin({ from, to })
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || data.length < 2 || !zoomed) return
    e.preventDefault()
    dragRef.current = { x: e.clientX, start, end }
    e.currentTarget.setPointerCapture(e.pointerId)
    setPanning(true)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    const host = chartRef.current
    if (!host) return
    const plotW = Math.max(1, host.getBoundingClientRect().width - yAxisPx - rightPx)
    const span = Math.max(1, drag.end - drag.start)
    const delta = Math.round((-(e.clientX - drag.x) / plotW) * span)
    const next = panIndexWindow(data.length, drag.start, drag.end, delta)
    applyWindow(next.start, next.end)
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setPanning(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const surfaceClass =
    panning ? 'cursor-grabbing select-none' : zoomed ? 'cursor-grab' : ''

  return {
    chartRef,
    panning,
    zoomed,
    start,
    end,
    visible,
    surfaceClass,
    resetWindow: () => setWin(null),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }
}
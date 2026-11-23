/** Minimum number of index steps in a zoomed chart window. */
export const CHART_ZOOM_MIN_SPAN = 20

const DEFAULT_ZOOM_FACTOR = 0.75

export function zoomIndexWindow(
  length: number,
  start: number,
  end: number,
  anchorFrac: number,
  zoomIn: boolean,
  minSpan = CHART_ZOOM_MIN_SPAN,
): { start: number; end: number } {
  if (length < 2) return { start: 0, end: Math.max(0, length - 1) }
  const last = length - 1
  const span = Math.max(1, end - start)
  const frac = Math.min(1, Math.max(0, anchorFrac))
  let nextSpan = zoomIn
    ? Math.floor(span * DEFAULT_ZOOM_FACTOR)
    : Math.ceil(span / DEFAULT_ZOOM_FACTOR)
  nextSpan = Math.max(minSpan, Math.min(last, nextSpan))
  if (!zoomIn && start <= 0 && end >= last) return { start: 0, end: last }
  const center = start + frac * span
  let nextStart = Math.round(center - frac * nextSpan)
  let nextEnd = nextStart + nextSpan
  if (nextStart < 0) {
    nextEnd -= nextStart
    nextStart = 0
  }
  if (nextEnd > last) {
    nextStart -= nextEnd - last
    nextEnd = last
  }
  nextStart = Math.max(0, nextStart)
  nextEnd = Math.min(last, Math.max(nextStart + 1, nextEnd))
  return { start: nextStart, end: nextEnd }
}

/** Shift a window by `deltaIndex` points, keeping span, clamped to the series. */
export function panIndexWindow(
  length: number,
  start: number,
  end: number,
  deltaIndex: number,
): { start: number; end: number } {
  if (length < 2) return { start: 0, end: Math.max(0, length - 1) }
  const last = length - 1
  const span = Math.max(1, end - start)
  let nextStart = start + deltaIndex
  let nextEnd = nextStart + span
  if (nextStart < 0) {
    nextStart = 0
    nextEnd = span
  }
  if (nextEnd > last) {
    nextEnd = last
    nextStart = last - span
  }
  nextStart = Math.max(0, nextStart)
  nextEnd = Math.min(last, Math.max(nextStart + 1, nextEnd))
  return { start: nextStart, end: nextEnd }
}

export function indexWindowFromDates<T extends { date: string }>(
  data: readonly T[],
  win: { from: string; to: string } | null,
): { start: number; end: number } {
  const last = Math.max(0, data.length - 1)
  if (data.length === 0) return { start: 0, end: 0 }
  if (!win) return { start: 0, end: last }
  const lo = data.findIndex((d) => d.date >= win.from)
  let start = lo < 0 ? 0 : lo
  let end = start
  for (let i = data.length - 1; i >= start; i--) {
    if (data[i]!.date <= win.to) {
      end = i
      break
    }
  }
  if (end <= start) end = Math.min(last, start + 1)
  return { start, end }
}
/** Excel-style TSV / newline clipboard → rows of cell strings. */
export function parseClipboardGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length === 0) return []
  const hasTab = lines.some((l) => l.includes('\t'))
  return lines.map((line) => (hasTab ? line.split('\t') : [line]))
}

export function sheetCellSelector(sheet: string, row: number, col: number): string {
  return `[data-sheet="${sheet}"][data-sheet-row="${row}"][data-sheet-col="${col}"]`
}

export function focusSheetCell(sheet: string, row: number, col: number): boolean {
  const el = document.querySelector<HTMLInputElement>(sheetCellSelector(sheet, row, col))
  if (!el || el.disabled) return false
  el.focus()
  el.select()
  return true
}

function caretAtStart(el: HTMLInputElement): boolean {
  const start = el.selectionStart
  const end = el.selectionEnd
  if (start == null || end == null) return true
  return start === 0 && end === 0
}

function caretAtEnd(el: HTMLInputElement): boolean {
  const start = el.selectionStart
  const end = el.selectionEnd
  const n = el.value.length
  if (start == null || end == null) return true
  return start === n && end === n
}

type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter'

function navDelta(
  key: NavKey,
  shift: boolean,
  el: HTMLInputElement,
): { dRow: number; dCol: number } | null {
  if (key === 'Enter') return { dRow: shift ? -1 : 1, dCol: 0 }
  if (key === 'ArrowUp') return { dRow: -1, dCol: 0 }
  if (key === 'ArrowDown') return { dRow: 1, dCol: 0 }
  if (key === 'ArrowLeft' && caretAtStart(el)) return { dRow: 0, dCol: -1 }
  if (key === 'ArrowRight' && caretAtEnd(el)) return { dRow: 0, dCol: 1 }
  return null
}

export function handleSheetNavKey(
  e: { key: string; shiftKey: boolean; preventDefault: () => void; currentTarget: HTMLInputElement },
  sheet: string,
  row: number,
  col: number,
  commit: (raw: string) => void,
): void {
  if (
    e.key !== 'ArrowUp' &&
    e.key !== 'ArrowDown' &&
    e.key !== 'ArrowLeft' &&
    e.key !== 'ArrowRight' &&
    e.key !== 'Enter'
  ) {
    return
  }
  const delta = navDelta(e.key, e.shiftKey, e.currentTarget)
  if (!delta) return
  e.preventDefault()
  commit(e.currentTarget.value)
  let r = row + delta.dRow
  let c = col + delta.dCol
  for (let i = 0; i < 48; i++) {
    if (r < 0 || c < 0) return
    if (focusSheetCell(sheet, r, c)) return
    r += delta.dRow
    c += delta.dCol
  }
}

export function handleSheetPaste(
  e: { clipboardData: DataTransfer | null; preventDefault: () => void },
  startRow: number,
  startCol: number,
  apply: (row: number, col: number, raw: string) => boolean,
): boolean {
  const text = e.clipboardData?.getData('text/plain') ?? ''
  const grid = parseClipboardGrid(text)
  if (grid.length === 0) return false
  if (grid.length === 1 && (grid[0]?.length ?? 0) <= 1) return false
  e.preventDefault()
  for (let i = 0; i < grid.length; i++) {
    const line = grid[i] ?? []
    for (let j = 0; j < line.length; j++) {
      apply(startRow + i, startCol + j, line[j] ?? '')
    }
  }
  return true
}

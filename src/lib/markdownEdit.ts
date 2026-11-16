export type MarkdownEditAction = 'bold' | 'italic' | 'bullet' | 'heading'

export function applyMarkdownEdit(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownEditAction,
): { next: string; selectionStart: number; selectionEnd: number } {
  const selStart = Math.max(0, Math.min(selectionStart, value.length))
  const selEnd = Math.max(selStart, Math.min(selectionEnd, value.length))
  const selected = value.slice(selStart, selEnd)

  if (action === 'bullet' || action === 'heading') {
    const lineStart = value.lastIndexOf('\n', selStart - 1) + 1
    const lineEndRaw = value.indexOf('\n', selEnd)
    const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw
    const line = value.slice(lineStart, lineEnd)
    const prefix = action === 'bullet' ? '- ' : '## '
    let stripped = line
    if (action === 'bullet' && /^[-*] /.test(line)) {
      stripped = line.replace(/^[-*] /, '')
    } else if (action === 'heading' && /^#{1,3} /.test(line)) {
      stripped = line.replace(/^#{1,3} /, '')
    }
    const nextLine = stripped.trim() ? `${prefix}${stripped}` : prefix
    const next = value.slice(0, lineStart) + nextLine + value.slice(lineEnd)
    const cursor = lineStart + nextLine.length
    return { next, selectionStart: cursor, selectionEnd: cursor }
  }

  const wrappers: Record<'bold' | 'italic', [string, string]> = {
    bold: ['**', '**'],
    italic: ['*', '*'],
  }
  const [open, close] = wrappers[action]
  if (selected) {
    const next =
      value.slice(0, selStart) + open + selected + close + value.slice(selEnd)
    const innerStart = selStart + open.length
    const innerEnd = innerStart + selected.length
    return { next, selectionStart: innerStart, selectionEnd: innerEnd }
  }
  const next = value.slice(0, selStart) + open + close + value.slice(selEnd)
  const cursor = selStart + open.length
  return { next, selectionStart: cursor, selectionEnd: cursor }
}
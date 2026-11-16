import { useRef, type ReactNode } from 'react'
import { INVESTMENT_THESIS_MAX_LENGTH } from '../../lib/investmentThesis'
import { applyMarkdownEdit, type MarkdownEditAction } from '../../lib/markdownEdit'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  rows?: number
  'aria-label'?: string
}

function ToolbarButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function MarkdownTextarea({
  value,
  onChange,
  placeholder,
  id,
  rows = 4,
  'aria-label': ariaLabel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function runAction(action: MarkdownEditAction) {
    const el = ref.current
    if (!el) return
    const { next, selectionStart, selectionEnd } = applyMarkdownEdit(
      value,
      el.selectionStart,
      el.selectionEnd,
      action,
    )
    const clipped =
      next.length > INVESTMENT_THESIS_MAX_LENGTH
        ? next.slice(0, INVESTMENT_THESIS_MAX_LENGTH)
        : next
    onChange(clipped)
    requestAnimationFrame(() => {
      el.focus()
      const end = Math.min(selectionEnd, clipped.length)
      const start = Math.min(selectionStart, end)
      el.setSelectionRange(start, end)
    })
  }

  return (
    <div className="space-y-1.5">
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-1 py-1"
        role="toolbar"
        aria-label="Text formatting"
      >
        <ToolbarButton label="Bold" title="Bold (**text**)" onClick={() => runAction('bold')}>
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton label="Italic" title="Italic (*text*)" onClick={() => runAction('italic')}>
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton label="Bullet list" title="Bullet list" onClick={() => runAction('bullet')}>
          •
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          title="Section heading (##)"
          onClick={() => runAction('heading')}
        >
          H
        </ToolbarButton>
      </div>
      <textarea
        ref={ref}
        id={id}
        className="input min-h-[5rem] w-full resize-y !py-2 !text-sm leading-relaxed"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={INVESTMENT_THESIS_MAX_LENGTH}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-[10px] text-white/30">
        {value.length.toLocaleString()} / {INVESTMENT_THESIS_MAX_LENGTH.toLocaleString()} · light
        markdown only
      </p>
    </div>
  )
}
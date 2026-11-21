import Bold from '@tiptap/extension-bold'
import BulletList from '@tiptap/extension-bullet-list'
import Code from '@tiptap/extension-code'
import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import History from '@tiptap/extension-history'
import Italic from '@tiptap/extension-italic'
import ListItem from '@tiptap/extension-list-item'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Markdown } from 'tiptap-markdown'
import { INVESTMENT_THESIS_MAX_LENGTH } from '../../lib/investmentThesis'
import { canAcceptThesisMarkdown } from '../../lib/thesisEditor'

type Props = {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  id?: string
  'aria-label'?: string
}

function ToolbarButton({
  label,
  title,
  active,
  onClick,
  children,
}: {
  label: string
  title: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
        active
          ? 'bg-white/15 text-white'
          : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
      aria-label={label}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function InvestmentThesisEditor({
  value,
  onChange,
  placeholder,
  id,
  'aria-label': ariaLabel,
}: Props) {
  const lastGood = useRef(value)
  const syncing = useRef(false)

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Code,
      BulletList,
      ListItem,
      Heading.configure({ levels: [2, 3] }),
      History,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        bulletListMarker: '-',
        breaks: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        'aria-label': ariaLabel ?? 'Investment thesis',
        class:
          'thesis-prose min-h-[min(60vh,28rem)] w-full px-1 py-2 text-sm leading-relaxed text-white/85 focus:outline-none',
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (syncing.current) return
      const md = ed.storage.markdown.getMarkdown() as string
      if (!canAcceptThesisMarkdown(lastGood.current, md)) {
        syncing.current = true
        ed.commands.setContent(lastGood.current, false)
        syncing.current = false
        return
      }
      lastGood.current = md
      onChange(md)
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.storage.markdown.getMarkdown() as string
    if (current === value) return
    syncing.current = true
    editor.commands.setContent(value, false)
    lastGood.current = value
    syncing.current = false
  }, [editor, value])

  useEffect(() => {
    lastGood.current = value
  }, [value])

  if (!editor) return null

  const atCap = lastGood.current.length >= INVESTMENT_THESIS_MAX_LENGTH

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-1 py-1"
        role="toolbar"
        aria-label="Text formatting"
      >
        <ToolbarButton
          label="Bold"
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          title="Section heading"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H
        </ToolbarButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] px-3">
        <EditorContent editor={editor} />
      </div>
      <p
        className={`text-[10px] ${atCap ? 'text-amber-300/90' : 'text-white/30'}`}
        aria-live="polite"
      >
        {lastGood.current.length.toLocaleString()} / {INVESTMENT_THESIS_MAX_LENGTH.toLocaleString()}
        {atCap ? ' · at limit — delete or replace to add more' : ''}
      </p>
    </div>
  )
}
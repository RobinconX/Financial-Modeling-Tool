import type { ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  /** Bold `**x**`, italic `*x*` (not `**`), inline `code`. */
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) != null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={key++} className="text-white/90">
          {token.slice(1, -1)}
        </em>,
      )
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-white/85"
        >
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

type Props = {
  source: string
  className?: string
}

/**
 * Safe subset of markdown for user thesis text: paragraphs, ##/###, **bold**,
 * *italic*, `-` lists, inline `code`. No HTML, images, or links.
 */
export function LightMarkdown({ source, className = '' }: Props) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i += 1
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h4
          key={key++}
          className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-300/85 first:mt-0"
        >
          {renderInline(line.slice(4))}
        </h4>,
      )
      i += 1
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h3
          key={key++}
          className="mt-4 mb-1.5 border-l-2 border-emerald-400/70 pl-2 text-sm font-semibold text-emerald-400/90 first:mt-0"
        >
          {renderInline(line.slice(3))}
        </h3>,
      )
      i += 1
      continue
    }

    if (/^[-*] /.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^[-*] /.test(lines[i]!)) {
        items.push(
          <li key={key++} className="leading-relaxed marker:text-emerald-400/55">
            {renderInline(lines[i]!.replace(/^[-*] /, ''))}
          </li>,
        )
        i += 1
      }
      blocks.push(
        <ul key={key++} className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] text-white/75">
          {items}
        </ul>,
      )
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.startsWith('#') &&
      !/^[-*] /.test(lines[i]!)
    ) {
      para.push(lines[i]!)
      i += 1
    }
    blocks.push(
      <p key={key++} className="mt-2 text-[13px] leading-[1.65] text-white/75 first:mt-0">
        {renderInline(para.join(' '))}
      </p>,
    )
  }

  return <div className={`space-y-0.5 ${className}`}>{blocks}</div>
}
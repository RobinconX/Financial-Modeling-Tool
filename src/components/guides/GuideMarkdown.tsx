import type { ReactNode } from 'react'
import type { GuideReference } from '../../lib/teachings'
import { publicAssetUrl } from '../../lib/publicAssetUrl'
import { GuideFigure } from './GuideFigure'

type Props = {
  source: string
  className?: string
  /** Optional media map; `![alt](ref:id)` resolves against these. */
  references?: GuideReference[]
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) != null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-emerald-200/90"
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

function resolveSrc(
  raw: string,
  references: GuideReference[] | undefined,
): { src: string; caption?: string; altFallback?: string } | null {
  const t = raw.trim()
  if (!t) return null
  if (t.startsWith('ref:')) {
    const id = t.slice(4)
    const hit = references?.find((r) => r.id === id)
    if (!hit) return null
    return {
      src: publicAssetUrl(hit.src),
      caption: hit.caption,
      altFallback: hit.alt,
    }
  }
  // Shipped assets (base-aware), absolute https, or future API URLs
  return { src: publicAssetUrl(t) }
}

/**
 * Minimal markdown for feature-guide bodies: paragraphs, ##/###, **bold**,
 * unordered lists, inline `code`, and images (`![alt](src)` or `![alt](ref:id)`).
 */
export function GuideMarkdown({ source, className = '', references }: Props) {
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

    const img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line.trim())
    if (img) {
      const alt = img[1] ?? ''
      const resolved = resolveSrc(img[2] ?? '', references)
      i += 1
      if (!resolved) continue
      blocks.push(
        <GuideFigure
          key={key++}
          src={resolved.src}
          alt={alt || resolved.altFallback || ''}
          caption={resolved.caption}
        />,
      )
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={key++} className="mt-3 text-xs font-semibold tracking-wide text-white/80">
          {renderInline(line.slice(4))}
        </h4>,
      )
      i += 1
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={key++} className="mt-4 text-sm font-semibold tracking-wide text-white/90 first:mt-0">
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
          <li key={key++} className="leading-relaxed">
            {renderInline(lines[i]!.replace(/^[-*] /, ''))}
          </li>,
        )
        i += 1
      }
      blocks.push(
        <ul key={key++} className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] text-white/75">
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
      !/^[-*] /.test(lines[i]!) &&
      !/^!\[/.test(lines[i]!.trim())
    ) {
      para.push(lines[i]!)
      i += 1
    }
    blocks.push(
      <p key={key++} className="mt-2 text-[13px] leading-relaxed text-white/75 first:mt-0">
        {renderInline(para.join(' '))}
      </p>,
    )
  }

  return <div className={className}>{blocks}</div>
}

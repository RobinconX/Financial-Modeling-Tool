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
      nodes.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      )
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-emerald-400/10 px-1 py-0.5 font-mono text-[11px] text-emerald-200/90"
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
 * unordered lists, blockquotes (`>` callouts), inline `code`, and images
 * (`![alt](src)` or `![alt](ref:id)`).
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
        <h4
          key={key++}
          className="mt-5 mb-1 pl-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-300/85 first:mt-0"
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
          className="mt-6 mb-2 border-l-2 border-emerald-400/90 pl-2.5 text-sm font-semibold tracking-wide text-emerald-400/90 first:mt-0"
        >
          {renderInline(line.slice(3))}
        </h3>,
      )
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push(
        <aside
          key={key++}
          className="mt-3 ml-3 rounded-r-md border-l-2 border-sky-400/55 bg-sky-400/[0.07] px-3 py-2.5 text-[13px] leading-relaxed text-sky-50/85"
        >
          {renderInline(quoteLines.join(' '))}
        </aside>,
      )
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
        <ul key={key++} className="mt-2.5 list-disc space-y-2 pl-8 text-[13px] text-white/70">
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
      !/^>\s?/.test(lines[i]!) &&
      !/^!\[/.test(lines[i]!.trim())
    ) {
      para.push(lines[i]!)
      i += 1
    }
    blocks.push(
      <p key={key++} className="mt-2.5 pl-3 text-[13px] leading-[1.65] text-white/68 first:mt-0">
        {renderInline(para.join(' '))}
      </p>,
    )
  }

  return <div className={`space-y-0.5 ${className}`}>{blocks}</div>
}

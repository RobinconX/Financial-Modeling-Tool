import type { MouseEvent } from 'react'

type Props = {
  label: string
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  className?: string
  'data-guide-anchor'?: string
}

/** Document icon control — Comparables read rail + Analyze editor modal. */
export function ThesisDocumentIcon({
  label,
  onClick,
  className = '',
  'data-guide-anchor': guideAnchor,
}: Props) {
  return (
    <button
      type="button"
      data-guide-anchor={guideAnchor}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/45 hover:bg-white/10 hover:text-emerald-300 ${className}`}
      aria-label={label}
      onClick={onClick}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    </button>
  )
}
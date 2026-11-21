import type { MouseEvent } from 'react'
import { investmentThesisModalWarmHandlers } from './investmentThesisModalLazy'
import { ThesisDocumentGlyph } from './ThesisDocumentIcon'

type Props = {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  className?: string
}

/** Secondary control to start a thesis when none exists yet (Analyze). */
export function AddThesisButton({ onClick, className = '' }: Props) {
  return (
    <button
      type="button"
      className={`btn-ghost gap-1.5 !py-1 !text-xs ${className}`}
      onClick={onClick}
      {...investmentThesisModalWarmHandlers}
    >
      <ThesisDocumentGlyph className="text-white/55" />
      Add thesis
    </button>
  )
}
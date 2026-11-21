import { useEffect, type ReactNode } from 'react'
import { FeatureGuideButton } from '../guides/FeatureGuideButton'
import { InvestmentThesisEditor } from './InvestmentThesisEditor'

type Props = {
  open: boolean
  onClose: () => void
  symbol: string
  scenarioName: string
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
}

export function InvestmentThesisModal({
  open,
  onClose,
  symbol,
  scenarioName,
  value,
  onChange,
  placeholder,
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="thesis-modal-title"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-4xl flex-col gap-3 p-5 shadow-2xl"
        data-guide-anchor="projections.thesis"
        onClick={(e) => e.stopPropagation()}
      >
        <ThesisModalHeader symbol={symbol} scenarioName={scenarioName} onClose={onClose} />
        <InvestmentThesisEditor
          id="investment-thesis-editor"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-label="Investment thesis"
        />
      </div>
    </div>
  )
}

function ThesisModalHeader({
  symbol,
  scenarioName,
  onClose,
}: {
  symbol: string
  scenarioName: string
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 pb-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
          {symbol}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <h2 id="thesis-modal-title" className="text-lg font-semibold text-white">
            Investment thesis
          </h2>
          <FeatureGuideButton id="projections.thesis" />
        </div>
        <p className="truncate text-sm text-white/45">{scenarioName}</p>
      </div>
      <button type="button" className="btn-ghost shrink-0 !py-1 !text-xs" onClick={onClose}>
        Close
      </button>
    </div>
  )
}
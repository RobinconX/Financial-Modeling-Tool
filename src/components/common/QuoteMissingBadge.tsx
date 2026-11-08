import { quoteMissingDataWarning } from '../../lib/quoteValidation'

type Props = {
  symbol: string
  className?: string
}

/** Compact indicator for lists (selector, comparables, holdings). */
export function QuoteMissingBadge({ symbol, className = '' }: Props) {
  const title = quoteMissingDataWarning(symbol)
  return (
    <span
      className={`shrink-0 rounded border border-amber-500/40 bg-amber-500/15 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-amber-200/90 ${className}`}
      title={title}
    >
      No quote
    </span>
  )
}

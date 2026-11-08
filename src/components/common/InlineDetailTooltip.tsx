import type { ReactNode } from 'react'

type Props = {
  /** Accessible name for the trigger (screen readers). */
  label: string
  children: ReactNode
  /** Anchor tooltip relative to the trigger */
  align?: 'start' | 'center' | 'end'
  /** Default below the trigger; `top` opens above (tables). */
  side?: 'bottom' | 'top'
  className?: string
  /** Extra classes on the tooltip panel */
  panelClassName?: string
  /** Visible trigger (e.g. planned-trade ▸ in the year grid). */
  trigger: ReactNode
}

/** Hover/focus tooltip anchored on a custom inline trigger (not feature-description hints). */
export function InlineDetailTooltip({
  label,
  children,
  align = 'start',
  side = 'bottom',
  className = '',
  panelClassName = '',
  trigger,
}: Props) {
  const pos =
    align === 'end'
      ? 'right-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0'
  const place =
    side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'

  return (
    <span className={`group/info relative inline-flex shrink-0 align-middle ${className}`}>
      <button
        type="button"
        className="inline-flex items-center justify-center text-sky-300/80 transition hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        aria-label={label}
      >
        {trigger}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[80] hidden w-64 rounded-lg border border-white/12 bg-[#121820] px-3 py-2.5 text-left text-[12px] leading-relaxed font-normal normal-case tracking-normal text-white/85 shadow-xl group-hover/info:block group-focus-within/info:block ${place} ${pos} ${panelClassName}`}
      >
        {children}
      </span>
    </span>
  )
}

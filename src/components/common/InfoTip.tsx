import type { ReactNode } from 'react'

type Props = {
  /** Accessible name for the trigger (screen readers). */
  label: string
  children: ReactNode
  /** Anchor tooltip relative to the icon */
  align?: 'start' | 'center' | 'end'
  className?: string
}

/**
 * Progressive disclosure for UI hints: small ⓘ, content on hover/focus.
 */
export function InfoTip({ label, children, align = 'start', className = '' }: Props) {
  const pos =
    align === 'end'
      ? 'right-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0'

  return (
    <span className={`group/info relative inline-flex shrink-0 align-middle ${className}`}>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 text-[10px] font-semibold leading-none text-white/45 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        aria-label={label}
      >
        i
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-50 mt-2 hidden w-64 rounded-lg border border-white/12 bg-[#121820] px-3 py-2.5 text-left text-[12px] leading-relaxed font-normal normal-case tracking-normal text-white/85 shadow-xl group-hover/info:block group-focus-within/info:block ${pos}`}
      >
        {children}
      </span>
    </span>
  )
}

import { isGuideReady, type FeatureGuideId } from '../../lib/teachings'
import { useFeatureGuide } from './FeatureGuideProvider'

type Props = {
  id: FeatureGuideId
  className?: string
}

/** Compact guide trigger; renders nothing when the id is missing or draft. */
export function FeatureGuideButton({ id, className = '' }: Props) {
  const { openGuide, open, pane, activeId } = useFeatureGuide()
  if (!isGuideReady(id)) return null

  const active = open && pane === 'article' && activeId === id

  return (
    <button
      type="button"
      className={`inline-flex h-5 items-center rounded border border-white/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45 transition hover:border-white/20 hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
        active ? 'border-emerald-500/40 text-emerald-300/90' : ''
      } ${className}`}
      aria-label="Open feature guide"
      aria-expanded={active}
      onClick={() => openGuide(id)}
    >
      Guide
    </button>
  )
}

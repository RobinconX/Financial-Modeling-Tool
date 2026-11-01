import { useFeatureGuide } from './FeatureGuideProvider'

/** Sticky-header entry to the global guide registry. */
export function GuidesHeaderButton() {
  const { openRegistry, close, open } = useFeatureGuide()

  return (
    <button
      type="button"
      className={`btn-ghost !py-1.5 !text-xs ${
        open ? '!border-emerald-500/40 !text-emerald-300/90' : ''
      }`}
      aria-expanded={open}
      onClick={() => (open ? close() : openRegistry())}
    >
      Guides
    </button>
  )
}

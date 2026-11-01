import { useEffect } from 'react'
import { FeatureGuideArticle } from './FeatureGuideArticle'
import { FeatureGuideIndex } from './FeatureGuideIndex'
import { useFeatureGuide } from './FeatureGuideProvider'

/** Non-blocking right rail — push layout sibling, not a modal overlay. */
export function FeatureGuideRail() {
  const { open, pane, activeId, close } = useFeatureGuide()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <aside
      className="flex h-full w-[min(100%,24rem)] shrink-0 flex-col border-l border-white/10 bg-[#121820]"
      aria-label="Feature guides"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white">
          {pane === 'index' ? 'Guides' : 'Guide'}
        </h2>
        <button type="button" className="btn-ghost shrink-0 !py-1 !text-xs" onClick={close}>
          Close
        </button>
      </div>

      {pane === 'index' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <FeatureGuideIndex />
        </div>
      ) : activeId != null ? (
        <FeatureGuideArticle id={activeId} />
      ) : null}
    </aside>
  )
}

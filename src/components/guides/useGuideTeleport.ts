import { useEffect, useRef } from 'react'
import type { AppTab } from '../../types'
import { useFeatureGuide } from './FeatureGuideProvider'

/**
 * When a guide teleport targets this tab, apply optional sub-view then scroll
 * to `[data-guide-anchor]`. Falls back to comps root for unmounted chart anchors.
 */
export function useGuideTeleport(
  tab: AppTab,
  applyView?: (view: string | undefined) => void,
) {
  const { pendingFocus, clearPendingFocus } = useFeatureGuide()
  const applyRef = useRef(applyView)
  applyRef.current = applyView

  useEffect(() => {
    if (!pendingFocus || pendingFocus.tab !== tab) return

    applyRef.current?.(pendingFocus.view)

    const anchor = pendingFocus.anchor
    const clear = clearPendingFocus

    const t = window.setTimeout(() => {
      const el =
        document.querySelector(`[data-guide-anchor="${CSS.escape(anchor)}"]`) ??
        (anchor.startsWith('comparables.')
          ? document.querySelector('[data-guide-anchor="projections.comps"]')
          : null)
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      clear()
    }, 80)

    return () => window.clearTimeout(t)
  }, [pendingFocus, tab, clearPendingFocus])
}

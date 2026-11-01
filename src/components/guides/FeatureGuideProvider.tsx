import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getGuide,
  type FeatureGuideId,
  type GuideLocation,
} from '../../lib/teachings'
import type { AppTab } from '../../types'

type Pane = 'index' | 'article'

type FeatureGuideContextValue = {
  open: boolean
  pane: Pane
  activeId: FeatureGuideId | null
  pendingFocus: GuideLocation | null
  openRegistry: () => void
  /** Opens article for ready or draft; teleports via pendingFocus + navigateTab. */
  openGuide: (id: FeatureGuideId) => void
  showIndex: () => void
  close: () => void
  clearPendingFocus: () => void
}

const FeatureGuideContext = createContext<FeatureGuideContextValue | null>(null)

type ProviderProps = {
  children: ReactNode
  navigateTab: (tab: AppTab) => void
}

export function FeatureGuideProvider({ children, navigateTab }: ProviderProps) {
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('index')
  const [activeId, setActiveId] = useState<FeatureGuideId | null>(null)
  const [pendingFocus, setPendingFocus] = useState<GuideLocation | null>(null)

  const openRegistry = useCallback(() => {
    setOpen(true)
    setPane('index')
  }, [])

  const openGuide = useCallback(
    (id: FeatureGuideId) => {
      const guide = getGuide(id)
      if (!guide) return
      setOpen(true)
      setPane('article')
      setActiveId(id)
      setPendingFocus(guide.location)
      navigateTab(guide.location.tab)
    },
    [navigateTab],
  )

  const showIndex = useCallback(() => {
    setOpen(true)
    setPane('index')
  }, [])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const clearPendingFocus = useCallback(() => setPendingFocus(null), [])

  const value = useMemo(
    () => ({
      open,
      pane,
      activeId,
      pendingFocus,
      openRegistry,
      openGuide,
      showIndex,
      close,
      clearPendingFocus,
    }),
    [
      open,
      pane,
      activeId,
      pendingFocus,
      openRegistry,
      openGuide,
      showIndex,
      close,
      clearPendingFocus,
    ],
  )

  return (
    <FeatureGuideContext.Provider value={value}>{children}</FeatureGuideContext.Provider>
  )
}

export function useFeatureGuide(): FeatureGuideContextValue {
  const ctx = useContext(FeatureGuideContext)
  if (!ctx) {
    throw new Error('useFeatureGuide must be used within FeatureGuideProvider')
  }
  return ctx
}

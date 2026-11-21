import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { clipInvestmentThesis } from '../../lib/investmentThesis'

export type ThesisRailView = {
  scenarioId: string
  symbol: string
  scenarioName: string
  thesis: string
}

type ContextValue = {
  open: boolean
  view: ThesisRailView | null
  openThesis: (view: ThesisRailView) => void
  close: () => void
  patchThesis: (scenarioId: string, markdown: string) => void
}

const ThesisRailContext = createContext<ContextValue | null>(null)

type ProviderProps = {
  children: ReactNode
  onPatchThesis?: (scenarioId: string, markdown: string) => void
}

export function ThesisRailProvider({ children, onPatchThesis }: ProviderProps) {
  const [view, setView] = useState<ThesisRailView | null>(null)

  const openThesis = useCallback((next: ThesisRailView) => {
    setView(next)
  }, [])

  const close = useCallback(() => {
    setView(null)
  }, [])

  const patchThesis = useCallback(
    (scenarioId: string, markdown: string) => {
      const clipped = clipInvestmentThesis(markdown)
      setView((current) =>
        current?.scenarioId === scenarioId ? { ...current, thesis: clipped } : current,
      )
      onPatchThesis?.(scenarioId, clipped)
    },
    [onPatchThesis],
  )

  const value = useMemo(
    () => ({
      open: view != null,
      view,
      openThesis,
      close,
      patchThesis,
    }),
    [view, openThesis, close, patchThesis],
  )

  return <ThesisRailContext.Provider value={value}>{children}</ThesisRailContext.Provider>
}

export function useThesisRail(): ContextValue {
  const ctx = useContext(ThesisRailContext)
  if (!ctx) {
    throw new Error('useThesisRail must be used within ThesisRailProvider')
  }
  return ctx
}
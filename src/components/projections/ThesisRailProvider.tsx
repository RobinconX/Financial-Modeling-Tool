import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThesisRailView = {
  symbol: string
  scenarioName: string
  thesis: string
}

type ContextValue = {
  open: boolean
  view: ThesisRailView | null
  openThesis: (view: ThesisRailView) => void
  close: () => void
}

const ThesisRailContext = createContext<ContextValue | null>(null)

export function ThesisRailProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ThesisRailView | null>(null)

  const openThesis = useCallback((next: ThesisRailView) => {
    setView(next)
  }, [])

  const close = useCallback(() => {
    setView(null)
  }, [])

  const value = useMemo(
    () => ({
      open: view != null,
      view,
      openThesis,
      close,
    }),
    [view, openThesis, close],
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
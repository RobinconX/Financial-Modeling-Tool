import { lazy } from 'react'

type ModalModule = typeof import('./InvestmentThesisModal')

let modalModulePromise: Promise<ModalModule> | null = null

/** Shared dynamic import — used by React.lazy and preloading. */
export function loadInvestmentThesisModalModule(): Promise<ModalModule> {
  if (!modalModulePromise) {
    modalModulePromise = import('./InvestmentThesisModal')
  }
  return modalModulePromise
}

export function preloadInvestmentThesisModal(): void {
  void loadInvestmentThesisModalModule()
}

export const InvestmentThesisModalLazy = lazy(async () => {
  const m = await loadInvestmentThesisModalModule()
  return { default: m.InvestmentThesisModal }
})

const IDLE_PRELOAD_DELAY_MS = 2500

/** Begin loading the thesis modal chunk after startup, when the main thread is idle. */
export function scheduleInvestmentThesisModalIdlePreload(): () => void {
  let idleId: number | null = null
  const timeoutId = window.setTimeout(() => {
    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(() => preloadInvestmentThesisModal(), { timeout: 3000 })
    } else {
      preloadInvestmentThesisModal()
    }
  }, IDLE_PRELOAD_DELAY_MS)

  return () => {
    window.clearTimeout(timeoutId)
    if (idleId != null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleId)
    }
  }
}

export const investmentThesisModalWarmHandlers = {
  onPointerEnter: () => preloadInvestmentThesisModal(),
  onFocus: () => preloadInvestmentThesisModal(),
  onPointerDown: () => preloadInvestmentThesisModal(),
} as const
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import './index.css'
import { registerAppRemount } from './lib/appRemount'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'
import { maybeSeedExample } from './lib/exampleSeed'
import {
  runPreRenderBootHydrate,
  schedulePostRenderBootHydrate,
} from './lib/linkedFileBoot'

let root: Root | null = null
let remountGeneration = 0

function renderApp(): void {
  const el = document.getElementById('root')
  if (!el) return
  if (!root) root = createRoot(el)
  remountGeneration += 1
  const gen = remountGeneration
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <App key={gen} />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

registerAppRemount(() => {
  renderApp()
})

let prerenderHydrateOutcome: Awaited<ReturnType<typeof runPreRenderBootHydrate>> = {
  status: 'none',
}

void runPreRenderBootHydrate()
  .then((outcome) => {
    prerenderHydrateOutcome = outcome
    return maybeSeedExample()
  })
  .finally(() => {
    renderApp()
    schedulePostRenderBootHydrate(prerenderHydrateOutcome)
  })
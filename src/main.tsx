import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import './index.css'
import { hydrateOnStartup } from './lib/accountCatalog'
import { maybeSeedExample } from './lib/exampleSeed'
import { registerAppRemount } from './lib/appRemount'
import { readLinkedSnapshot, syncPeriodicLinkedSaves } from './lib/linkedDataFile'

/**
 * If a data file is linked and readable, load it into localStorage before React
 * so hooks pick up the file as the source of truth on first paint.
 *
 * Permission may still be "prompt" until the user allows — then Settings can
 * call requestLinkedFileAccess from a button (user gesture).
 */
async function hydrateFromLinkedFile(): Promise<void> {
  try {
    const snap = await readLinkedSnapshot()
    if (snap == null) return
    if ('error' in snap) {
      console.warn('[data] Linked file not loaded:', snap.error)
      return
    }
    const result = hydrateOnStartup(snap)
    if (!result.ok) {
      console.warn('[data] Failed to apply linked file:', result.error)
    }
    syncPeriodicLinkedSaves()
  } catch (e) {
    console.warn('[data] Hydrate skipped', e)
  }
}

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
      <App key={gen} />
    </StrictMode>,
  )
}

registerAppRemount(() => {
  renderApp()
})

void hydrateFromLinkedFile()
  .then(() => maybeSeedExample())
  .finally(() => {
    renderApp()
  })

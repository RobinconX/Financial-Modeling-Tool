import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import {
  applyAppDataToLocalStorage,
  type AppDataSnapshot,
} from './lib/appDataSnapshot'
import { readLinkedSnapshot } from './lib/linkedDataFile'

/**
 * If a data file is linked and readable, load it into localStorage before React
 * so hooks pick up the file as the source of truth on first paint.
 */
async function hydrateFromLinkedFile(): Promise<void> {
  try {
    const snap = await readLinkedSnapshot()
    if (snap == null) return
    if ('error' in snap) {
      console.warn('[data] Linked file not loaded:', snap.error)
      return
    }
    const result = applyAppDataToLocalStorage(snap as AppDataSnapshot)
    if (!result.ok) {
      console.warn('[data] Failed to apply linked file:', result.error)
    }
  } catch (e) {
    console.warn('[data] Hydrate skipped', e)
  }
}

void hydrateFromLinkedFile().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

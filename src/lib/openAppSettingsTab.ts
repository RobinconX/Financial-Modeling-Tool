/** Same key as App.tsx — open Settings after reload or remount. */
const APP_TAB_KEY = 'grok-lab-app-tab'

export function persistOpenSettingsTab(): void {
  try {
    localStorage.setItem(APP_TAB_KEY, 'settings')
  } catch {
    /* ignore */
  }
}
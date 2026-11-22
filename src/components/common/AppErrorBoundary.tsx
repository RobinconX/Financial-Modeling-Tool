import { Component, type ErrorInfo, type ReactNode } from 'react'
import { persistOpenSettingsTab } from '../../lib/openAppSettingsTab'
import { unlinkDataFile } from '../../lib/linkedDataFile'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] render error', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleOpenSettings = (): void => {
    persistOpenSettingsTab()
    window.location.reload()
  }

  private handleUnlink = (): void => {
    void unlinkDataFile().finally(() => {
      window.location.reload()
    })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-4 text-white">
        <div
          className="max-w-md space-y-4 rounded-xl border border-red-500/30 bg-red-950/20 p-6 text-sm"
          role="alert"
        >
          <h1 className="text-lg font-semibold text-red-100">Something went wrong</h1>
          <p className="text-white/75">
            The app hit an unexpected error. Your browser data is still on this device.
          </p>
          <p className="break-words font-mono text-xs text-red-200/80">{error.message}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15"
              onClick={this.handleReload}
            >
              Reload
            </button>
            <button
              type="button"
              className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15"
              onClick={this.handleOpenSettings}
            >
              Open Settings
            </button>
            <button
              type="button"
              className="rounded-md border border-amber-400/35 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-500/25"
              onClick={this.handleUnlink}
            >
              Unlink file
            </button>
          </div>
        </div>
      </div>
    )
  }
}
/**
 * Soft remount of the React tree after bulk data apply.
 * Prefer this over location.reload() so File System Access permission
 * granted in the current session is not dropped.
 */

type RemountFn = () => void

let remountFn: RemountFn | null = null

export function registerAppRemount(fn: RemountFn): void {
  remountFn = fn
}

export function remountApp(): void {
  remountFn?.()
}

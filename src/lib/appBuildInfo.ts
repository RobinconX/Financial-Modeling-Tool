/** Shipped app version labels (injected at build time). */
export function getAppBuildInfo(): { packageVersion: string; gitSha: string; gitShaShort: string } {
  const packageVersion =
    typeof import.meta.env.VITE_APP_PACKAGE_VERSION === 'string' &&
    import.meta.env.VITE_APP_PACKAGE_VERSION.trim()
      ? import.meta.env.VITE_APP_PACKAGE_VERSION.trim()
      : '0.0.0'
  const gitSha =
    typeof import.meta.env.VITE_GIT_SHA === 'string' && import.meta.env.VITE_GIT_SHA.trim()
      ? import.meta.env.VITE_GIT_SHA.trim()
      : 'dev'
  const gitShaShort = gitSha === 'dev' ? 'dev' : gitSha.slice(0, 7)
  return { packageVersion, gitSha, gitShaShort }
}

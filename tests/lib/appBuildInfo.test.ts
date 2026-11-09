import { describe, expect, it, vi } from 'vitest'
import packageJson from '../../package.json'

describe('getAppBuildInfo', () => {
  it('exposes a non-placeholder package version from package.json at build time', async () => {
    vi.stubEnv('VITE_APP_PACKAGE_VERSION', packageJson.version)
    vi.stubEnv('VITE_GIT_SHA', 'abc1234deadbeef')
    const { getAppBuildInfo } = await import('../../src/lib/appBuildInfo')
    const info = getAppBuildInfo()
    expect(info.packageVersion).toBe(packageJson.version)
    expect(info.packageVersion).not.toBe('0.0.0')
    expect(info.gitShaShort).toBe('abc1234')
  })
})

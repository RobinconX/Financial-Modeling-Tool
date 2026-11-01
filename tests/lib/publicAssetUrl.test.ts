import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicAssetUrl } from '../../src/lib/publicAssetUrl'

describe('publicAssetUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('leaves absolute and data URLs alone', () => {
    expect(publicAssetUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
    expect(publicAssetUrl('data:image/png;base64,xx')).toBe('data:image/png;base64,xx')
  })

  it('prefixes root-relative paths with Vite BASE_URL', () => {
    vi.stubEnv('BASE_URL', '/Financial-Modeling-Tool/')
    expect(publicAssetUrl('/guides/comparables-cagr-implied.jpg')).toBe(
      '/Financial-Modeling-Tool/guides/comparables-cagr-implied.jpg',
    )
    expect(publicAssetUrl('guides/x.jpg')).toBe('/Financial-Modeling-Tool/guides/x.jpg')
  })
})

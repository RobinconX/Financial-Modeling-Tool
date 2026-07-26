/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fetchQuote } from './server/quote'
import { fetchFxRate } from './server/fx'

function apiPlugin(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    void (async () => {
      const rawUrl = (req as { url?: string }).url ?? '/'
      const url = new URL(rawUrl, 'http://localhost')

      if (url.pathname.startsWith('/api/fx')) {
        const from = url.searchParams.get('from')?.trim() || 'USD'
        const to = url.searchParams.get('to')?.trim() || 'CHF'
        try {
          const quote = await fetchFxRate(from, to)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=300')
          res.end(JSON.stringify(quote))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch FX rate'
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
        return
      }

      if (!url.pathname.startsWith('/api/quote')) {
        next()
        return
      }

      const symbol = url.searchParams.get('symbol')?.trim()
      if (!symbol) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Missing symbol query parameter' }))
        return
      }

      try {
        const quote = await fetchQuote(symbol)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(quote))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch quote'
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: message }))
      }
    })()
  }

  return {
    name: 'api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/lib/**/*.ts', 'server/**/*.ts'],
      exclude: ['tests/**'],
    },
  },
})

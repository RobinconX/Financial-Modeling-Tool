/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fetchQuote, fetchQuotes } from './server/quote'
import { fetchFxRate } from './server/fx'
import { fetchOptionChain } from './server/options'
import { fetchPriceHistory } from './server/history'

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

      if (url.pathname.startsWith('/api/options')) {
        const symbol = url.searchParams.get('symbol')?.trim() || ''
        const expiration = url.searchParams.get('date')?.trim() || null
        try {
          const chain = await fetchOptionChain(symbol, expiration)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=60')
          res.end(JSON.stringify(chain))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch option chain'
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
        return
      }

      if (url.pathname.startsWith('/api/history')) {
        const symbol = url.searchParams.get('symbol')?.trim() || ''
        try {
          const history = await fetchPriceHistory(symbol)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(history))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch history'
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
        return
      }

      if (!url.pathname.startsWith('/api/quote')) {
        next()
        return
      }

      const symbolsParam = url.searchParams.get('symbols')?.trim()
      const symbol = url.searchParams.get('symbol')?.trim()

      try {
        if (symbolsParam) {
          const list = symbolsParam
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          const pricesOnly =
            url.searchParams.get('pricesOnly') === '1' ||
            url.searchParams.get('pricesOnly') === 'true'
          const quotes = await fetchQuotes(list, { pricesOnly })
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ quotes }))
          return
        }

        if (!symbol) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Missing symbol or symbols query parameter',
            }),
          )
          return
        }

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

// GitHub project Pages: set VITE_BASE=/repo-name/ in the workflow or .env
const base =
  (globalThis as unknown as { process?: { env?: { VITE_BASE?: string } } }).process?.env
    ?.VITE_BASE?.trim() || '/'

export default defineConfig({
  base,
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

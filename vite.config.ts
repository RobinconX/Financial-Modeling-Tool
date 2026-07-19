import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fetchQuote } from './server/quote'

function quoteApiPlugin(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    void (async () => {
      const rawUrl = (req as { url?: string }).url ?? '/'
      const url = new URL(rawUrl, 'http://localhost')
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
    name: 'quote-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), quoteApiPlugin()],
})

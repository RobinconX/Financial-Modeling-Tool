/**
 * Cloudflare Worker: quote + FX proxy for the static GitHub Pages app.
 *
 * Deploy (from this directory):
 *   npx wrangler deploy
 *
 * Then set GitHub Actions variable VITE_API_BASE to the worker URL
 * (no trailing slash), e.g. https://fmt-market-api.<you>.workers.dev
 */
import { fetchQuote } from '../../../server/quote'
import { fetchFxRate } from '../../../server/fx'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  })
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    if (path === '/' || path === '') {
      return json({
        ok: true,
        service: 'fmt-market-api',
        routes: ['/api/quote?symbol=AAPL', '/api/fx?from=USD&to=CHF'],
      })
    }

    if (path.endsWith('/api/fx') || path === '/api/fx') {
      const from = url.searchParams.get('from')?.trim() || 'USD'
      const to = url.searchParams.get('to')?.trim() || 'CHF'
      try {
        const quote = await fetchFxRate(from, to)
        return json(quote, 200, { 'Cache-Control': 'public, max-age=300' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch FX rate'
        return json({ error: message }, 502)
      }
    }

    if (path.endsWith('/api/quote') || path === '/api/quote') {
      const symbol = url.searchParams.get('symbol')?.trim()
      if (!symbol) {
        return json({ error: 'Missing symbol query parameter' }, 400)
      }
      try {
        const quote = await fetchQuote(symbol)
        return json(quote, 200, { 'Cache-Control': 'no-store' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch quote'
        return json({ error: message }, 404)
      }
    }

    return json({ error: 'Not found' }, 404)
  },
}

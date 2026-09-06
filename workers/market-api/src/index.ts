/**
 * Cloudflare Worker: quote + FX proxy for the static GitHub Pages app.
 *
 * Deploy (from this directory):
 *   npx wrangler deploy
 *
 * Then set GitHub Actions variable VITE_API_BASE to the worker URL
 * (no trailing slash), e.g. https://fmt-market-api.<you>.workers.dev
 */
import { fetchQuote, fetchQuotes } from '../../../server/quote'
import { fetchFxRate } from '../../../server/fx'
import { fetchOptionChain } from '../../../server/options'
import { fetchPriceHistory } from '../../../server/history'

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
        routes: [
          '/api/quote?symbol=AAPL',
          '/api/quote?symbols=AAPL,MSFT,GOOG',
          '/api/history?symbol=AAPL',
          '/api/fx?from=USD&to=CHF',
          '/api/options?symbol=AAPL',
        ],
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

    if (path.endsWith('/api/options') || path === '/api/options') {
      const symbol = url.searchParams.get('symbol')?.trim() || ''
      const expiration = url.searchParams.get('date')?.trim() || null
      try {
        const chain = await fetchOptionChain(symbol, expiration)
        return json(chain, 200, { 'Cache-Control': 'public, max-age=60' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch option chain'
        return json({ error: message }, 502)
      }
    }

    if (path.endsWith('/api/history') || path === '/api/history') {
      const symbol = url.searchParams.get('symbol')?.trim() || ''
      try {
        const history = await fetchPriceHistory(symbol)
        return json(history, 200, { 'Cache-Control': 'no-store' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch history'
        return json({ error: message }, 404)
      }
    }

    if (path.endsWith('/api/quote') || path === '/api/quote') {
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
          return json({ quotes }, 200, { 'Cache-Control': 'no-store' })
        }
        if (!symbol) {
          return json({ error: 'Missing symbol or symbols query parameter' }, 400)
        }
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

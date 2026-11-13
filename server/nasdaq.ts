/** Browser-like headers for Nasdaq public JSON API (Worker + Node). */
export const NASDAQ_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nasdaq.com/',
  'Accept-Language': 'en-US,en;q=0.9',
}

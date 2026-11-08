/** Lightweight browser / OS labels — not a fingerprint. */
export function summarizeUserAgent(ua: string): { browser: string; os: string } {
  const u = ua.trim() || 'unknown'
  let browser = 'Unknown browser'
  if (/Edg\//i.test(u)) browser = 'Edge'
  else if (/Chrome\//i.test(u) && !/Edg\//i.test(u)) browser = 'Chrome'
  else if (/Firefox\//i.test(u)) browser = 'Firefox'
  else if (/Safari\//i.test(u) && !/Chrome\//i.test(u)) browser = 'Safari'

  let os = 'Unknown OS'
  if (/Windows NT/i.test(u)) os = 'Windows'
  else if (/Mac OS X/i.test(u)) os = 'macOS'
  else if (/iPhone|iPad|iPod/i.test(u)) os = 'iOS'
  else if (/Android/i.test(u)) os = 'Android'
  else if (/Linux/i.test(u)) os = 'Linux'

  return { browser, os }
}

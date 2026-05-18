// Helper function to ensure a URL has the HTTPS protocol
export function ensureHttpsProtocol(url?: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

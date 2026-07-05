// JWT segments are base64url-encoded (`-`/`_` instead of `+`/`/`, no padding).
// `atob` only understands standard base64, so normalize before decoding — otherwise
// valid tokens whose payload contains `-`/`_` throw and get misread as expired.
function decodeBase64UrlSegment(segment: string): string {
  const base64 = segment.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return atob(padded)
}

// Helper to decode JWT and check expiration
export function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(decodeBase64UrlSegment(token.split('.')[1]))
    if (!payload.exp) return false
    const now = Math.floor(Date.now() / 1000)
    return payload.exp < now
  } catch {
    return true // treat malformed tokens as expired
  }
}

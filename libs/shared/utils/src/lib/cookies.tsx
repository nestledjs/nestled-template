/**
 * Get the session cookie name from environment variable.
 * Works in both server (process.env) and client (import.meta.env) contexts.
 */
export function getSessionCookieName(): string {
  // Server-side (Node.js)
  if (process?.env?.VITE_COOKIE_NAME) {
    return process.env.VITE_COOKIE_NAME
  }
  // Client-side (Vite)
  if (import.meta?.env?.VITE_COOKIE_NAME) {
    return import.meta.env.VITE_COOKIE_NAME
  }
  // Default fallback
  return '__session'
}

function parseCookies(header: string | null): Record<string, string[]> {
  const result: Record<string, string[]> = {}

  if (!header) return result

  header.split(';').forEach(cookie => {
    const [key, ...valParts] = cookie.trim().split('=')
    if (!key || valParts.length === 0) return
    const value = decodeURIComponent(valParts.join('='))
    if (!result[key]) result[key] = []
    result[key].push(value)
  })

  return result
}

// Returns cookie as string or undefined
export function getCookie<T extends string = string>(
  headers: Headers | Record<string, string>,
  name: string,
): T | undefined {
  let normalizedHeaders: Headers
  if (headers instanceof Headers) {
    normalizedHeaders = headers
  } else {
    normalizedHeaders = new Headers(headers)
  }
  const values = parseCookies(normalizedHeaders.get('cookie'))[name]
  if (!values || values.length === 0) return undefined
  if (values.length === 1) return values[0] as T
  // Prefer the newest JWT by iat/exp if multiple values exist
  let best: { token: string; iat: number } | null = null
  for (const token of values) {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) continue
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as { iat?: number; exp?: number }
      const iat = typeof payload.iat === 'number' ? payload.iat : typeof payload.exp === 'number' ? payload.exp : 0
      if (!best || iat > best.iat) {
        best = { token, iat }
      }
    } catch {
      // ignore
    }
  }
  return (best?.token ?? values[values.length - 1]) as T
}

// Returns cookie parsed as object or null
export function getJsonCookie<T extends object>(headers: Headers | Record<string, string>, name: string): T | null {
  let normalizedHeaders: Headers
  if (headers instanceof Headers) {
    normalizedHeaders = headers
  } else {
    normalizedHeaders = new Headers(headers)
  }
  const values = parseCookies(normalizedHeaders.get('cookie'))[name]
  if (!values || values.length === 0) return null
  const raw = values[values.length - 1]

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

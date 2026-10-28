import { decodeBase64UrlSegment } from './base64url'

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
  const viteEnvName = import.meta?.env?.VITE_COOKIE_NAME as string | undefined
  if (viteEnvName) {
    return viteEnvName
  }
  // Default fallback
  return '__session'
}

/**
 * Decode one cookie value, or keep it raw when it is not valid percent-encoding.
 *
 * `decodeURIComponent` throws a URIError on a malformed `%` sequence. The cookie header carries
 * every cookie visible to the request, including ones set by other apps on a parent domain, so a
 * single badly encoded cookie with an unrelated name made the root loader throw and every route
 * return 500. The API's JWT strategy already falls back to the raw value; the client does the same.
 */
export function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseCookies(header: string | null): Record<string, string[]> {
  const result: Record<string, string[]> = {}

  if (!header) return result

  header.split(';').forEach(cookie => {
    const [key, ...valParts] = cookie.trim().split('=')
    if (!key || valParts.length === 0) return
    const value = decodeCookieValue(valParts.join('='))
    if (!result[key]) result[key] = []
    result[key].push(value)
  })

  return result
}

/**
 * Pick the newest JWT from several same-name session cookies.
 *
 * Duplicates happen when a re-login writes a cookie at a different path or domain than the old
 * one. Neither the cookie header nor `document.cookie` orders them by age, so the token's own
 * `iat` (or `exp`) decides. Ties go to the later value: equal-path cookies arrive oldest first,
 * and rapid re-logins can share a whole-second timestamp.
 */
export function pickNewestJwt(values: string[]): string {
  let best: { token: string; iat: number } | null = null
  for (const token of values) {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) continue
      const payload = JSON.parse(decodeBase64UrlSegment(parts[1])) as {
        iat?: number
        exp?: number
      }
      let iat: number
      if (typeof payload.iat === 'number') {
        iat = payload.iat
      } else if (typeof payload.exp === 'number') {
        iat = payload.exp
      } else {
        iat = 0
      }
      if (!best || iat >= best.iat) {
        best = { token, iat }
      }
    } catch {
      // ignore malformed
    }
  }

  // The catch above cannot tell a malformed token from a broken environment: when the decoder
  // threw on every token (as `Buffer` did in the browser), `best` stayed null and the positional
  // fallback below became the normal path. With several values that fallback is a guess, so say
  // so out loud.
  if (!best && values.length > 1) {
    console.warn(
      `[cookies] Could not decode any of ${values.length} session cookies; ` +
        'falling back to the last one, which may not be the newest.',
    )
  }
  return best?.token ?? values[values.length - 1]
}

function normalizeHeaders(headers: Headers | Record<string, string>): Headers {
  return headers instanceof Headers ? headers : new Headers(headers)
}

// Returns cookie as string or undefined
export function getCookie<T extends string = string>(
  headers: Headers | Record<string, string>,
  name: string,
): T | undefined {
  const values = parseCookies(normalizeHeaders(headers).get('cookie'))[name]
  if (!values || values.length === 0) return undefined
  if (values.length === 1) return values[0] as T
  return pickNewestJwt(values) as T
}

// Returns cookie parsed as object or null
export function getJsonCookie<T extends object>(
  headers: Headers | Record<string, string>,
  name: string,
): T | null {
  const values = parseCookies(normalizeHeaders(headers).get('cookie'))[name]
  if (!values || values.length === 0) return null
  const raw = values[values.length - 1]

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

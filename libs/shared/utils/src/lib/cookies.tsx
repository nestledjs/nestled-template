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
 * How far into the future a token's `iat` may be before the picker ignores it, in seconds. Covers
 * ordinary clock skew between the API that signed the token and the machine reading it.
 */
export const JWT_IAT_CLOCK_SKEW_SECONDS = 5 * 60

type JwtCandidate = { token: string; issuedAt: number; expired: boolean }

function jwtCandidate(token: string, nowSeconds: number): JwtCandidate | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(decodeBase64UrlSegment(parts[1])) as {
      iat?: unknown
      exp?: unknown
    }
    const iat = typeof payload.iat === 'number' ? payload.iat : undefined
    const exp = typeof payload.exp === 'number' ? payload.exp : undefined
    // A token cannot have been issued in the future. One that claims to be is forged or from a
    // badly wrong clock, and must not outrank a real session just by naming a late date.
    if (iat !== undefined && iat > nowSeconds + JWT_IAT_CLOCK_SKEW_SECONDS) return null
    return {
      token,
      issuedAt: iat ?? exp ?? 0,
      expired: exp !== undefined && exp <= nowSeconds,
    }
  } catch {
    return null
  }
}

/**
 * Pick the newest JWT from several same-name session cookies.
 *
 * Duplicates happen when a re-login writes a cookie at a different path or domain than the old
 * one. Neither the cookie header nor `document.cookie` orders them by age, so the token's own
 * `iat` (or `exp`) decides. Ties go to the later value: equal-path cookies arrive oldest first,
 * and rapid re-logins can share a whole-second timestamp.
 *
 * The client cannot verify signatures (the secret stays on the API), so the payload is untrusted.
 * Two rules keep an untrusted payload from winning on its say-so: a token whose `iat` is further
 * in the future than JWT_IAT_CLOCK_SKEW_SECONDS is ignored, and an expired token loses to any
 * unexpired one whatever their `iat`. The API, which can verify, makes the final choice the same
 * way and never lets an unverifiable token shadow a valid one.
 */
export function pickNewestJwt(
  values: string[],
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  let best: JwtCandidate | null = null
  for (const token of values) {
    const candidate = jwtCandidate(token, nowSeconds)
    if (!candidate) continue
    if (
      !best ||
      (best.expired && !candidate.expired) ||
      (best.expired === candidate.expired && candidate.issuedAt >= best.issuedAt)
    ) {
      best = candidate
    }
  }

  // The parse cannot tell a malformed token from a broken environment: when the decoder threw on
  // every token (as `Buffer` did in the browser), `best` stayed null and the positional fallback
  // below became the normal path. With several values that fallback is a guess, so say so out loud.
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

/**
 * Server-side selection of the session cookie when a request carries more than one.
 *
 * A browser can hold two cookies with the same name: a host-only one and a parent-domain one, or
 * two at different paths, typically after a re-login or a change of cookie domain. Both arrive in
 * the Cookie header, in an order that says nothing about age. `cookie-parser` (`req.cookies`) and a
 * naive split keep only the first, which can be the stale or revoked session.
 *
 * Ordering by the payload's `iat` alone is not enough either: the payload is unverified, so a
 * cookie planted from a sibling subdomain with a far-future `iat` would always win. The server has
 * the secret, so it orders newest first and then takes the first token whose signature verifies.
 * An unverifiable token never shadows a valid one.
 *
 * Every server path that reads the session cookie goes through here: JwtStrategy, the WebSocket
 * connection check, the MCP OAuth /authorize session read and the auth resolver.
 */

/** A cookie-bearing request: Express's, or the subset of it a GraphQL or WebSocket context has. */
export type SessionCookieRequest = {
  headers?: Record<string, string | string[] | undefined> | null
  cookies?: Record<string, unknown> | null
}

/** Verifies a token's signature (and whatever else the caller requires), or returns null. */
export type SessionTokenVerifier<TClaims> = (token: string) => TClaims | null

/** Percent-decode a cookie value, keeping it raw when it is not valid percent-encoding. */
export function decodeSessionCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Every value of the named cookie in one or more Cookie header values, in header order and
 * percent-decoded. Values may contain `=`; only the first `=` in a pair separates name and value.
 */
export function cookieValuesFromHeader(
  cookieHeader: string | readonly string[] | null | undefined,
  name: string,
): string[] {
  if (!cookieHeader) return []
  const headers = typeof cookieHeader === 'string' ? [cookieHeader] : cookieHeader
  const values: string[] = []
  for (const header of headers) {
    for (const pair of header.split(';')) {
      const separator = pair.indexOf('=')
      if (separator < 0 || pair.slice(0, separator).trim() !== name) continue
      const value = pair.slice(separator + 1).trim()
      if (value) values.push(decodeSessionCookieValue(value))
    }
  }
  return values
}

/**
 * Every value of the named cookie on a request. The raw Cookie header is read first because it
 * keeps duplicates; `req.cookies` (cookie-parser keeps only the first) is the fallback when the
 * request has no header, as in a hand-built context.
 */
export function requestCookieValues(
  req: SessionCookieRequest | null | undefined,
  name: string,
): string[] {
  const values = cookieValuesFromHeader(req?.headers?.['cookie'], name)
  if (values.length > 0) return values
  const parsed = req?.cookies?.[name]
  return typeof parsed === 'string' && parsed ? [parsed] : []
}

/**
 * Every value of the named cookie in Node's flat `rawHeaders` list ([name, value, name, value…]),
 * across all Cookie headers. A WebSocket upgrade request exposes only this.
 */
export function rawHeaderCookieValues(rawHeaders: readonly string[], name: string): string[] {
  const cookieHeaders: string[] = []
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'cookie') cookieHeaders.push(rawHeaders[i + 1])
  }
  return cookieValuesFromHeader(cookieHeaders, name)
}

/** The unverified `iat` (or `exp`) of a JWT, for ordering only; null when it is not a JWT. */
function unverifiedTimestamp(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      iat?: unknown
      exp?: unknown
    }
    if (typeof payload.iat === 'number') return payload.iat
    if (typeof payload.exp === 'number') return payload.exp
    return 0
  } catch {
    return null
  }
}

/**
 * Candidates newest first by their unverified timestamp. Equal timestamps put the later value
 * first (equal-path cookies arrive oldest first, and rapid re-logins can share a second); values
 * that are not JWTs go last, later ones first. The order is a preference only: nothing here is
 * trusted until it verifies.
 */
export function orderSessionTokensNewestFirst(values: readonly string[]): string[] {
  return values
    .map((token, index) => ({ token, index, timestamp: unverifiedTimestamp(token) }))
    .sort((a, b) => {
      if (a.timestamp === null || b.timestamp === null) {
        if (a.timestamp !== b.timestamp) return a.timestamp === null ? 1 : -1
        return b.index - a.index
      }
      return b.timestamp - a.timestamp || b.index - a.index
    })
    .map(candidate => candidate.token)
}

/**
 * The newest candidate that verifies, with its claims, or null when none does. A single value is
 * still verified: callers that need the claims must never act on an unverified token.
 */
export function pickVerifiedSessionToken<TClaims>(
  values: readonly string[],
  verify: SessionTokenVerifier<TClaims>,
): { token: string; claims: TClaims } | null {
  for (const token of orderSessionTokensNewestFirst(values)) {
    const claims = verify(token)
    if (claims) return { token, claims }
  }
  return null
}

/**
 * The session token a request should be treated as carrying: the newest one that verifies. When
 * none verifies, the newest by unverified timestamp is returned so the caller's own verification
 * fails exactly as it would have with a single cookie. A lone value is returned without verifying
 * it here, since the caller verifies it anyway.
 */
export function selectSessionToken(
  values: readonly string[],
  verify: SessionTokenVerifier<unknown>,
): string | undefined {
  if (values.length <= 1) return values[0]
  return pickVerifiedSessionToken(values, verify)?.token ?? orderSessionTokensNewestFirst(values)[0]
}

/** Where a sign-in goes when it was given no safe place to return to. */
export const DEFAULT_POST_LOGIN = '/members/dashboard'

/**
 * Routes that sign the user out just by being loaded. An app with one of its own (a custom
 * `SESSION_REJECTED_PATH`, say) adds it here, in lower case and without a trailing slash.
 */
const SIGN_OUT_PATHS: ReadonlySet<string> = new Set(['/logout', '/force-logout'])

// Only resolves a path against: never fetched, and no real origin can equal it.
const LOCAL_ORIGIN = 'https://return-url.invalid'

// A percent-encoded ASCII character. One left after a path is decoded once means it was encoded
// twice or more: some proxy, router or server may decode it again, into anything.
const ENCODED_ASCII = /%[0-7][0-9a-f]/i

/**
 * The API's MCP authorization endpoint. A signed-out caller of it is sent to the sign-in page with
 * the whole authorization URL to come back to (`redirect`). Where the API has a host of its own, that
 * URL is on the API host, and is the one off-origin target a sign-in may return to.
 */
export const MCP_AUTHORIZE_PATH = '/api/mcp/authorize'

/** The API origin from configuration (`VITE_API_URL`), never from the request; null if invalid. */
function configuredApiOrigin(): string | null {
  try {
    return new URL((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000')
      .origin
  } catch {
    return null
  }
}

/**
 * `raw` as an absolute URL of exactly the API's MCP authorization endpoint (same scheme, host and
 * port as `apiOrigin`, no credentials, that one path), without its fragment; otherwise null.
 */
function apiAuthorizationUrl(raw: string, apiOrigin: string | null): string | null {
  if (!apiOrigin || isSafeLocalPath(raw)) return null
  const url = new URL(raw)
  if (url.origin !== apiOrigin || url.username || url.password) return null
  if (url.pathname !== MCP_AUTHORIZE_PATH) return null
  return `${url.origin}${url.pathname}${url.search}`
}

// An origin-local target: a single-slash absolute path with no backslash tricks.
// Protocol-relative (`//host`) and backslash forms (`/\host`, `\host`) are rejected
// because browsers/routers normalize them into off-site navigations.
function isSafeLocalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
}

/** Decodes every percent-encoded ASCII character, leaving malformed and non-ASCII sequences. */
function decodeAsciiOnce(text: string): string {
  return text.replaceAll(/%([0-7][0-9a-f])/gi, (_match, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  )
}

/**
 * The route a path reaches: dot segments resolved, slashes collapsed, case and tail dropped. A `?`
 * or `#` in it is part of the path (it was percent-encoded), so a dot segment after it still counts.
 */
function routeOf(path: string): string {
  const pathname = path
    .replaceAll('?', '%3F')
    .replaceAll('#', '%23')
    .replaceAll('\\', '/')
    .replaceAll(/\/{2,}/g, '/')
  const resolved = new URL(pathname, LOCAL_ORIGIN).pathname.toLowerCase()
  const plain = resolved.replaceAll(/;[^/]*/g, '').replaceAll(/\/{2,}/g, '/')
  // The router also answers `<path>.data` (its own data request) for a route with a loader.
  return plain.replace(/(?:\/_)?\.data$/, '').replace(/\/$/, '')
}

/**
 * Whether a local path reaches, or may reach, a sign-out route, however it is spelled. Its path is
 * checked as it is and decoded once, with dot segments resolved, duplicate and trailing slashes,
 * path parameters and letter case dropped, since the browser, a proxy or the router may undo any of
 * them; an encoded `?`, `#`, slash, backslash or `.` counts as what it decodes to. A path that
 * still holds a percent-encoded ASCII character after that one decode (it was encoded twice or more) is
 * refused outright: whatever decodes it next decides where it goes, not this check.
 */
export function isSignOutPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0]
  const decoded = decodeAsciiOnce(pathname)
  if (ENCODED_ASCII.test(decoded)) return true
  // A decoded `?` or `#` may end the path, or be part of it: whichever reading reaches a sign-out
  // route decides.
  const readings = [pathname, decoded, decoded.split(/[?#]/, 1)[0]]
  return readings.some(reading => SIGN_OUT_PATHS.has(routeOf(reading)))
}

/** The path, query and hash `raw` resolves to on this origin, or null if it could leave it. */
function localPathOf(raw: string): string | null {
  const relative = isSafeLocalPath(raw)
  const url = relative ? new URL(raw, LOCAL_ORIGIN) : new URL(raw)
  // The URL parser drops tabs and newlines, so a path can still turn out protocol-relative.
  if (relative && url.origin !== LOCAL_ORIGIN) return null
  const path = `${url.pathname}${url.search}${url.hash}`
  return isSafeLocalPath(path) ? path : null
}

/**
 * Where to go after signing in. Producers pass either a same-origin relative path (`return_url`,
 * most routes) or an absolute URL (`redirect`, e.g. mcp-connect passes request.url). The result can
 * be given to `location.assign`. It is a path on our origin (an absolute URL is reduced to its path,
 * query and hash, and re-validated, so `https://host//evil.com` is rejected), with one exception:
 * the API's MCP authorization URL on the configured API origin (`apiOrigin`, from `VITE_API_URL`),
 * which is kept whole, as a path on the web host would not find it. It never is a sign-out route (a
 * crafted link would sign the user out right after signing in). Anything else falls back to the
 * dashboard.
 */
export function safeReturnUrl(
  raw: string | null,
  apiOrigin: string | null = configuredApiOrigin(),
): string {
  if (!raw) return DEFAULT_POST_LOGIN
  try {
    const authorization = apiAuthorizationUrl(raw, apiOrigin)
    if (authorization) return authorization
    const path = localPathOf(raw)
    return path && !isSignOutPath(path) ? path : DEFAULT_POST_LOGIN
  } catch {
    return DEFAULT_POST_LOGIN
  }
}

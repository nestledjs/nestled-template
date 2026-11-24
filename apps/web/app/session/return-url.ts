/** Where a sign-in goes when it was given no safe place to return to. */
export const DEFAULT_POST_LOGIN = '/members/dashboard'

/**
 * Routes that sign the user out just by being loaded. An app with one of its own (a custom
 * `SESSION_REJECTED_PATH`, say) adds it here, in lower case and without a trailing slash.
 */
const SIGN_OUT_PATHS: ReadonlySet<string> = new Set(['/logout', '/force-logout'])

// Only resolves a path against: never fetched, and no real origin can equal it.
const LOCAL_ORIGIN = 'https://return-url.invalid'

// A path still changing after this many rounds of percent-decoding is not a real return path.
const MAX_DECODE_ROUNDS = 5

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

/** The route a path reaches: dot segments resolved, slashes collapsed, case and tail dropped. */
function routeOf(path: string): string {
  const pathname = path
    .split(/[?#]/, 1)[0]
    .replaceAll('\\', '/')
    .replaceAll(/\/{2,}/g, '/')
  const resolved = new URL(pathname, LOCAL_ORIGIN).pathname.toLowerCase()
  const plain = resolved.replaceAll(/;[^/]*/g, '').replaceAll(/\/{2,}/g, '/')
  // The router also answers `<path>.data` (its own data request) for a route with a loader.
  return plain.replace(/(?:\/_)?\.data$/, '').replace(/\/$/, '')
}

/**
 * Whether a local path reaches a sign-out route, however it is spelled: dot segments, duplicate or
 * trailing slashes, path parameters, letter case and percent-encoding (repeated, and of `.`, `/`, `?` and `#` too)
 * are normalised before the check, since the browser, a proxy or the router may undo any of them.
 */
export function isSignOutPath(path: string): boolean {
  let current = path.split(/[?#]/, 1)[0]
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    if (SIGN_OUT_PATHS.has(routeOf(current))) return true
    const decoded = decodeAsciiOnce(current)
    if (decoded === current) return false
    current = decoded
  }
  return true
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
 * most routes) or an absolute URL (`redirect`, e.g. mcp-connect passes request.url). The result is
 * a path that can be given to `location.assign`: it can never leave our origin (an absolute URL is
 * reduced to its path, query and hash, and re-validated, so `https://host//evil.com` is rejected),
 * and it never is a sign-out route (a crafted link would sign the user out right after signing in).
 * Anything else falls back to the dashboard.
 */
export function safeReturnUrl(raw: string | null): string {
  if (!raw) return DEFAULT_POST_LOGIN
  try {
    const path = localPathOf(raw)
    return path && !isSignOutPath(path) ? path : DEFAULT_POST_LOGIN
  } catch {
    return DEFAULT_POST_LOGIN
  }
}

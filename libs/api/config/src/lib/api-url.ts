// API_URL is the origin ONLY (scheme + host + optional port), WITHOUT the `/api` global prefix.
// The prefix is appended by the URL-building code (OAuth redirect_uri, MCP base URL, upload public
// URLs). A misconfigured env — a trailing slash or a leftover `/api` suffix — otherwise produces
// broken URLs (`/api/api/auth/...`, `//api/mcp`). Normalize centrally here so every consumer reads
// a clean origin and per-consumer defensive strips are unnecessary.

const API_PREFIX_SUFFIX = '/api'

/** Build the local-dev default origin, defaulting PORT to 3000 (never `:undefined`). */
export function defaultApiOrigin(host?: string, port?: string | number): string {
  // Trim the port too — a stray `PORT=" 3000 "` must not yield `http://localhost: 3000 `.
  const trimmedPort = `${port ?? ''}`.trim()
  const resolvedPort = trimmedPort === '' ? 3000 : trimmedPort
  return `http://${host?.trim() || 'localhost'}:${resolvedPort}`
}

function stripTrailingSlashes(value: string): string {
  let result = value
  while (result.endsWith('/')) {
    result = result.slice(0, -1)
  }
  return result
}

/**
 * Normalize a raw API_URL into an origin-only value: trims whitespace and falls back to the
 * local-dev origin when empty. When the value parses as an absolute http(s) URL, returns its
 * `origin` — which collapses ANY path/query/hash/credentials (including a `/api` suffix) to
 * scheme+host+port. When it does not parse (e.g. a scheme-less `localhost:3000`), falls back to a
 * best-effort string strip of trailing slashes and a trailing `/api` segment (no regex, so no
 * backtracking risk on malformed input); such a value fails `isHttpOrigin` and so trips fail-fast
 * validation at startup.
 */
export function normalizeApiOrigin(
  rawValue: string | undefined,
  fallback: { host?: string; port?: string | number } = {},
): string {
  const trimmed = (rawValue ?? '').trim()
  const value = trimmed.length > 0 ? trimmed : defaultApiOrigin(fallback.host, fallback.port)

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin
    }
  } catch {
    // Not a parseable absolute URL — fall through to the string-based best-effort strip.
  }

  let origin = stripTrailingSlashes(value)
  if (origin.toLowerCase().endsWith(API_PREFIX_SUFFIX)) {
    origin = origin.slice(0, -API_PREFIX_SUFFIX.length)
  }
  return stripTrailingSlashes(origin)
}

/**
 * True only when the value is an origin-ONLY http(s) URL — scheme + host + optional port, with no
 * path, query, fragment, or credentials. Used to fail fast at config validation so a misconfigured
 * API_URL that carries a path (e.g. `https://x.com/graphql`) is rejected rather than silently
 * reintroducing broken URL concatenation.
 */
export function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
    const isOriginOnly =
      (url.pathname === '' || url.pathname === '/') &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === ''
    return isHttp && isOriginOnly
  } catch {
    return false
  }
}

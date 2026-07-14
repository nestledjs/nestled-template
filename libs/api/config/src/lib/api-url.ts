// API_URL is the origin ONLY (scheme + host + optional port), WITHOUT the `/api` global prefix.
// The prefix is appended by the URL-building code (OAuth redirect_uri, MCP base URL, upload public
// URLs). A misconfigured env — a trailing slash or a leftover `/api` suffix — otherwise produces
// broken URLs (`/api/api/auth/...`, `//api/mcp`). Normalize centrally here so every consumer reads
// a clean origin and per-consumer defensive strips are unnecessary.

const API_PREFIX_SUFFIX = '/api'

/**
 * An IPv6 literal must be bracketed in a URL authority (RFC 3986) — `http://[::1]:3000`, not
 * `http://::1:3000`, which is unparseable. HOST validation accepts `Joi.string().ip()`, which
 * includes IPv6, so this is reachable: an unbracketed value fails isHttpOrigin() and takes down
 * startup. A hostname or IPv4 address never contains a colon, so that alone identifies IPv6.
 */
function formatHost(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`
  return host
}

/**
 * Build a local-dev origin, defaulting the port when it is unset/blank (never `:undefined`).
 *
 * Generic over the port fallback so every `*_URL` default can share one implementation. Each
 * `*_URL` default must pass its own fallback because these values are computed from `process.env`
 * when this module is imported — the string handed to Joi's `.default()` is already concrete, so a
 * sibling key's Joi default (e.g. `WEB_PORT: Joi.number().default(4200)`) cannot influence it.
 */
export function defaultOrigin(host?: string, port?: string | number, fallbackPort = 3000): string {
  // Trim the port too — a stray `PORT=" 3000 "` must not yield `http://localhost: 3000 `.
  const trimmedPort = `${port ?? ''}`.trim()
  const resolvedPort = trimmedPort === '' ? fallbackPort : trimmedPort
  return `http://${formatHost(host?.trim() || 'localhost')}:${resolvedPort}`
}

/** Build the local-dev default API origin, defaulting PORT to 3000 (never `:undefined`). */
export function defaultApiOrigin(host?: string, port?: string | number): string {
  return defaultOrigin(host, port, 3000)
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
 * path, query, fragment, or credentials.
 *
 * NOTE: validation.ts NORMALIZES before calling this, so an API_URL carrying a path (e.g.
 * `https://x.com/graphql`) is self-healed by normalizeApiOrigin to `https://x.com` and therefore
 * ACCEPTED — not rejected. In that flow this guard only fails fast on values normalizeApiOrigin
 * could not reduce to an origin at all: a non-http(s) protocol (`ftp://…`), or an unparseable /
 * scheme-less value (`localhost:3000`). The strict origin-only contract still holds for direct
 * callers, which is what the spec pins.
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

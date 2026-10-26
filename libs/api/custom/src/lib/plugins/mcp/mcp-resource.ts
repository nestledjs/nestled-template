/**
 * RFC 8707 resource indicators for the MCP endpoint.
 *
 * Tokens issued by the MCP OAuth token endpoint are bound to the MCP endpoint's canonical URI (its
 * `resource`, as the protected resource metadata names it). A bound token is accepted only at
 * `/api/mcp`, and only when it names the URI the request arrived at; everywhere else in the API
 * it is refused. API tokens a user creates in settings, and MCP tokens issued before binding
 * existed, have no resource and keep working everywhere they did.
 */

interface RequestLike {
  protocol: string
  get: (name: string) => string | undefined
}

/** The path of the MCP endpoint, below the API origin. */
export const MCP_RESOURCE_PATH = '/api/mcp'

/**
 * The canonical form of a resource URI, for comparison: lowercase scheme and host (URL does that),
 * no fragment, no trailing slash. Null when `value` is not an absolute http(s) URI or has a
 * fragment, which RFC 8707 forbids.
 */
export function canonicalResource(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.hash || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null
  let path = url.pathname
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return `${url.protocol}//${url.host}${path === '/' ? '' : path}${url.search}`
}

/**
 * The first value of a forwarding header. A proxy chain can send a comma-separated list
 * (`https, http`), whose first entry is the one the client used.
 */
export function firstForwardedValue(value: string | undefined): string | undefined {
  const first = value?.split(',')[0]?.trim()
  return first || undefined
}

/** The origin (`scheme://host`) a request arrived at, as the client addressed it. */
export function requestOrigin(req: RequestLike): string {
  const proto = firstForwardedValue(req.get('x-forwarded-proto')) || req.protocol
  const host = firstForwardedValue(req.get('x-forwarded-host')) || req.get('host')
  return `${proto}://${host}`
}

/** The canonical MCP resource URI for the origin a request arrived at. */
export function requestMcpResource(req: RequestLike): string {
  const base = `${requestOrigin(req)}${MCP_RESOURCE_PATH}`
  return canonicalResource(base) ?? base
}

/** Whether a token bound to `tokenResource` may be used at `expectedResource`. */
export function isSameResource(tokenResource: string, expectedResource: string): boolean {
  const a = canonicalResource(tokenResource)
  return a !== null && a === canonicalResource(expectedResource)
}

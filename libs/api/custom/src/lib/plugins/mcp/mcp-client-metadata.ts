import { lookup } from 'node:dns/promises'
import type { IncomingMessage } from 'node:http'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import type { LookupFunction } from 'node:net'
import { BlockList, isIP } from 'node:net'

/**
 * OAuth Client ID Metadata Documents (CIMD), as the MCP 2026-07-28 authorization spec uses them
 * (draft-ietf-oauth-client-id-metadata-document-00): a client identifies itself with an HTTPS URL,
 * and the document at that URL is its registration. The authorization server fetches the
 * document, checks that its `client_id` is that URL exactly, and allows only the `redirect_uris`
 * it lists.
 */

export interface ClientMetadataDocument {
  clientId: string
  clientName: string
  redirectUris: string[]
}

export class ClientMetadataError extends Error {}

/** Documents are small; a larger body is not one. The draft suggests a 5 KB bound. */
export const CIMD_MAX_BYTES = 5 * 1024
const FETCH_TIMEOUT_MS = 5_000
const DEFAULT_CACHE_MS = 5 * 60 * 1000
const MAX_CACHE_MS = 24 * 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 500

/**
 * Whether `clientId` is shaped like a Client ID Metadata Document URL: `https`, a path other than
 * `/`, and no credentials or fragment. A DCR client id (random hex) never is.
 */
export function isClientMetadataDocumentUrl(clientId: string): boolean {
  if (!clientId.startsWith('https://')) return false
  let url: URL
  try {
    url = new URL(clientId)
  } catch {
    return false
  }
  if (clientId.includes('#')) return false
  if (url.protocol !== 'https:' || url.username || url.password) return false
  if (url.pathname === '/' || url.pathname === '') return false
  // Dot segments are normalised away by URL; a client_id that contained one is not the URL it names.
  return url.href === clientId
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
// Schemes that can never be a redirect target: they run script or read local data in the browser.
const FORBIDDEN_REDIRECT_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
])

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isLoopbackHttp(url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}

/**
 * A redirect URI a public client may register: HTTPS, plain HTTP on the loopback interface, or a
 * native app's private-use scheme (RFC 8252 section 7.1, e.g. an editor's own `scheme://`). Plain
 * HTTP to any other host, and script or local-file schemes, are refused.
 */
export function isAcceptableRedirectUri(value: string): boolean {
  // Any `#`, a bare trailing one included (URL reports an empty hash for it): a redirect URI may
  // not carry a fragment (RFC 6749 section 3.1.2).
  if (value.includes('#')) return false
  const url = parseUrl(value)
  if (!url) return false
  if (FORBIDDEN_REDIRECT_SCHEMES.has(url.protocol)) return false
  if (url.protocol === 'http:') return isLoopbackHttp(url)
  return true
}

/**
 * Whether `requested` is one of `registered`: an exact string match, except that a loopback HTTP
 * redirect may use any port (RFC 8252 section 7.3: native apps bind an ephemeral port per run).
 */
export function isRegisteredRedirectUri(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true
  const asked = parseUrl(requested)
  if (!asked || !isLoopbackHttp(asked)) return false
  return registered.some(candidate => {
    const url = parseUrl(candidate)
    return (
      !!url &&
      isLoopbackHttp(url) &&
      url.hostname === asked.hostname &&
      url.pathname === asked.pathname &&
      url.search === asked.search
    )
  })
}

// Addresses a client metadata fetch must never reach (SSRF): loopback, private, link-local,
// carrier-grade NAT, unspecified, multicast and reserved ranges, and their IPv6 counterparts,
// including the IPv6 forms that embed an IPv4 address (IPv4-compatible ::/96, NAT64 and 6to4),
// since those can reach an internal IPv4 host.
// CIDR notation, split at load time. Each entry carries NOSONAR: typescript:S1313 (hardcoded
// IP address) flags them, but they are the blocklist itself, never an address we connect to.
const BLOCKED_IPV4_RANGES = [
  '0.0.0.0/8', // NOSONAR
  '10.0.0.0/8', // NOSONAR
  '100.64.0.0/10', // NOSONAR
  '127.0.0.0/8', // NOSONAR
  '169.254.0.0/16', // NOSONAR
  '172.16.0.0/12', // NOSONAR
  '192.0.0.0/24', // NOSONAR
  '192.168.0.0/16', // NOSONAR
  '198.18.0.0/15', // NOSONAR
  '224.0.0.0/4', // NOSONAR
  '240.0.0.0/4', // NOSONAR
]
const BLOCKED_IPV6_RANGES = [
  '::/96', // NOSONAR - unspecified, loopback and IPv4-compatible (deprecated)
  '64:ff9b::/96', // NOSONAR - NAT64, well-known prefix
  '64:ff9b:1::/48', // NOSONAR - NAT64, local-use prefix
  '2002::/16', // NOSONAR - 6to4
  'fc00::/7', // NOSONAR - unique local
  'fe80::/10', // NOSONAR - link-local
  'fec0::/10', // NOSONAR - site-local (deprecated)
  'ff00::/8', // NOSONAR - multicast
]
const BLOCKED_ADDRESSES = new BlockList()
for (const [ranges, family] of [
  [BLOCKED_IPV4_RANGES, 'ipv4'],
  [BLOCKED_IPV6_RANGES, 'ipv6'],
] as const) {
  for (const range of ranges) {
    const [network, prefix] = range.split('/')
    BLOCKED_ADDRESSES.addSubnet(network, Number(prefix), family)
  }
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return false
  if (family === 6 && address.toLowerCase().startsWith('::ffff:')) {
    // An IPv4-mapped IPv6 address is judged as the IPv4 address it carries. (Not a BlockList rule:
    // a `::ffff:0:0/96` rule would also match every plain IPv4 address.)
    return isPublicAddress(address.slice('::ffff:'.length))
  }
  return !BLOCKED_ADDRESSES.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

export type HostResolver = (hostname: string) => Promise<string[]>

/** How long a host name lookup may take before the metadata fetch gives up. */
export const LOOKUP_TIMEOUT_MS = 3_000
/**
 * At most this many lookups at once. `dns.lookup` runs on libuv's threadpool (4 threads by
 * default) and cannot be cancelled, so a slow resolver must not be able to fill it.
 */
export const MAX_CONCURRENT_LOOKUPS = 2

const systemLookup: HostResolver = async hostname => {
  const results = await lookup(hostname, { all: true, verbatim: true })
  return results.map(result => result.address)
}

/**
 * Wraps a resolver with a timeout and a concurrency cap. A lookup that times out is answered with
 * an error at once, but it still counts against the cap until the underlying lookup settles,
 * because its thread is still busy. When the cap is reached a new lookup fails immediately rather
 * than queueing.
 */
export function createBoundedLookup(
  resolve: HostResolver = systemLookup,
  { timeoutMs = LOOKUP_TIMEOUT_MS, maxConcurrent = MAX_CONCURRENT_LOOKUPS } = {},
): HostResolver {
  let inFlight = 0
  return hostname => {
    if (inFlight >= maxConcurrent) {
      return Promise.reject(new ClientMetadataError('Too many client metadata lookups at once'))
    }
    inFlight += 1
    const lookupPromise = resolve(hostname)
    lookupPromise.then(
      () => (inFlight -= 1),
      () => (inFlight -= 1),
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ClientMetadataError('Client metadata document host lookup timed out')),
        timeoutMs,
      )
      timer.unref?.()
    })
    return Promise.race([lookupPromise, timeout]).finally(() => clearTimeout(timer))
  }
}

function cacheLifetimeMs(cacheControl: string | null): number {
  if (!cacheControl) return DEFAULT_CACHE_MS
  const directives = cacheControl.toLowerCase()
  if (directives.includes('no-store') || directives.includes('no-cache')) return 0
  const maxAge = /max-age=(\d+)/.exec(directives)
  if (!maxAge) return DEFAULT_CACHE_MS
  return Math.min(Number(maxAge[1]) * 1000, MAX_CACHE_MS)
}

/** What a metadata document fetch returns. */
export interface FetchedDocument {
  status: number
  cacheControl: string | null
  body: string
}

/** Fetches `url` from `address`, an address already resolved for `url`'s host and checked. */
export type PinnedFetcher = (url: URL, address: string) => Promise<FetchedDocument>

type RequestFunction = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ReturnType<typeof httpsRequest>

function bareHostname(url: URL): string {
  return url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname
}

/** A `lookup` that answers every query with `address`, in the shape the caller asked for. */
export function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address)
  return ((
    _hostname: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) => {
    if (options?.all) callback(null, [{ address, family }])
    else callback(null, address, family)
  }) as LookupFunction
}

function readResponse(response: IncomingMessage): Promise<FetchedDocument> {
  return new Promise((resolve, reject) => {
    const tooLarge = () => new ClientMetadataError('Client metadata document is too large')
    if (Number(response.headers['content-length'] ?? '0') > CIMD_MAX_BYTES) {
      response.destroy()
      reject(tooLarge())
      return
    }
    const chunks: Buffer[] = []
    let total = 0
    response.on('data', (chunk: Buffer) => {
      total += chunk.byteLength
      if (total > CIMD_MAX_BYTES) {
        response.destroy()
        reject(tooLarge())
        return
      }
      chunks.push(chunk)
    })
    response.on('error', reject)
    response.on('end', () => {
      const cacheControl = response.headers['cache-control']
      resolve({
        status: response.statusCode ?? 0,
        cacheControl: typeof cacheControl === 'string' ? cacheControl : null,
        body: Buffer.concat(chunks).toString('utf8'),
      })
    })
  })
}

/**
 * GETs `url` over HTTPS, connecting to `address` and nowhere else. The host name is not looked up
 * again, so DNS cannot answer differently between the address check and the connection (DNS
 * rebinding). The request still carries the URL's host in `Host`, and TLS still sends it as SNI
 * and verifies the certificate against it. Redirects are not followed.
 */
export function createPinnedFetcher(request: RequestFunction = httpsRequest): PinnedFetcher {
  return (url, address) =>
    new Promise((resolve, reject) => {
      const hostname = bareHostname(url)
      const req = request(
        {
          protocol: url.protocol,
          hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: { Accept: 'application/json', Host: url.host },
          // SNI carries a host name, never an IP literal.
          servername: isIP(hostname) ? undefined : hostname,
          lookup: pinnedLookup(address),
          agent: false,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
        response => {
          readResponse(response).then(resolve, reject)
        },
      )
      req.on('error', reject)
      req.end()
    })
}

/** Checks a fetched document against the URL it was fetched from. */
export function parseClientMetadataDocument(clientId: string, raw: string): ClientMetadataDocument {
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    throw new ClientMetadataError('Client metadata document is not valid JSON')
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new ClientMetadataError('Client metadata document is not a JSON object')
  }
  const fields = doc as Record<string, unknown>
  if (fields['client_id'] !== clientId) {
    throw new ClientMetadataError('Client metadata document client_id does not match its URL')
  }
  const clientName = fields['client_name']
  if (typeof clientName !== 'string' || clientName.trim() === '') {
    throw new ClientMetadataError('Client metadata document has no client_name')
  }
  const redirectUris = fields['redirect_uris']
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every(uri => typeof uri === 'string' && isAcceptableRedirectUri(uri))
  ) {
    throw new ClientMetadataError('Client metadata document has no acceptable redirect_uris')
  }
  // Only public clients are supported: the token endpoint authenticates no client secret or key.
  const authMethod = fields['token_endpoint_auth_method']
  if (authMethod !== undefined && authMethod !== 'none') {
    throw new ClientMetadataError(
      `Unsupported token_endpoint_auth_method: ${JSON.stringify(authMethod)}`,
    )
  }
  return { clientId, clientName, redirectUris: redirectUris as string[] }
}

interface CacheEntry {
  document: ClientMetadataDocument
  expiresAt: number
}

/**
 * Fetches and caches Client ID Metadata Documents. The fetch is bounded (HTTPS only, public
 * addresses only and pinned to the address that was checked, no redirects, 5 s, 5 KB) because the
 * URL is chosen by whoever starts an authorization request.
 */
export class ClientMetadataResolver {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly fetchDocument: PinnedFetcher = createPinnedFetcher(),
    private readonly resolveHostname: HostResolver = createBoundedLookup(),
    private readonly now: () => number = Date.now,
  ) {}

  async resolve(clientId: string): Promise<ClientMetadataDocument> {
    if (!isClientMetadataDocumentUrl(clientId)) {
      throw new ClientMetadataError('client_id is not a client metadata document URL')
    }

    const cached = this.cache.get(clientId)
    if (cached && cached.expiresAt > this.now()) return cached.document
    this.cache.delete(clientId)

    const url = new URL(clientId)
    // Resolve once. The connection below goes to the address checked here, not to a second lookup.
    const address = await this.checkedAddress(bareHostname(url))
    const fetched = await this.fetchFrom(url, address)
    const document = parseClientMetadataDocument(clientId, fetched.body)

    const lifetime = cacheLifetimeMs(fetched.cacheControl)
    if (lifetime > 0) {
      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value
        if (oldest !== undefined) this.cache.delete(oldest)
      }
      this.cache.set(clientId, { document, expiresAt: this.now() + lifetime })
    }
    return document
  }

  /** The address to connect to: the host's own, after checking every address it resolves to. */
  private async checkedAddress(hostname: string): Promise<string> {
    let addresses: string[]
    try {
      addresses = isIP(hostname) ? [hostname] : await this.resolveHostname(hostname)
    } catch (err) {
      if (err instanceof ClientMetadataError) throw err
      throw new ClientMetadataError('Client metadata document host could not be resolved')
    }
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      throw new ClientMetadataError('Client metadata document host is not a public address')
    }
    return addresses[0]
  }

  /** The document fetched from `address`, which must answer 2xx. */
  private async fetchFrom(url: URL, address: string): Promise<FetchedDocument> {
    let fetched: FetchedDocument
    try {
      fetched = await this.fetchDocument(url, address)
    } catch (err) {
      if (err instanceof ClientMetadataError) throw err
      throw new ClientMetadataError('Client metadata document could not be fetched')
    }
    if (fetched.status < 200 || fetched.status >= 300) {
      throw new ClientMetadataError(`Client metadata document fetch failed (${fetched.status})`)
    }
    return fetched
  }
}

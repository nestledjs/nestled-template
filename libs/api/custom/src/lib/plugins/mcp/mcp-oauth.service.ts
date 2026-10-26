import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { ApiTokensService } from '../api-tokens/api-tokens.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import {
  AuthTokenClaims,
  claimedAuthGeneration,
  isAuthTokenCurrent,
} from '../auth/auth-token-claims'
import {
  ClientMetadataError,
  ClientMetadataResolver,
  isAcceptableRedirectUri,
  isClientMetadataDocumentUrl,
  isRegisteredRedirectUri,
} from './mcp-client-metadata'
import { canonicalResource, MCP_RESOURCE_PATH, requestOrigin } from './mcp-resource'

export interface StoredAuthCode {
  userId: string
  /** The user's auth generation from the session that authorized the code. */
  authGeneration: number
  organizationId: string | null
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  scope: string
  /** The canonical MCP resource URI the token will be bound to (RFC 8707). */
  resource: string
  expiresAt: Date
}

export interface OAuthClient {
  clientId: string
  clientName: string
  redirectUris: string[]
}

/** A client_id that cannot be used, with the OAuth error to answer it with. */
export class OAuthClientError extends Error {
  constructor(
    readonly error: 'invalid_client' | 'invalid_request',
    message: string,
  ) {
    super(message)
  }
}

/** Bounds on a dynamic registration, which anyone can make: the record is stored. */
export const MAX_REGISTERED_REDIRECT_URIS = 10
const MAX_REDIRECT_URI_LENGTH = 2048
/** All of a registration's redirect URIs together, in UTF-8 bytes. */
export const MAX_REDIRECT_URI_BYTES = 4096
const MAX_CLIENT_NAME_LENGTH = 200

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** A registration never used for an authorization within this long is pruned. */
export const UNUSED_CLIENT_TTL_MS = DAY_MS
/** A registration not used for this long is pruned. */
export const IDLE_CLIENT_TTL_MS = 30 * DAY_MS
/** How often (per API instance) a registration may trigger the prune. */
const CLIENT_PRUNE_INTERVAL_MS = HOUR_MS
const DCR_CLIENT_ID_PATTERN = /^[a-f0-9]{32}$/

/**
 * An /authorize request waiting for the signed-in user to approve or deny it on the consent page.
 * Bound to the session that made the request; single use; short-lived.
 */
export interface PendingAuthorization {
  /** Opaque, unguessable id carried in the consent page URL. */
  id: string
  /** Second secret, only handed to the session the record is bound to, and required to decide. */
  csrfToken: string
  userId: string
  /** The session that made the request, when the session token names one. */
  sessionId: string | null
  authGeneration: number
  clientId: string
  clientName: string
  redirectUri: string
  state: string | null
  codeChallenge: string
  scope: string
  /** An organization the client asked for with `org=`, already checked for membership. */
  requestedOrganizationId: string | null
  /**
   * The issuer the client saw when it started (RFC 9207 `iss`). Recorded here because the decision
   * arrives from the web app's server, possibly through another host name.
   */
  issuer: string
  /** The canonical MCP resource URI the token will be bound to (RFC 8707). */
  resource: string
  expiresAt: Date
}

export interface ConsentOrganization {
  id: string
  name: string
}

/** The only PKCE method accepted: RFC 7636 S256. `plain` and a missing method are refused. */
export const PKCE_METHOD = 'S256'

// RFC 7636 section 4.2: a code challenge is 43-128 characters of the unreserved set; an S256
// challenge is the 43-character base64url SHA-256 of the verifier.
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/

@Injectable()
export class McpOAuthService {
  private readonly logger = new Logger(McpOAuthService.name)
  private readonly authCodes = new Map<string, StoredAuthCode>()
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>()
  private readonly CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes
  private readonly clientMetadata = new ClientMetadataResolver()
  private lastClientPruneAt = 0
  /** How long the consent page stays usable before the client must start again. */
  readonly PENDING_TTL_MS = 10 * 60 * 1000 // 10 minutes

  constructor(
    private readonly config: ConfigService,
    private readonly apiTokensService: ApiTokensService,
    private readonly data: ApiCoreDataAccessService,
  ) {}

  /**
   * The same check JwtStrategy applies, for the session cookie /authorize reads directly: pass
   * claims only from a verified token.
   */
  async isSessionTokenCurrent(claims: AuthTokenClaims): Promise<boolean> {
    const user = await this.data.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, authGeneration: true },
    })
    return user ? isAuthTokenCurrent(this.data, claims, user) : false
  }

  getMcpBaseUrl(req?: { protocol: string; get: (name: string) => string | undefined }): string {
    if (req) {
      return `${requestOrigin(req)}${MCP_RESOURCE_PATH}`
    }
    // API_URL is the origin only (no `/api` suffix — see libs/api/config/src/lib/validation.ts),
    // so the `/api/mcp` prefix is appended directly. Trim any trailing slashes defensively (env
    // vars are often set with one) so we never produce `//api/mcp` — string ops avoid regex
    // backtracking.
    let apiUrl = this.config.get<string>('apiUrl') || 'http://localhost:3000'
    while (apiUrl.endsWith('/')) {
      apiUrl = apiUrl.slice(0, -1)
    }
    return `${apiUrl}/api/mcp`
  }

  /** RFC 8414 / OIDC discovery metadata for the authorization server at `/api/mcp`. */
  buildAuthorizationServerMetadata(req: {
    protocol: string
    get: (name: string) => string | undefined
  }) {
    const base = this.getMcpBaseUrl(req)
    return {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      // Dynamic Client Registration: deprecated by MCP 2026-07-28, kept for older clients.
      registration_endpoint: `${base}/register`,
      jwks_uri: `${base}/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: [PKCE_METHOD],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['openid'],
      // Client ID Metadata Documents: a client may use the HTTPS URL of its metadata as client_id.
      client_id_metadata_document_supported: true,
      // RFC 9207: authorization responses carry `iss`.
      authorization_response_iss_parameter_supported: true,
    }
  }

  /** RFC 9728 Protected Resource Metadata for the MCP endpoint at `/api/mcp`. */
  buildProtectedResourceMetadata(req: {
    protocol: string
    get: (name: string) => string | undefined
  }) {
    const base = this.getMcpBaseUrl(req)
    return {
      resource: base,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
    }
  }

  /**
   * The resource a token for this request is bound to: this server's MCP endpoint. A client may
   * name it with `resource` (RFC 8707); naming anything else is refused (null).
   */
  resolveResource(requested: string | undefined, mcpBase: string): string | null {
    const ours = canonicalResource(mcpBase)
    if (!ours) return null
    if (requested === undefined || requested === '') return ours
    return canonicalResource(requested) === ours ? ours : null
  }

  /**
   * Store a Dynamic Client Registration. Registrations are rows (McpOAuthClient), so they survive
   * restarts and are shared by every API instance.
   */
  async registerClient(clientName: string, redirectUris: string[]): Promise<OAuthClient> {
    const clientId = randomBytes(16).toString('hex')
    const name = clientName.trim().slice(0, MAX_CLIENT_NAME_LENGTH) || 'MCP Client'
    const row = await this.data.mcpOAuthClient.create({
      data: { id: clientId, clientName: name, redirectUris },
      select: { id: true, clientName: true, redirectUris: true },
    })
    this.logger.log(`Registered MCP OAuth client: ${row.clientName} (${row.id})`)
    // There is no scheduler in the template: registration, the only way rows are added, also
    // clears out stale ones, at most once an hour per instance and without delaying the response.
    if (Date.now() - this.lastClientPruneAt >= CLIENT_PRUNE_INTERVAL_MS) {
      this.lastClientPruneAt = Date.now()
      this.pruneStaleClients().catch(err =>
        this.logger.error('Pruning stale MCP OAuth clients failed', err),
      )
    }
    return { clientId: row.id, clientName: row.clientName, redirectUris: row.redirectUris }
  }

  /**
   * Delete registrations that were never used within a day of being made, or not used for 30
   * days. A pruned client gets `invalid_client` and registers again. Returns how many went.
   */
  async pruneStaleClients(now = Date.now()): Promise<number> {
    const { count } = await this.data.mcpOAuthClient.deleteMany({
      where: {
        OR: [
          { lastUsedAt: null, createdAt: { lt: new Date(now - UNUSED_CLIENT_TTL_MS) } },
          { lastUsedAt: { lt: new Date(now - IDLE_CLIENT_TTL_MS) } },
        ],
      },
    })
    if (count > 0) this.logger.log(`Pruned ${count} stale MCP OAuth client registration(s)`)
    return count
  }

  /** Record that a DCR client was used, which keeps it from being pruned. */
  async touchClient(clientId: string): Promise<void> {
    if (!DCR_CLIENT_ID_PATTERN.test(clientId)) return
    await this.data.mcpOAuthClient.updateMany({
      where: { id: clientId },
      data: { lastUsedAt: new Date() },
    })
  }

  async getClient(clientId: string): Promise<OAuthClient | undefined> {
    // DCR ids are 32 hex characters; anything else cannot be a row, so skip the query.
    if (!DCR_CLIENT_ID_PATTERN.test(clientId)) return undefined
    const row = await this.data.mcpOAuthClient.findUnique({
      where: { id: clientId },
      select: { id: true, clientName: true, redirectUris: true },
    })
    return row
      ? { clientId: row.id, clientName: row.clientName, redirectUris: row.redirectUris }
      : undefined
  }

  /**
   * The checks /authorize can make before the caller has signed in, without a network request:
   * a DCR client must exist and `redirectUri` must be one it registered; a Client ID Metadata
   * Document URL must be well-formed and `redirectUri` acceptable in form (its document is fetched
   * only after sign-in, by {@link resolveClientForRedirect}).
   */
  async precheckClient(clientId: string, redirectUri: string): Promise<void> {
    if (isClientMetadataDocumentUrl(clientId)) {
      if (!isAcceptableRedirectUri(redirectUri)) {
        throw new OAuthClientError('invalid_request', 'Unacceptable redirect_uri')
      }
      return
    }
    await this.resolveClientForRedirect(clientId, redirectUri)
  }

  /**
   * The client behind `clientId`, after checking that `redirectUri` is one it registered (exact
   * match; a loopback redirect may use any port). A URL-shaped client_id is resolved by fetching
   * its Client ID Metadata Document; anything else must be a stored DCR registration.
   */
  async resolveClientForRedirect(clientId: string, redirectUri: string): Promise<OAuthClient> {
    let client: OAuthClient | undefined
    if (isClientMetadataDocumentUrl(clientId)) {
      try {
        client = await this.clientMetadata.resolve(clientId)
      } catch (err) {
        const reason = err instanceof ClientMetadataError ? err.message : 'lookup failed'
        this.logger.warn(`MCP client metadata document rejected (${clientId}): ${reason}`)
        throw new OAuthClientError('invalid_client', reason)
      }
    } else {
      client = await this.getClient(clientId)
    }
    if (!client) throw new OAuthClientError('invalid_client', 'Unknown client_id')
    if (!isRegisteredRedirectUri(client.redirectUris, redirectUri)) {
      throw new OAuthClientError(
        'invalid_request',
        'redirect_uri is not registered for this client',
      )
    }
    await this.touchClient(clientId)
    return client
  }

  /** The redirect URIs a DCR request may register, or null when any of them is unacceptable. */
  validateRedirectUris(redirectUris: unknown): string[] | null {
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) return null
    if (redirectUris.length > MAX_REGISTERED_REDIRECT_URIS) return null
    const acceptable = (uri: unknown) =>
      typeof uri === 'string' &&
      uri.length <= MAX_REDIRECT_URI_LENGTH &&
      isAcceptableRedirectUri(uri)
    if (!redirectUris.every(acceptable)) return null
    const totalBytes = redirectUris.reduce(
      (sum: number, uri: string) => sum + Buffer.byteLength(uri, 'utf8'),
      0,
    )
    if (totalBytes > MAX_REDIRECT_URI_BYTES) return null
    return redirectUris as string[]
  }

  createAuthCode(params: Omit<StoredAuthCode, 'expiresAt'>): string {
    const code = randomBytes(32).toString('hex')
    this.authCodes.set(code, {
      ...params,
      expiresAt: new Date(Date.now() + this.CODE_TTL_MS),
    })
    return code
  }

  consumeAuthCode(code: string): StoredAuthCode | null {
    const authCode = this.authCodes.get(code)
    if (!authCode) return null
    this.authCodes.delete(code)
    if (authCode.expiresAt < new Date()) {
      this.logger.warn('Auth code expired')
      return null
    }
    return authCode
  }

  /** Whether `method` and `challenge` are an acceptable PKCE request: S256 only. */
  isAcceptablePkce(challenge: string | undefined, method: string | undefined): boolean {
    return (
      method === PKCE_METHOD &&
      typeof challenge === 'string' &&
      PKCE_CHALLENGE_PATTERN.test(challenge)
    )
  }

  verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
    if (method !== PKCE_METHOD || typeof codeVerifier !== 'string') return false
    const hash = createHash('sha256').update(codeVerifier).digest('base64url')
    return hash === codeChallenge
  }

  /**
   * Store a request for the consent page. Nothing is issued until the bound session approves it
   * through {@link takePendingAuthorization}.
   */
  createPendingAuthorization(
    params: Omit<PendingAuthorization, 'id' | 'csrfToken' | 'expiresAt'>,
  ): PendingAuthorization {
    this.sweepExpiredPendingAuthorizations()
    const pending: PendingAuthorization = {
      ...params,
      id: randomBytes(32).toString('base64url'),
      csrfToken: randomBytes(32).toString('base64url'),
      expiresAt: new Date(Date.now() + this.PENDING_TTL_MS),
    }
    this.pendingAuthorizations.set(pending.id, pending)
    return pending
  }

  /** The pending request, without using it up, or null when it is unknown or expired. */
  getPendingAuthorization(id: string): PendingAuthorization | null {
    const pending = this.pendingAuthorizations.get(id)
    if (!pending) return null
    if (pending.expiresAt.getTime() <= Date.now()) {
      this.pendingAuthorizations.delete(id)
      return null
    }
    return pending
  }

  /**
   * Remove and return the pending request. Every decision attempt uses the record up, whether or
   * not it then succeeds, so a record can be decided at most once.
   */
  takePendingAuthorization(id: string): PendingAuthorization | null {
    const pending = this.getPendingAuthorization(id)
    if (pending) this.pendingAuthorizations.delete(id)
    return pending
  }

  /** Whether the verified session `claims` are the session the pending request is bound to. */
  isPendingBoundTo(pending: PendingAuthorization, claims: AuthTokenClaims): boolean {
    return (
      pending.userId === claims.userId &&
      pending.sessionId === (claims.sessionId ?? null) &&
      pending.authGeneration === claimedAuthGeneration(claims.authGeneration)
    )
  }

  /** Constant-time comparison of the submitted CSRF token with the record's. */
  isCsrfTokenValid(pending: PendingAuthorization, submitted: unknown): boolean {
    if (typeof submitted !== 'string' || submitted.length === 0) return false
    const expected = Buffer.from(pending.csrfToken)
    const actual = Buffer.from(submitted)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  private sweepExpiredPendingAuthorizations(): void {
    const now = Date.now()
    for (const [id, pending] of this.pendingAuthorizations) {
      if (pending.expiresAt.getTime() <= now) this.pendingAuthorizations.delete(id)
    }
  }

  /** The organizations the user can grant a client access to, oldest membership first. */
  async listUserOrganizations(userId: string): Promise<ConsentOrganization[]> {
    const memberships = await this.data.organizationMember.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { organization: { select: { id: true, name: true } } },
    })
    return memberships.map(m => ({ id: m.organization.id, name: m.organization.name }))
  }

  /** Who is signed in, for the consent page: display name and primary email. */
  async getAccountSummary(userId: string): Promise<{ name: string | null; email: string | null }> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        emails: {
          orderBy: [{ primary: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          select: { email: true },
        },
      },
    })
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    return { name: name || null, email: user?.emails[0]?.email ?? null }
  }

  async validateOrgMembership(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.data.organizationMember.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    })
    return !!membership
  }

  /**
   * An API token for the MCP client, bound to `resource` (the MCP endpoint): it is accepted at
   * `/api/mcp` and nowhere else.
   */
  async createAccessToken(
    userId: string,
    organizationId: string | null,
    authGeneration: number,
    resource: string,
  ): Promise<string> {
    const result = await this.apiTokensService.generateApiToken(
      userId,
      {
        name: `MCP (${new Date().toISOString()})`,
        organizationId: organizationId ?? undefined,
      },
      authGeneration,
      { resource },
    )
    return result.token
  }
}

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
  expiresAt: Date
}

export interface OAuthClient {
  clientId: string
  clientName: string
  redirectUris: string[]
}

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

// Schemes a browser must never be sent to with an authorization code or an error.
const FORBIDDEN_REDIRECT_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
])

@Injectable()
export class McpOAuthService {
  private readonly logger = new Logger(McpOAuthService.name)
  private readonly authCodes = new Map<string, StoredAuthCode>()
  private readonly clients = new Map<string, OAuthClient>()
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>()
  private readonly CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes
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
      const proto = req.get('x-forwarded-proto') || req.protocol
      const host = req.get('x-forwarded-host') || req.get('host')
      return `${proto}://${host}/api/mcp`
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

  registerClient(clientName: string, redirectUris: string[]): OAuthClient {
    const clientId = randomBytes(16).toString('hex')
    const client: OAuthClient = { clientId, clientName, redirectUris }
    this.clients.set(clientId, client)
    this.logger.log(`Registered MCP OAuth client: ${clientName} (${clientId})`)
    return client
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId)
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

  /** Whether `redirectUri` is an absolute URL with a scheme a browser may safely be sent to. */
  isSafeRedirectUri(redirectUri: string): boolean {
    let url: URL
    try {
      url = new URL(redirectUri)
    } catch {
      return false
    }
    return !url.hash && !FORBIDDEN_REDIRECT_SCHEMES.has(url.protocol)
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

  async createAccessToken(
    userId: string,
    organizationId: string | null,
    authGeneration: number,
  ): Promise<string> {
    const result = await this.apiTokensService.generateApiToken(
      userId,
      {
        name: `MCP (${new Date().toISOString()})`,
        organizationId: organizationId ?? undefined,
      },
      authGeneration,
    )
    return result.token
  }
}

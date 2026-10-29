import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { JwtService } from '@nestjs/jwt'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { McpOAuthService, OAuthClientError, PKCE_METHOD } from './mcp-oauth.service'
import {
  orderSessionTokensNewestFirst,
  Public,
  requestCookieValues,
} from '@nestled-template/api/utils'
import { AuthTokenClaims, claimedAuthGeneration } from '../auth/auth-token-claims'

interface AuthorizeQuery {
  client_id: string
  redirect_uri: string
  state?: string
  code_challenge: string
  code_challenge_method?: string
  scope?: string
  org?: string
  /** RFC 8707: the resource the client wants a token for. Must be this MCP endpoint. */
  resource?: string
}

const EMULATION_REFUSED = {
  error: 'access_denied',
  error_description: 'Clients cannot be authorized while emulating a user',
}
const EXPIRED_REQUEST = {
  error: 'invalid_request',
  error_description: 'This authorization request has expired or was already used',
}
const OTHER_SESSION = {
  error: 'access_denied',
  error_description: 'This authorization request belongs to a different session',
}
/** Dynamic client registrations allowed per client IP per window. */
export const MCP_REGISTER_LIMIT = 10
export const MCP_REGISTER_WINDOW_MS = 60 * 60 * 1000

const INVALID_TARGET = {
  error: 'invalid_target',
  error_description: 'resource must be this MCP endpoint',
}

/** The OAuth error body for a client or redirect check that failed; anything else is rethrown. */
function clientErrorBody(err: unknown): Record<string, string> {
  if (!(err instanceof OAuthClientError)) throw err
  return { error: err.error, error_description: err.message }
}

/** The host a redirect URI points at, or its scheme for a private-use URI with no host. */
function redirectHostOf(redirectUri: string): string {
  const url = new URL(redirectUri)
  return url.host || url.protocol
}

/**
 * `redirectUri` with `params`, the RFC 9207 `iss` (on approvals and denials alike, so a client
 * talking to several authorization servers can tell which one answered) and `state` (when the
 * client sent one) added to its query.
 */
function withParams(
  redirectUri: string,
  params: Record<string, string>,
  state: string | null,
  issuer: string,
): string {
  const query = new URLSearchParams(params)
  query.set('iss', issuer)
  if (state) query.set('state', state)
  const separator = redirectUri.includes('?') ? '&' : '?'
  return `${redirectUri}${separator}${query.toString()}`
}

// OAuth discovery, authorization and token exchange, by definition pre-auth. The consent
// endpoints (authorize/pending, authorize/decision) authenticate the session cookie themselves
// and bind every decision to the session that made the request.
@Public()
@Controller('mcp')
export class McpOAuthController {
  private readonly logger = new Logger(McpOAuthController.name)

  constructor(
    private readonly oauth: McpOAuthService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  /** OIDC / OAuth 2.0 Authorization Server Metadata */
  @Get('.well-known/openid-configuration')
  getOidcConfig(@Req() req: Request) {
    return this.buildMetadata(req)
  }

  @Get('.well-known/oauth-authorization-server')
  getOAuthServerMetadata(@Req() req: Request) {
    return this.buildMetadata(req)
  }

  /** Protected Resource Metadata — tells clients which auth server protects this resource */
  @Get('.well-known/oauth-protected-resource')
  getProtectedResourceMetadata(@Req() req: Request) {
    return this.oauth.buildProtectedResourceMetadata(req)
  }

  /** JWKS endpoint — no JWTs issued but some clients validate jwks_uri exists */
  @Get('jwks')
  getJwks() {
    return { keys: [] }
  }

  /**
   * Dynamic Client Registration (RFC 7591). Deprecated by MCP 2026-07-28 in favour of Client ID
   * Metadata Documents, and kept for clients that predate them. Registrations are stored, so they
   * survive restarts and work on every API instance.
   */
  // Unauthenticated, and every call stores a row, so it is rate limited per client IP: the
  // `signup` throttler AuthModule configures (SIGNUP_THROTTLE_ENABLED turns it off), with its own
  // bucket and limit for this route. Keyed on req.ip, which depends on TRUST_PROXY_HOPS being set
  // correctly (see main.ts and GqlThrottlerGuard).
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ signup: { limit: MCP_REGISTER_LIMIT, ttl: MCP_REGISTER_WINDOW_MS } })
  @HttpCode(201)
  async register(@Body() body: Record<string, unknown>) {
    const clientName = typeof body['client_name'] === 'string' ? body['client_name'] : 'MCP Client'
    const redirectUris = this.oauth.validateRedirectUris(body['redirect_uris'])
    if (!redirectUris) {
      throw new BadRequestException({
        error: 'invalid_redirect_uri',
        error_description:
          'redirect_uris must list 1-10 https, loopback http, or private-use scheme URIs',
      })
    }
    const client = await this.oauth.registerClient(clientName, redirectUris)
    return {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }

  /**
   * OAuth 2.0 Authorization Endpoint.
   *
   * Never issues a code. A signed-in caller's request is stored as a pending authorization bound
   * to their session, and they are sent to the web app's consent page (/mcp-connect), which shows
   * who is asking, where the code would go and what would be granted. Only an explicit approval
   * there, through POST authorize/decision, issues a code. A caller without a session is sent to
   * login first and comes back here.
   *
   * `client_id` is either a client registered through /register (DCR) or the HTTPS URL of a Client
   * ID Metadata Document, fetched only once the caller has signed in. Either way `redirect_uri`
   * must be one the client registered, checked before the pending authorization is created.
   */
  @Get('authorize')
  async authorize(@Query() query: AuthorizeQuery, @Req() req: Request, @Res() res: Response) {
    const siteUrl = this.config.get<string>('siteUrl') || 'http://localhost:4200'
    const mcpBase = this.oauth.getMcpBaseUrl(req)

    const checked = await this.checkAuthorizeRequest(query, mcpBase)
    if ('error' in checked) {
      return res.status(400).json(checked.error)
    }
    const { client_id: clientId, redirect_uri: redirectUri, state, scope, org: orgId } = query

    const session = await this.getSessionFromCookie(req)
    const userId = session?.userId

    if (!session || !userId) {
      return res.redirect(this.loginRedirectFor(query, siteUrl, mcpBase))
    }

    // A client authorized here gets a long-lived credential of its own. Under emulation that would
    // be a credential for the emulated user that outlives the emulation, so it is refused.
    if (session.isEmulating) {
      return res.status(403).json(EMULATION_REFUSED)
    }

    if (orgId && !(await this.oauth.validateOrgMembership(userId, orgId))) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Not a member of that organization',
      })
    }

    let client
    try {
      client = await this.oauth.resolveClientForRedirect(clientId, redirectUri)
    } catch (err) {
      return res.status(400).json(clientErrorBody(err))
    }

    const pending = this.oauth.createPendingAuthorization({
      userId,
      sessionId: session.sessionId ?? null,
      authGeneration: claimedAuthGeneration(session.authGeneration),
      clientId,
      clientName: client.clientName,
      redirectUri,
      state: state ?? null,
      codeChallenge: query.code_challenge,
      scope: scope ?? 'openid',
      requestedOrganizationId: orgId ?? null,
      issuer: mcpBase,
      resource: checked.resource,
    })

    return res.redirect(`${siteUrl}/mcp-connect?request=${encodeURIComponent(pending.id)}`)
  }

  /**
   * Everything /authorize can check before it knows who is asking: required and single-valued
   * parameters, S256 PKCE, the RFC 8707 resource, and the client and redirect URI without a
   * network request (a metadata document is fetched only after sign-in). Returns the error body
   * to answer with, or the resource the token will be bound to.
   */
  private async checkAuthorizeRequest(
    query: AuthorizeQuery,
    mcpBase: string,
  ): Promise<{ error: Record<string, string> } | { resource: string }> {
    const { client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge } = query

    if (!clientId || !redirectUri || !codeChallenge) {
      return {
        error: { error: 'invalid_request', error_description: 'Missing required parameters' },
      }
    }

    // A repeated query parameter arrives as an array; every parameter here must be a single value.
    if (Object.values(query).some(value => value !== undefined && typeof value !== 'string')) {
      return { error: { error: 'invalid_request', error_description: 'Repeated parameters' } }
    }

    // PKCE is mandatory for every client and only S256 is accepted. A missing method means
    // `plain` (RFC 7636 section 4.3), so it is refused too.
    if (!this.oauth.isAcceptablePkce(codeChallenge, query.code_challenge_method)) {
      return {
        error: {
          error: 'invalid_request',
          error_description: 'code_challenge_method must be S256 with a valid code_challenge',
        },
      }
    }

    const resource = this.oauth.resolveResource(query.resource, mcpBase)
    if (!resource) {
      return { error: INVALID_TARGET }
    }

    try {
      await this.oauth.precheckClient(clientId, redirectUri)
    } catch (err) {
      return { error: clientErrorBody(err) }
    }
    return { resource }
  }

  /** The login page, coming back to this same authorization request once signed in. */
  private loginRedirectFor(query: AuthorizeQuery, siteUrl: string, mcpBase: string): string {
    const optional: Record<string, string | undefined> = {
      state: query.state,
      scope: query.scope,
      org: query.org,
      resource: query.resource,
    }
    const authorizeParams = new URLSearchParams({
      client_id: query.client_id,
      redirect_uri: query.redirect_uri,
      code_challenge: query.code_challenge,
      code_challenge_method: PKCE_METHOD,
    })
    for (const [name, value] of Object.entries(optional)) {
      if (value) authorizeParams.set(name, value)
    }
    const authorizeUrl = `${mcpBase}/authorize?${authorizeParams.toString()}`
    return `${siteUrl}/login?redirect=${encodeURIComponent(authorizeUrl)}`
  }

  /**
   * What the consent page shows for a pending authorization, and the CSRF token its form must
   * send back. Called server-side by the web app with the browser's session cookie. Only the
   * session the request is bound to can read it, and CORS keeps other origins from reading it.
   */
  @Get('authorize/pending')
  async getPendingAuthorization(
    @Query('request') requestId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store')

    const session = await this.getSessionFromCookie(req)
    if (!session) {
      return res
        .status(401)
        .json({ error: 'login_required', error_description: 'Sign in to continue' })
    }
    if (session.isEmulating) {
      return res.status(403).json(EMULATION_REFUSED)
    }

    const pending = requestId ? this.oauth.getPendingAuthorization(requestId) : null
    if (!pending) {
      return res.status(404).json(EXPIRED_REQUEST)
    }
    if (!this.oauth.isPendingBoundTo(pending, session)) {
      return res.status(403).json(OTHER_SESSION)
    }

    const [account, organizations] = await Promise.all([
      this.oauth.getAccountSummary(pending.userId),
      this.oauth.listUserOrganizations(pending.userId),
    ])

    return res.json({
      request: pending.id,
      csrfToken: pending.csrfToken,
      expiresAt: pending.expiresAt.toISOString(),
      client: {
        name: pending.clientName,
        // Self-asserted on both paths: a DCR client named itself, and a Client ID Metadata
        // Document's name is whatever its author wrote (nothing checks the document's origin
        // against a trust list), so neither is shown as verified.
        verified: false,
      },
      redirectUri: pending.redirectUri,
      redirectHost: redirectHostOf(pending.redirectUri),
      account,
      organizations,
      selectedOrganizationId: pending.requestedOrganizationId,
    })
  }

  /**
   * The consent decision. Uses the pending record up whatever the outcome, then requires the
   * same session that made the request and the record's CSRF token. Deny answers the client with
   * `access_denied`; approve issues a single-use authorization code for the chosen organization.
   * Returns the URL to send the browser to rather than redirecting, because the web app's consent
   * page calls it server-side.
   */
  @Post('authorize/decision')
  @HttpCode(200)
  async decideAuthorization(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store')

    const requestId = typeof body['request'] === 'string' ? body['request'] : ''
    const pending = requestId ? this.oauth.takePendingAuthorization(requestId) : null
    if (!pending) {
      return res.status(400).json(EXPIRED_REQUEST)
    }

    const session = await this.getSessionFromCookie(req)
    if (!session) {
      return res
        .status(401)
        .json({ error: 'login_required', error_description: 'Sign in to continue' })
    }
    if (session.isEmulating) {
      return res.status(403).json(EMULATION_REFUSED)
    }
    if (!this.oauth.isPendingBoundTo(pending, session)) {
      return res.status(403).json(OTHER_SESSION)
    }
    if (!this.oauth.isCsrfTokenValid(pending, body['csrf_token'])) {
      return res
        .status(403)
        .json({ error: 'access_denied', error_description: 'Invalid or missing CSRF token' })
    }

    const decision = body['decision']
    if (decision === 'deny') {
      this.logger.log(`MCP OAuth consent denied by user ${pending.userId} for ${pending.clientId}`)
      return res.json({
        redirect_to: withParams(
          pending.redirectUri,
          { error: 'access_denied' },
          pending.state,
          pending.issuer,
        ),
      })
    }
    if (decision !== 'approve') {
      return res
        .status(400)
        .json({ error: 'invalid_request', error_description: 'decision must be approve or deny' })
    }

    const organizations = await this.oauth.listUserOrganizations(pending.userId)
    let organizationId: string | null = null
    if (organizations.length > 0) {
      const chosen = typeof body['organization_id'] === 'string' ? body['organization_id'] : ''
      if (!organizations.some(org => org.id === chosen)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Choose an organization you belong to',
        })
      }
      organizationId = chosen
    }

    const code = this.oauth.createAuthCode({
      userId: pending.userId,
      authGeneration: pending.authGeneration,
      organizationId,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: PKCE_METHOD,
      scope: pending.scope,
      resource: pending.resource,
    })
    this.logger.log(
      `MCP OAuth consent approved by user ${pending.userId} for ${pending.clientId} org=${organizationId}`,
    )

    return res.json({
      redirect_to: withParams(pending.redirectUri, { code }, pending.state, pending.issuer),
    })
  }

  /** OAuth 2.0 Token Endpoint — exchanges auth code for an API token */
  @Post('token')
  @HttpCode(200)
  async token(@Body() body: Record<string, string>, @Res() res: Response) {
    const { grant_type, code, redirect_uri, code_verifier, client_id, resource } = body

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' })
    }

    if (!code || !code_verifier || !client_id) {
      return res
        .status(400)
        .json({ error: 'invalid_request', error_description: 'Missing required parameters' })
    }

    const authCode = this.oauth.consumeAuthCode(code)
    if (!authCode) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code',
      })
    }

    if (authCode.clientId !== client_id) {
      return res.status(400).json({ error: 'invalid_client' })
    }

    if (authCode.redirectUri !== redirect_uri) {
      return res
        .status(400)
        .json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
    }

    if (
      !this.oauth.verifyPkce(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)
    ) {
      return res
        .status(400)
        .json({ error: 'invalid_grant', error_description: 'PKCE verification failed' })
    }

    // RFC 8707: a resource named here must be the one the code was issued for.
    if (resource && this.oauth.resolveResource(resource, authCode.resource) !== authCode.resource) {
      return res.status(400).json(INVALID_TARGET)
    }

    // The same rule JwtStrategy applies: a deactivated account gets no new token, even from a code
    // issued before it was deactivated.
    if (!(await this.oauth.isUserActive(authCode.userId))) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code',
      })
    }

    await this.oauth.touchClient(authCode.clientId)
    const accessToken = await this.oauth.createAccessToken(
      authCode.userId,
      authCode.organizationId,
      authCode.authGeneration,
      authCode.resource,
    )
    this.logger.log(
      `MCP OAuth token issued for user ${authCode.userId} org=${authCode.organizationId}`,
    )

    return res.json({ access_token: accessToken, token_type: 'bearer', scope: authCode.scope })
  }

  /**
   * The verified, still-current session token from the cookie, or null. With several same-name
   * session cookies (host-only and parent-domain, say) they are tried newest first and the first
   * that verifies and is still current wins, so neither a stale cookie that comes first nor a
   * forged one with a far-future `iat` can shadow the valid session.
   */
  private async getSessionFromCookie(req: Request): Promise<AuthTokenClaims | null> {
    const cookieName = process.env['VITE_COOKIE_NAME'] || '__session'
    const candidates = orderSessionTokensNewestFirst(requestCookieValues(req, cookieName))
    for (const cookieToken of candidates) {
      let payload: AuthTokenClaims
      try {
        payload = this.jwtService.verify<AuthTokenClaims>(cookieToken)
      } catch {
        continue
      }
      if (!payload?.userId) continue
      // A genuine but revoked session must not authorize a new client, any more than it can make
      // an API request.
      if (await this.oauth.isSessionTokenCurrent(payload)) return payload
    }
    return null
  }

  private buildMetadata(req: Request) {
    return this.oauth.buildAuthorizationServerMetadata(req)
  }
}

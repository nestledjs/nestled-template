import { Controller, Get, Post, Query, Body, Req, Res, HttpCode, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { McpOAuthService, PKCE_METHOD } from './mcp-oauth.service'
import { Public } from '@nestled-template/api/utils'
import { AuthTokenClaims, claimedAuthGeneration } from '../auth/auth-token-claims'

interface AuthorizeQuery {
  client_id: string
  redirect_uri: string
  state?: string
  code_challenge: string
  code_challenge_method?: string
  scope?: string
  org?: string
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

/** The host a redirect URI points at, or its scheme for a private-use URI with no host. */
function redirectHostOf(redirectUri: string): string {
  const url = new URL(redirectUri)
  return url.host || url.protocol
}

/** `redirectUri` with `params` (and `state`, when the client sent one) added to its query. */
function withParams(
  redirectUri: string,
  params: Record<string, string>,
  state: string | null,
): string {
  const query = new URLSearchParams(params)
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
    const base = this.oauth.getMcpBaseUrl(req)
    return {
      resource: base,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
    }
  }

  /** JWKS endpoint — no JWTs issued but some clients validate jwks_uri exists */
  @Get('jwks')
  getJwks() {
    return { keys: [] }
  }

  /** Dynamic Client Registration (RFC 7591) */
  @Post('register')
  @HttpCode(201)
  register(@Body() body: Record<string, unknown>) {
    const clientName = typeof body['client_name'] === 'string' ? body['client_name'] : 'MCP Client'
    const redirectUris = Array.isArray(body['redirect_uris'])
      ? (body['redirect_uris'] as string[])
      : []
    const client = this.oauth.registerClient(clientName, redirectUris)
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
   */
  @Get('authorize')
  async authorize(@Query() query: AuthorizeQuery, @Req() req: Request, @Res() res: Response) {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope,
      org: orgId,
    } = query
    const siteUrl = this.config.get<string>('siteUrl') || 'http://localhost:4200'
    const mcpBase = this.oauth.getMcpBaseUrl(req)

    if (!clientId || !redirectUri || !codeChallenge) {
      return res
        .status(400)
        .json({ error: 'invalid_request', error_description: 'Missing required parameters' })
    }

    // A repeated query parameter arrives as an array; every parameter here must be a single value.
    if (Object.values(query).some(value => value !== undefined && typeof value !== 'string')) {
      return res
        .status(400)
        .json({ error: 'invalid_request', error_description: 'Repeated parameters' })
    }

    // PKCE is mandatory for every client and only S256 is accepted. A missing method means
    // `plain` (RFC 7636 section 4.3), so it is refused too.
    if (!this.oauth.isAcceptablePkce(codeChallenge, codeChallengeMethod)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'code_challenge_method must be S256 with a valid code_challenge',
      })
    }

    const client = this.oauth.getClient(clientId)
    if (!client) {
      return res
        .status(400)
        .json({ error: 'invalid_client', error_description: 'Unknown client_id' })
    }

    if (!this.oauth.isSafeRedirectUri(redirectUri)) {
      return res
        .status(400)
        .json({ error: 'invalid_request', error_description: 'Unacceptable redirect_uri' })
    }

    const session = await this.getSessionFromCookie(req)
    const userId = session?.userId

    if (!session || !userId) {
      const authorizeParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: PKCE_METHOD,
        ...(state ? { state } : {}),
        ...(scope ? { scope } : {}),
        ...(orgId ? { org: orgId } : {}),
      })
      const authorizeUrl = `${mcpBase}/authorize?${authorizeParams.toString()}`
      return res.redirect(`${siteUrl}/login?redirect=${encodeURIComponent(authorizeUrl)}`)
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

    const pending = this.oauth.createPendingAuthorization({
      userId,
      sessionId: session.sessionId ?? null,
      authGeneration: claimedAuthGeneration(session.authGeneration),
      clientId,
      clientName: client.clientName,
      redirectUri,
      state: state ?? null,
      codeChallenge,
      scope: scope ?? 'openid',
      requestedOrganizationId: orgId ?? null,
    })

    return res.redirect(`${siteUrl}/mcp-connect?request=${encodeURIComponent(pending.id)}`)
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
        // Every client here came from dynamic registration, so its name is whatever it said.
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
        redirect_to: withParams(pending.redirectUri, { error: 'access_denied' }, pending.state),
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
    })
    this.logger.log(
      `MCP OAuth consent approved by user ${pending.userId} for ${pending.clientId} org=${organizationId}`,
    )

    return res.json({ redirect_to: withParams(pending.redirectUri, { code }, pending.state) })
  }

  /** OAuth 2.0 Token Endpoint — exchanges auth code for an API token */
  @Post('token')
  @HttpCode(200)
  async token(@Body() body: Record<string, string>, @Res() res: Response) {
    const { grant_type, code, redirect_uri, code_verifier, client_id } = body

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

    const accessToken = await this.oauth.createAccessToken(
      authCode.userId,
      authCode.organizationId,
      authCode.authGeneration,
    )
    this.logger.log(
      `MCP OAuth token issued for user ${authCode.userId} org=${authCode.organizationId}`,
    )

    return res.json({ access_token: accessToken, token_type: 'bearer', scope: authCode.scope })
  }

  /** The verified, still-current session token from the cookie, or null. */
  private async getSessionFromCookie(req: Request): Promise<AuthTokenClaims | null> {
    const cookieName = process.env['VITE_COOKIE_NAME'] || '__session'
    const cookieToken = (req.cookies as Record<string, string>)?.[cookieName]
    if (!cookieToken) return null
    let payload: AuthTokenClaims
    try {
      payload = this.jwtService.verify<AuthTokenClaims>(cookieToken)
    } catch {
      return null
    }
    if (!payload?.userId) return null
    // A genuine but revoked session must not authorize a new client, any more than it can make an
    // API request.
    return (await this.oauth.isSessionTokenCurrent(payload)) ? payload : null
  }

  private buildMetadata(req: Request) {
    const base = this.oauth.getMcpBaseUrl(req)
    return {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      jwks_uri: `${base}/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['openid'],
    }
  }
}

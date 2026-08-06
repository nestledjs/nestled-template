import { Controller, Get, Post, Query, Body, Req, Res, HttpCode, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { McpOAuthService } from './mcp-oauth.service'
import { Public } from '@nestled-template/api/utils'

interface AuthorizeQuery {
  client_id: string
  redirect_uri: string
  state?: string
  code_challenge: string
  code_challenge_method?: string
  scope?: string
  org?: string
}

// OAuth discovery and token exchange, by definition pre-auth.
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
   * If the user has a valid session cookie, issues an auth code and redirects.
   * If the user belongs to multiple orgs, redirects to /mcp-connect for org selection.
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

    const client = this.oauth.getClient(clientId)
    if (!client) {
      return res
        .status(400)
        .json({ error: 'invalid_client', error_description: 'Unknown client_id' })
    }

    const userId = this.getUserIdFromCookie(req)

    const authorizeParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod ?? 'S256',
      ...(state ? { state } : {}),
      ...(scope ? { scope } : {}),
    })
    const authorizeUrl = `${mcpBase}/authorize?${authorizeParams.toString()}`

    if (!userId) {
      return res.redirect(`${siteUrl}/login?redirect=${encodeURIComponent(authorizeUrl)}`)
    }

    const organizationId = await this.resolveOrganizationId(
      userId,
      orgId,
      siteUrl,
      authorizeUrl,
      res,
    )
    if (organizationId === null) return

    const code = this.oauth.createAuthCode({
      userId,
      organizationId,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: codeChallengeMethod ?? 'S256',
      scope: scope ?? 'openid',
    })

    const params = new URLSearchParams({ code })
    if (state) params.set('state', state)
    return res.redirect(`${redirectUri}?${params.toString()}`)
  }

  private async resolveOrganizationId(
    userId: string,
    orgId: string | undefined,
    siteUrl: string,
    authorizeUrl: string,
    res: Response,
  ): Promise<string | null> {
    if (orgId) {
      const isMember = await this.oauth.validateOrgMembership(userId, orgId)
      if (!isMember) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Not a member of that organization',
        })
        return null
      }
      return orgId
    }

    const orgCount = await this.oauth.countUserOrganizations(userId)
    if (orgCount > 1) {
      res.redirect(`${siteUrl}/mcp-connect?back=${encodeURIComponent(authorizeUrl)}`)
      return null
    }

    return this.oauth.resolveOrganizationId(userId)
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

    const accessToken = await this.oauth.createAccessToken(authCode.userId, authCode.organizationId)
    this.logger.log(
      `MCP OAuth token issued for user ${authCode.userId} org=${authCode.organizationId}`,
    )

    return res.json({ access_token: accessToken, token_type: 'bearer', scope: authCode.scope })
  }

  private getUserIdFromCookie(req: Request): string | null {
    const cookieName = process.env['VITE_COOKIE_NAME'] || '__session'
    const cookieToken = (req.cookies as Record<string, string>)?.[cookieName]
    if (!cookieToken) return null
    try {
      const payload = this.jwtService.verify<{ userId: string }>(cookieToken)
      return payload?.userId ?? null
    } catch {
      return null
    }
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

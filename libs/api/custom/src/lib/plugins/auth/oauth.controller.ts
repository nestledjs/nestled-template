import { Controller, Get, Query, Res, BadRequestException, Req } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { OAuthService, type OAuthUserProfile } from './oauth.service'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'

// NOTE: the app sets a global prefix of `api` (see apps/api/src/main.ts). This controller must
// therefore be mounted at `auth` (NOT `api/auth`) so its routes register at `/api/auth/...` —
// matching the redirect_uri-building code below, the `.env.example` callback URLs, and the
// `/api/auth` entry in main.ts's VALID_API_PREFIXES whitelist. Using `api/auth` here double-prefixes
// every route to `/api/api/auth/...`, which 404s and breaks all OAuth logins.
@Controller('auth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Google OAuth callback
   * URL: /api/auth/google/callback?code=...&state=...
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleCallback(res, req, 'google', error, code, async () => {
      const idToken = await this.oauthService.exchangeGoogleCodeForIdToken(code)
      return this.oauthService.verifyGoogleToken(idToken)
    })
  }

  /**
   * GitHub OAuth callback
   * URL: /api/auth/github/callback?code=...&state=...
   */
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleCallback(res, req, 'github', error, code, () =>
      this.oauthService.verifyGitHubCode(code),
    )
  }

  /**
   * Shared provider-callback flow. Both providers run the identical post-profile sequence, so it
   * lives here — in particular the 2FA gate below, which must not be possible to apply to one
   * provider and forget on the other.
   */
  private async handleCallback(
    res: Response,
    req: Request,
    provider: 'google' | 'github',
    error: string,
    code: string,
    resolveProfile: () => Promise<OAuthUserProfile>,
  ) {
    const siteUrl = this.config.get<string>('siteUrl') || 'http://localhost:4200'

    // `error` arrives from the provider redirect and is attacker-influenceable. Build the query
    // string with URLSearchParams so an `&`, `#` or `?` in it cannot append or truncate
    // parameters on the URL we hand back to the browser.
    const errorRedirect = (reason: string) =>
      res.redirect(
        `${siteUrl}/auth/oauth-error?${new URLSearchParams({ provider, error: reason })}`,
      )

    try {
      if (error) {
        return errorRedirect(error)
      }

      if (!code) {
        throw new BadRequestException('No authorization code provided')
      }

      const profile = await resolveProfile()

      // Find or create user
      const user = await this.oauthService.findOrCreateUserFromOAuth(profile)

      // A verified OAuth identity is only the FIRST factor. Users who enabled 2FA must still be
      // challenged for it, exactly as in the password login path — otherwise anyone holding the
      // provider account (or a provider session on a shared machine) gets in with the second
      // factor skipped. Mint the short-lived hand-off token and bounce to the login page's 2FA
      // step; no session row and no auth cookie exist until complete2FALogin succeeds.
      if (user.twoFactorEnabled) {
        const tempToken = this.authService.createTemp2FAToken(user.id)
        const params = new URLSearchParams({ oauth_2fa: tempToken, provider })
        return res.redirect(`${siteUrl}/login?${params.toString()}`)
      }

      // Extract session info from request
      const sessionInfo = this.sessionService.extractSessionInfo(req)

      // Create session (sign JWT token)
      const authPayload = await this.authService.signUser(user, false, undefined, sessionInfo)

      if (!authPayload.token) {
        throw new BadRequestException('Failed to issue session token')
      }

      // Set auth cookie
      this.authService.setCookie(res, authPayload.token)

      // Redirect to frontend
      return res.redirect(`${siteUrl}/auth/oauth-success`)
    } catch (err) {
      console.error(`${provider} OAuth error:`, err)
      return errorRedirect('authentication_failed')
    }
  }

  /**
   * Get OAuth authorization URL for Google
   * URL: /api/auth/google/authorize
   */
  @Get('google/authorize')
  async googleAuthorize(@Res() res: Response) {
    const apiUrl = this.config.get<string>('apiUrl') || 'http://localhost:3000'
    const redirectUri = `${apiUrl}/api/auth/google/callback`
    const authUrl = this.oauthService.generateGoogleAuthorizationUrl(redirectUri)

    return res.redirect(authUrl)
  }

  /**
   * Get OAuth authorization URL for GitHub
   * URL: /api/auth/github/authorize
   */
  @Get('github/authorize')
  async githubAuthorize(@Res() res: Response) {
    if (!this.oauthService.isGitHubConfigured()) {
      throw new BadRequestException('GitHub OAuth is not configured')
    }

    const apiUrl = this.config.get<string>('apiUrl') || 'http://localhost:3000'
    const redirectUri = `${apiUrl}/api/auth/github/callback`

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${this.config.get<string>(
      'oauth.github.clientId',
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`

    return res.redirect(authUrl)
  }
}

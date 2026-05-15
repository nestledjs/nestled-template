import { Controller, Get, Query, Res, HttpStatus, BadRequestException, Req } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { OAuthService } from './oauth.service'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { OAuthProvider } from './dto'

@Controller('api/auth')
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
  async googleCallback(@Query('code') code: string, @Query('error') error: string, @Req() req: Request, @Res() res: Response) {
    const siteUrl = this.config.get<string>('siteUrl') || 'http://localhost:4200'

    try {
      if (error) {
        return res.redirect(`${siteUrl}/auth/oauth-error?provider=google&error=${error}`)
      }

      if (!code) {
        throw new BadRequestException('No authorization code provided')
      }

      // Exchange code for tokens
      const googleClient = (this.oauthService as any).googleClient
      if (!googleClient) {
        throw new BadRequestException('Google OAuth is not configured')
      }

      const { tokens } = await googleClient.getToken(code)
      if (!tokens.id_token) {
        throw new BadRequestException('No ID token received from Google')
      }

      // Verify token and get user profile
      const profile = await this.oauthService.verifyGoogleToken(tokens.id_token)

      // Find or create user
      const user = await this.oauthService.findOrCreateUserFromOAuth(profile)

      // Extract session info from request
      const sessionInfo = this.sessionService.extractSessionInfo(req)

      // Create session (sign JWT token)
      const authPayload = await this.authService.signUser(user, false, undefined, sessionInfo)

      // Set auth cookie
      this.authService.setCookie(res, authPayload.token)

      // Redirect to frontend
      return res.redirect(`${siteUrl}/auth/oauth-success`)
    } catch (err) {
      console.error('Google OAuth error:', err)
      return res.redirect(`${siteUrl}/auth/oauth-error?provider=google&error=authentication_failed`)
    }
  }

  /**
   * GitHub OAuth callback
   * URL: /api/auth/github/callback?code=...&state=...
   */
  @Get('github/callback')
  async githubCallback(@Query('code') code: string, @Query('error') error: string, @Req() req: Request, @Res() res: Response) {
    const siteUrl = this.config.get<string>('siteUrl') || 'http://localhost:4200'

    try {
      if (error) {
        return res.redirect(`${siteUrl}/auth/oauth-error?provider=github&error=${error}`)
      }

      if (!code) {
        throw new BadRequestException('No authorization code provided')
      }

      // Verify code and get user profile
      const profile = await this.oauthService.verifyGitHubCode(code)

      // Find or create user
      const user = await this.oauthService.findOrCreateUserFromOAuth(profile)

      // Extract session info from request
      const sessionInfo = this.sessionService.extractSessionInfo(req)

      // Create session (sign JWT token)
      const authPayload = await this.authService.signUser(user, false, undefined, sessionInfo)

      // Set auth cookie
      this.authService.setCookie(res, authPayload.token)

      // Redirect to frontend
      return res.redirect(`${siteUrl}/auth/oauth-success`)
    } catch (err) {
      console.error('GitHub OAuth error:', err)
      return res.redirect(`${siteUrl}/auth/oauth-error?provider=github&error=authentication_failed`)
    }
  }

  /**
   * Get OAuth authorization URL for Google
   * URL: /api/auth/google/authorize
   */
  @Get('google/authorize')
  async googleAuthorize(@Res() res: Response) {
    const googleClient = (this.oauthService as any).googleClient
    if (!googleClient) {
      throw new BadRequestException('Google OAuth is not configured')
    }

    const apiUrl = this.config.get<string>('apiUrl') || 'http://localhost:3000'
    const redirectUri = `${apiUrl}/api/auth/google/callback`

    const authUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      redirect_uri: redirectUri,
    })

    return res.redirect(authUrl)
  }

  /**
   * Get OAuth authorization URL for GitHub
   * URL: /api/auth/github/authorize
   */
  @Get('github/authorize')
  async githubAuthorize(@Res() res: Response) {
    const githubApp = (this.oauthService as any).githubApp
    if (!githubApp) {
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

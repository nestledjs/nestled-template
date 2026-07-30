import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { OAuthController } from './oauth.controller'
import { OAuthService } from './oauth.service'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'

// Mock the ESM modules that cause Jest issues (see oauth.service.spec.ts). The controller pulls
// oauth.service into the module graph, so these are required here too.
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: jest.fn() })),
}))
jest.mock('@octokit/oauth-app', () => ({
  OAuthApp: jest.fn().mockImplementation(() => ({ createToken: jest.fn() })),
}))

const SITE_URL = 'https://app.example.com'

describe('OAuthController', () => {
  let controller: OAuthController
  let oauthService: jest.Mocked<
    Pick<
      OAuthService,
      | 'exchangeGoogleCodeForIdToken'
      | 'verifyGoogleToken'
      | 'verifyGitHubCode'
      | 'findOrCreateUserFromOAuth'
    >
  >
  let authService: jest.Mocked<Pick<AuthService, 'signUser' | 'setCookie' | 'createTemp2FAToken'>>
  let sessionService: jest.Mocked<Pick<SessionService, 'extractSessionInfo'>>
  let res: jest.Mocked<Pick<Response, 'redirect'>>
  let req: Request

  // Each provider resolves its own profile, so a provider-specific bug in
  // findOrCreateUserFromOAuth cannot hide behind a shared fixture.
  const googleProfile = { provider: 'google', providerUserId: 'g-1', email: 'a@example.com' }
  const githubProfile = { provider: 'github', providerUserId: 'h-1', email: 'a@example.com' }

  beforeEach(() => {
    oauthService = {
      exchangeGoogleCodeForIdToken: jest.fn().mockResolvedValue('id-token'),
      verifyGoogleToken: jest.fn().mockResolvedValue(googleProfile),
      verifyGitHubCode: jest.fn().mockResolvedValue(githubProfile),
      findOrCreateUserFromOAuth: jest.fn(),
    } as any

    authService = {
      signUser: jest.fn().mockResolvedValue({ token: 'session-jwt', user: { id: 'u-1' } }),
      setCookie: jest.fn(),
      createTemp2FAToken: jest.fn().mockReturnValue('temp-2fa-jwt'),
    } as any

    sessionService = { extractSessionInfo: jest.fn().mockReturnValue({ ip: '127.0.0.1' }) } as any
    res = { redirect: jest.fn() } as any
    req = {} as Request

    const config = { get: jest.fn().mockReturnValue(SITE_URL) } as unknown as ConfigService

    controller = new OAuthController(
      oauthService as unknown as OAuthService,
      authService as unknown as AuthService,
      sessionService as unknown as SessionService,
      config,
    )
  })

  describe.each([
    [
      'google',
      (c: OAuthController, r: Response, q: Request) => c.googleCallback('code-1', '', q, r),
    ],
    [
      'github',
      (c: OAuthController, r: Response, q: Request) => c.githubCallback('code-1', '', q, r),
    ],
  ])('%s callback', (provider, invoke) => {
    it('resolves the profile from its own provider', async () => {
      oauthService.findOrCreateUserFromOAuth.mockResolvedValue({
        id: 'u-1',
        twoFactorEnabled: false,
      } as never)

      await invoke(controller, res as unknown as Response, req)

      expect(oauthService.findOrCreateUserFromOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider }),
      )
    })

    it('encodes a hostile error value instead of letting it inject query parameters', async () => {
      // The provider controls `error`; an unencoded `&`/`#` would let it append or truncate
      // parameters on the URL handed back to the browser.
      const hostile = 'bad&oauth_2fa=forged#x'
      const call =
        provider === 'google'
          ? controller.googleCallback('', hostile, req, res as unknown as Response)
          : controller.githubCallback('', hostile, req, res as unknown as Response)
      await call

      // Express's redirect() is overloaded as (status, url), so the first arg types as number.
      const target = new URL(res.redirect.mock.calls[0][0] as unknown as string)
      expect(target.searchParams.get('error')).toBe(hostile)
      expect(target.searchParams.get('oauth_2fa')).toBeNull()
      expect(target.hash).toBe('')
    })

    it('challenges for 2FA instead of issuing a session when the user has 2FA enabled', async () => {
      oauthService.findOrCreateUserFromOAuth.mockResolvedValue({
        id: 'u-1',
        twoFactorEnabled: true,
      } as never)

      await invoke(controller, res as unknown as Response, req)

      // The critical assertions: a verified OAuth identity alone must not mint a session.
      expect(authService.signUser).not.toHaveBeenCalled()
      expect(authService.setCookie).not.toHaveBeenCalled()

      expect(authService.createTemp2FAToken).toHaveBeenCalledWith('u-1')
      expect(res.redirect).toHaveBeenCalledWith(
        `${SITE_URL}/login?oauth_2fa=temp-2fa-jwt&provider=${provider}`,
      )
    })

    it('completes the login normally when the user has no 2FA', async () => {
      oauthService.findOrCreateUserFromOAuth.mockResolvedValue({
        id: 'u-1',
        twoFactorEnabled: false,
      } as never)

      await invoke(controller, res as unknown as Response, req)

      expect(authService.signUser).toHaveBeenCalled()
      expect(authService.setCookie).toHaveBeenCalledWith(res, 'session-jwt')
      expect(authService.createTemp2FAToken).not.toHaveBeenCalled()
      expect(res.redirect).toHaveBeenCalledWith(`${SITE_URL}/auth/oauth-success`)
    })

    it('never sets a cookie when no session token was issued', async () => {
      oauthService.findOrCreateUserFromOAuth.mockResolvedValue({
        id: 'u-1',
        twoFactorEnabled: false,
      } as never)
      authService.signUser.mockResolvedValue({ token: null, user: null } as never)

      await invoke(controller, res as unknown as Response, req)

      expect(authService.setCookie).not.toHaveBeenCalled()
      expect(res.redirect).toHaveBeenCalledWith(
        `${SITE_URL}/auth/oauth-error?provider=${provider}&error=authentication_failed`,
      )
    })

    it('redirects to the error page when the provider reports an error', async () => {
      const call =
        provider === 'google'
          ? controller.googleCallback('', 'access_denied', req, res as unknown as Response)
          : controller.githubCallback('', 'access_denied', req, res as unknown as Response)
      await call

      expect(oauthService.findOrCreateUserFromOAuth).not.toHaveBeenCalled()
      expect(authService.setCookie).not.toHaveBeenCalled()
      expect(res.redirect).toHaveBeenCalledWith(
        `${SITE_URL}/auth/oauth-error?provider=${provider}&error=access_denied`,
      )
    })

    it('redirects to the error page when no authorization code is present', async () => {
      const call =
        provider === 'google'
          ? controller.googleCallback('', '', req, res as unknown as Response)
          : controller.githubCallback('', '', req, res as unknown as Response)
      await call

      expect(authService.setCookie).not.toHaveBeenCalled()
      expect(res.redirect).toHaveBeenCalledWith(
        `${SITE_URL}/auth/oauth-error?provider=${provider}&error=authentication_failed`,
      )
    })
  })
})

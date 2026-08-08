import { ConfigService } from '@nestjs/config'
import { AuthResolver } from './auth.resolver'
import { AuthService } from './auth.service'
import { OAuthService } from './oauth.service'
import { SessionService } from './session.service'
import { OAuthProvider } from './dto'

jest.mock('./oauth.service', () => ({
  OAuthService: class OAuthService {},
}))

describe('AuthResolver', () => {
  let resolver: AuthResolver
  let authService: jest.Mocked<AuthService>
  let oauthService: jest.Mocked<OAuthService>
  let sessionService: jest.Mocked<SessionService>
  let config: jest.Mocked<ConfigService>
  let context: any

  const sessionInfo = { ipAddress: '127.0.0.1', userAgent: 'vitest' }
  const user = { id: 'user-1', isSuperAdmin: false } as any
  const token = { token: 'jwt-token', user } as any

  beforeEach(() => {
    authService = {
      validateUser: jest.fn().mockResolvedValue(user),
      updateMyProfile: jest.fn().mockResolvedValue(user),
      login: jest.fn().mockResolvedValue(token),
      complete2FALogin: jest.fn().mockResolvedValue(token),
      setCookie: jest.fn(),
      clearCookie: jest.fn(),
      getCookieName: jest.fn().mockReturnValue('__session'),
      decodeToken: jest.fn().mockReturnValue({ sessionId: 'session-1' }),
      register: jest.fn().mockResolvedValue(token),
      registerWithInvitation: jest.fn().mockResolvedValue(token),
      forgotPassword: jest.fn().mockResolvedValue(true),
      resetPassword: jest.fn().mockResolvedValue(user),
      resendVerificationEmail: jest.fn().mockResolvedValue(true),
      verifyEmail: jest.fn().mockResolvedValue(user),
      emulateUser: jest.fn().mockResolvedValue(token),
      changeEmail: jest.fn().mockResolvedValue(true),
      verifyEmailChange: jest.fn().mockResolvedValue(user),
      changePassword: jest.fn().mockResolvedValue(true),
      endEmulation: jest.fn().mockResolvedValue(token),
      unlockAccount: jest.fn().mockResolvedValue(user),
      setup2FA: jest.fn().mockResolvedValue({ secret: 'secret', qrCode: 'qr' }),
      enable2FA: jest.fn().mockResolvedValue({ backupCodes: ['one'] }),
      disable2FA: jest.fn().mockResolvedValue(true),
      verify2FALogin: jest.fn().mockResolvedValue(true),
      getUserSessions: jest.fn().mockResolvedValue([{ id: 'session-1' }]),
      invalidateSession: jest.fn().mockResolvedValue(true),
      invalidateAllSessions: jest.fn().mockResolvedValue(2),
      getUserFromToken: jest.fn().mockResolvedValue(user),
      exportUserData: jest.fn().mockResolvedValue({ data: '{}' }),
      deleteUserAccount: jest.fn().mockResolvedValue(true),
      transferOrganizationOwnership: jest.fn().mockResolvedValue(true),
    } as any
    oauthService = {
      linkOAuthAccount: jest.fn().mockResolvedValue(undefined),
      unlinkOAuthAccount: jest.fn().mockResolvedValue(undefined),
    } as any
    sessionService = {
      extractSessionInfo: jest.fn().mockReturnValue(sessionInfo),
      invalidateSession: jest.fn().mockResolvedValue(true),
    } as any
    config = {
      get: jest.fn((key: string) => key === 'oauth.google.enabled'),
    } as any
    context = {
      req: {
        cookies: { __session: 'cookie-token' },
        headers: {},
      },
      res: {},
    }

    resolver = new AuthResolver(authService, oauthService, sessionService, config)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('validates the current user and preserves emulation markers', async () => {
    authService.validateUser.mockResolvedValue({ id: 'user-1', email: 'ada@example.com' } as any)
    const emulatedUser = {
      id: 'user-1',
      isEmulating: true,
      originalAdminId: 'admin-1',
    } as any

    await expect(resolver.me(emulatedUser, {} as any)).resolves.toMatchObject({
      id: 'user-1',
      isEmulating: true,
      originalAdminId: 'admin-1',
    })
    expect(authService.validateUser).toHaveBeenCalledWith('user-1')
  })

  it('logs in with session metadata and skips cookies while 2FA is pending', async () => {
    const pending2FA = { requires2FA: true, tempToken: 'temp-token' } as any
    authService.login.mockResolvedValue(pending2FA)

    await expect(resolver.login(context, { email: 'ADA@EXAMPLE.COM' } as any)).resolves.toBe(
      pending2FA,
    )

    expect(sessionService.extractSessionInfo).toHaveBeenCalledWith(context.req)
    expect(authService.login).toHaveBeenCalledWith({ email: 'ADA@EXAMPLE.COM' }, sessionInfo)
    expect(authService.setCookie).not.toHaveBeenCalled()
  })

  it('sets cookies after login, completed 2FA, registration, invitation registration, and emulation', async () => {
    await expect(resolver.login(context, { email: 'ada@example.com' } as any)).resolves.toBe(token)
    await expect(resolver.complete2FALogin(context, 'temp-token', '123456')).resolves.toBe(token)
    await expect(resolver.register(context, { email: 'ada@example.com' } as any)).resolves.toBe(
      token,
    )
    await expect(
      resolver.registerWithInvitation(context, { invitationToken: 'invite-token' } as any),
    ).resolves.toBe(token)
    await expect(
      resolver.emulateUser(context, { id: 'admin-1' } as any, { userId: 'user-2' } as any),
    ).resolves.toBe(token)

    expect(authService.setCookie).toHaveBeenCalledTimes(5)
    expect(authService.complete2FALogin).toHaveBeenCalledWith('temp-token', '123456', sessionInfo)
    expect(authService.emulateUser).toHaveBeenCalledWith({ userId: 'user-2' }, 'admin-1')
  })

  it('rejects token-creating mutations when the service does not return a token', async () => {
    authService.login.mockResolvedValueOnce({ user } as any)
    await expect(resolver.login(context, {} as any)).rejects.toThrow('Unable to create login token')

    authService.complete2FALogin.mockResolvedValueOnce({ user } as any)
    await expect(resolver.complete2FALogin(context, 'temp', '000000')).rejects.toThrow(
      'Unable to complete 2FA login',
    )

    authService.register.mockResolvedValueOnce({ user } as any)
    await expect(resolver.register(context, {} as any)).rejects.toThrow('Unable to register')
  })

  it('logs out by invalidating the session from a cookie or bearer token and always clears cookies', async () => {
    await expect(resolver.logout(context)).resolves.toBe(true)

    context.req.cookies = {}
    context.req.headers.authorization = 'Bearer header-token'
    await expect(resolver.logout(context)).resolves.toBe(true)

    expect(authService.decodeToken).toHaveBeenNthCalledWith(1, 'cookie-token')
    expect(authService.decodeToken).toHaveBeenNthCalledWith(2, 'header-token')
    expect(sessionService.invalidateSession).toHaveBeenCalledTimes(2)
    expect(authService.clearCookie).toHaveBeenCalledTimes(2)
  })

  it('normalizes password recovery inputs and delegates account mutations with session data', async () => {
    await resolver.forgotPassword(context, { email: ' ADA@EXAMPLE.COM ' } as any)
    await resolver.resetPassword(context, { password: 'new-secret', token: 'reset-token' } as any)
    await resolver.changeEmail(context, user, { newEmail: 'new@example.com' } as any)
    await resolver.changePassword(context, user, { currentPassword: 'old' } as any)

    expect(authService.forgotPassword).toHaveBeenCalledWith(
      'ada@example.com',
      sessionInfo,
      undefined,
    )
    expect(authService.resetPassword).toHaveBeenCalledWith('new-secret', 'reset-token', sessionInfo)
    expect(authService.changeEmail).toHaveBeenCalledWith('user-1', 'new@example.com', sessionInfo)
    expect(authService.changePassword).toHaveBeenCalledWith(
      'user-1',
      { currentPassword: 'old' },
      sessionInfo,
      'session-1',
    )
  })

  it('updates only the authenticated user profile', async () => {
    const input = { firstName: 'Ada', lastName: 'Lovelace', displayName: 'ada.lovelace' }

    await expect(resolver.updateMyProfile(user, input)).resolves.toBe(user)

    expect(authService.updateMyProfile).toHaveBeenCalledWith('user-1', input)
  })

  it('ends emulation only for emulated sessions with a cookie token', async () => {
    await expect(
      resolver.endEmulation(
        { id: 'user-1', isEmulating: true, originalAdminId: 'admin-1' } as any,
        context,
      ),
    ).resolves.toBe(token)

    await expect(resolver.endEmulation(user, context)).rejects.toThrow(
      'Not currently emulating a user',
    )

    context.req.cookies = {}
    await expect(
      resolver.endEmulation(
        { id: 'user-1', isEmulating: true, originalAdminId: 'admin-1' } as any,
        context,
      ),
    ).rejects.toThrow('No authentication token found')

    expect(authService.endEmulation).toHaveBeenCalledWith('cookie-token')
  })

  it('restricts account unlocks to super admins', async () => {
    await expect(resolver.unlockAccount(context, user, 'locked-user')).rejects.toThrow(
      'Only super admins can unlock accounts',
    )

    await expect(
      resolver.unlockAccount(context, { id: 'admin-1', isSuperAdmin: true } as any, 'locked-user'),
    ).resolves.toBe(user)
    expect(authService.unlockAccount).toHaveBeenCalledWith('locked-user', sessionInfo)
  })

  it('delegates 2FA and OAuth account workflows', async () => {
    await resolver.setup2FA(user)
    await resolver.enable2FA(context, user, { code: '123456' } as any)
    await resolver.disable2FA(context, user, { code: '654321' } as any)
    await resolver.verify2FACode(user, { code: '111111' } as any)
    await resolver.linkOAuthAccount(user, { provider: OAuthProvider.GOOGLE, token: 'oauth-token' })
    await resolver.unlinkOAuthAccount(user, { provider: OAuthProvider.GITHUB })

    expect(authService.setup2FA).toHaveBeenCalledWith('user-1')
    expect(authService.enable2FA).toHaveBeenCalledWith('user-1', '123456', sessionInfo)
    expect(authService.disable2FA).toHaveBeenCalledWith('user-1', { code: '654321' }, sessionInfo)
    expect(authService.verify2FALogin).toHaveBeenCalledWith('user-1', '111111')
    expect(oauthService.linkOAuthAccount).toHaveBeenCalledWith(
      'user-1',
      OAuthProvider.GOOGLE,
      'oauth-token',
    )
    expect(oauthService.unlinkOAuthAccount).toHaveBeenCalledWith('user-1', OAuthProvider.GITHUB)
  })

  it('reports enabled OAuth providers from configuration', () => {
    expect(resolver.availableOAuthProviders()).toEqual([
      { provider: OAuthProvider.GOOGLE, enabled: true, name: 'Google' },
    ])
    expect(config.get).toHaveBeenCalledWith('oauth.google.enabled')
    expect(config.get).toHaveBeenCalledWith('oauth.github.enabled')
  })

  it('uses the current session when listing or invalidating sessions', async () => {
    await expect(resolver.getUserSessions(context, user)).resolves.toEqual([{ id: 'session-1' }])
    await expect(
      resolver.changePassword(context, user, {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      }),
    ).resolves.toBe(true)
    await expect(resolver.invalidateSession(user, 'session-2')).resolves.toBe(true)
    await expect(resolver.invalidateAllSessions(context, user)).resolves.toBe(2)

    expect(authService.getUserSessions).toHaveBeenCalledWith('user-1', 'session-1')
    expect(authService.changePassword).toHaveBeenCalledWith(
      'user-1',
      {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      },
      sessionInfo,
      'session-1',
    )
    expect(authService.invalidateSession).toHaveBeenCalledWith('user-1', 'session-2')
    expect(authService.invalidateAllSessions).toHaveBeenCalledWith('user-1', 'session-1')
  })

  it('resolves auth token users and protects incomplete tokens', async () => {
    expect(resolver.user({ requires2FA: true } as any)).toBeNull()
    expect(() => resolver.user({} as any)).toThrow('No AuthToken for resolved user')
    await expect(resolver.user({ token: 'jwt-token' } as any)).resolves.toBe(user)

    expect(authService.getUserFromToken).toHaveBeenCalledWith('jwt-token')
  })

  it('delegates verification and data ownership operations', async () => {
    await resolver.resendVerificationEmail('ada@example.com')
    await resolver.verifyEmail({ token: 'verify-token' } as any)
    await resolver.verifyEmailChange('change-token')
    await resolver.exportUserData(user)
    await resolver.deleteUserAccount(user)
    await resolver.transferOrganizationOwnership(user, {
      organizationId: 'org-1',
      newOwnerUserId: 'user-2',
    } as any)

    expect(authService.resendVerificationEmail).toHaveBeenCalledWith('ada@example.com', undefined)
    expect(authService.verifyEmail).toHaveBeenCalledWith('verify-token')
    expect(authService.verifyEmailChange).toHaveBeenCalledWith('change-token')
    expect(authService.exportUserData).toHaveBeenCalledWith('user-1')
    expect(authService.deleteUserAccount).toHaveBeenCalledWith('user-1')
    expect(authService.transferOrganizationOwnership).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      'user-2',
    )
  })
})

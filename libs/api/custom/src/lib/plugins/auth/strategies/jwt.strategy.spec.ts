import { JwtStrategy } from './jwt.strategy'
import type { Request } from 'express'

function jwtWithIssuedAt(iat: number): string {
  const payload = Buffer.from(JSON.stringify({ iat })).toString('base64url')
  return `header.${payload}.signature`
}

function extractJwt(strategy: JwtStrategy, request: Request): string | null {
  return (
    strategy as unknown as {
      _jwtFromRequest: (request: Request) => string | null
    }
  )._jwtFromRequest(request)
}

describe('JwtStrategy API token authentication', () => {
  const token = 'a'.repeat(64)
  let auth: { validateUser: jest.Mock }
  let apiTokensService: { validateApiToken: jest.Mock }
  let strategy: JwtStrategy

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    auth = { validateUser: jest.fn() }
    apiTokensService = { validateApiToken: jest.fn() }
    strategy = new JwtStrategy(auth as never, apiTokensService as never)
    ;(strategy as any).success = jest.fn()
    ;(strategy as any).fail = jest.fn()
  })

  it('authenticates opaque API tokens before JWT parsing', async () => {
    const user = { id: 'user-1' }
    const req = { headers: { authorization: `Bearer ${token}` } } as any

    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: 'org-1',
    })
    auth.validateUser.mockResolvedValue(user)

    await strategy.authenticate(req)

    expect(apiTokensService.validateApiToken).toHaveBeenCalledWith(token)
    expect(auth.validateUser).toHaveBeenCalledWith('user-1')
    expect(req.apiTokenId).toBe('api-token-1')
    expect(req.apiTokenOrganizationId).toBe('org-1')
    expect((strategy as any).success).toHaveBeenCalledWith(user)
  })

  it('fails invalid API tokens without trying user lookup', async () => {
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    apiTokensService.validateApiToken.mockResolvedValue(null)

    await strategy.authenticate(req)

    expect(auth.validateUser).not.toHaveBeenCalled()
    expect((strategy as any).fail).toHaveBeenCalledWith(
      { message: 'Invalid or expired API token' },
      401,
    )
  })

  // An organization-scoped token is a restriction below the user's own access. The user really is
  // a member of the organization they are asking for, so every membership check downstream passes
  // — the binding has to happen here or not at all.
  it('accepts a scoped token whose request asks for the same organization', async () => {
    const user = { id: 'user-1' }
    const req = {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': 'org-1' },
    } as any

    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: 'org-1',
    })
    auth.validateUser.mockResolvedValue(user)

    await strategy.authenticate(req)

    expect((strategy as any).success).toHaveBeenCalledWith(user)
    expect(req.headers['x-organization-id']).toBe('org-1')
  })

  it('rejects a scoped token used against a different organization, before any user lookup', async () => {
    const req = {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': 'org-2' },
    } as any

    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: 'org-1',
    })

    await strategy.authenticate(req)

    expect(auth.validateUser).not.toHaveBeenCalled()
    expect((strategy as any).success).not.toHaveBeenCalled()
    expect((strategy as any).fail).toHaveBeenCalledWith(
      { message: 'API token is not scoped to the requested organization' },
      403,
    )
  })

  it('rejects a mismatch even when the header arrives as an array', async () => {
    const req = {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': ['org-2', 'org-1'] },
    } as any

    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: 'org-1',
    })

    await strategy.authenticate(req)

    expect((strategy as any).fail).toHaveBeenCalledWith(
      { message: 'API token is not scoped to the requested organization' },
      403,
    )
  })

  it('collapses a repeated matching header to a single value', async () => {
    const user = { id: 'user-1' }
    const req = {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': ['org-1', 'org-1'] },
    } as any

    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: 'org-1',
    })
    auth.validateUser.mockResolvedValue(user)

    await strategy.authenticate(req)

    // A consumer reading the header naively must not receive an array.
    expect(req.headers['x-organization-id']).toBe('org-1')
    expect((strategy as any).success).toHaveBeenCalledWith(user)
  })

  it("defaults an absent header to the token's organization rather than the user's active one", async () => {
    const user = { id: 'user-1', activeOrganizationId: 'org-9' }
    const req = { headers: { authorization: `Bearer ${token}` } } as any

    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: 'org-1',
    })
    auth.validateUser.mockResolvedValue(user)

    await strategy.authenticate(req)

    expect(req.headers['x-organization-id']).toBe('org-1')
    expect((strategy as any).success).toHaveBeenCalledWith(user)
  })

  it('leaves the header alone for an unscoped token', async () => {
    const user = { id: 'user-1' }
    const req = {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': 'org-7' },
    } as any

    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: null,
    })
    auth.validateUser.mockResolvedValue(user)

    await strategy.authenticate(req)

    expect(req.headers['x-organization-id']).toBe('org-7')
    expect(req.apiTokenOrganizationId).toBeNull()
    expect((strategy as any).success).toHaveBeenCalledWith(user)
  })

  it('chooses the newest JWT when domain and host-only cookies coexist', () => {
    const older = jwtWithIssuedAt(1)
    const newer = jwtWithIssuedAt(2)
    const req = {
      cookies: { __session: older },
      headers: { cookie: `__session=${older}; theme=dark; __session=${newer}` },
    } as Request

    expect(extractJwt(strategy, req)).toBe(newer)
  })

  it('prefers the last duplicate JWT when both were issued in the same second', () => {
    const first = jwtWithIssuedAt(1)
    const second = `${jwtWithIssuedAt(1)}-newer-signature`
    const req = {
      headers: { cookie: `__session=${first}; __session=${second}` },
    } as Request

    expect(extractJwt(strategy, req)).toBe(second)
  })

  it('falls back to the parsed cookie when the raw cookie header is unavailable', () => {
    const tokenFromCookieParser = jwtWithIssuedAt(1)
    const req = { cookies: { __session: tokenFromCookieParser }, headers: {} } as Request

    expect(extractJwt(strategy, req)).toBe(tokenFromCookieParser)
  })
})

describe('JwtStrategy session token validation', () => {
  let auth: { validateUser: jest.Mock; isTokenCurrent: jest.Mock }
  let strategy: JwtStrategy
  const req = { headers: {} } as Request

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    auth = {
      validateUser: jest.fn().mockResolvedValue({ id: 'user-1', authGeneration: 1 }),
      isTokenCurrent: jest.fn().mockResolvedValue(true),
    }
    strategy = new JwtStrategy(auth as never, { validateApiToken: jest.fn() } as never)
  })

  it('accepts a token whose claims are current', async () => {
    const payload = { userId: 'user-1', sessionId: 'session-1', authGeneration: 1 }

    await expect(strategy.validate(req, payload)).resolves.toEqual({
      id: 'user-1',
      authGeneration: 1,
    })
    expect(auth.isTokenCurrent).toHaveBeenCalledWith(payload, {
      id: 'user-1',
      authGeneration: 1,
    })
  })

  it('refuses a token issued under an earlier auth generation', async () => {
    auth.isTokenCurrent.mockResolvedValue(false)

    await expect(
      strategy.validate(req, { userId: 'user-1', sessionId: 'session-1', authGeneration: 0 }),
    ).rejects.toThrow('Session has been invalidated.')
  })

  it('refuses a token whose user no longer exists, before any other check', async () => {
    auth.validateUser.mockResolvedValue(null)

    await expect(strategy.validate(req, { userId: 'user-1' })).rejects.toThrow(
      'User from token not found or invalid.',
    )
    expect(auth.isTokenCurrent).not.toHaveBeenCalled()
  })

  it('attaches emulation metadata only after the token is found current', async () => {
    const payload = {
      userId: 'user-1',
      sessionId: 'emulation-session',
      isEmulating: true,
      originalAdminId: 'admin-1',
      adminAuthGeneration: 0,
    }

    await expect(strategy.validate(req, payload)).resolves.toMatchObject({
      id: 'user-1',
      isEmulating: true,
      originalAdminId: 'admin-1',
    })

    auth.isTokenCurrent.mockResolvedValue(false)
    await expect(strategy.validate(req, payload)).rejects.toThrow('Session has been invalidated.')
  })
})

describe('JwtStrategy inactive accounts', () => {
  let auth: { validateUser: jest.Mock; isTokenCurrent: jest.Mock }
  let apiTokensService: { validateApiToken: jest.Mock }
  let strategy: JwtStrategy

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    auth = {
      validateUser: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', authGeneration: 0, isActive: false }),
      isTokenCurrent: jest.fn().mockResolvedValue(true),
    }
    apiTokensService = { validateApiToken: jest.fn() }
    strategy = new JwtStrategy(auth as never, apiTokensService as never)
    ;(strategy as any).success = jest.fn()
    ;(strategy as any).fail = jest.fn()
  })

  it('refuses a session token whose user is inactive', async () => {
    await expect(
      strategy.validate({ headers: {} } as Request, { userId: 'user-1', sessionId: 'session-1' }),
    ).rejects.toThrow('User from token not found or invalid.')
  })

  it('refuses an API token whose user is inactive', async () => {
    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: null,
    })

    await strategy.authenticate({ headers: { authorization: `Bearer ${'a'.repeat(64)}` } } as any)

    expect((strategy as any).success).not.toHaveBeenCalled()
    expect((strategy as any).fail).toHaveBeenCalledWith(
      { message: 'User not found for API token' },
      401,
    )
  })
})

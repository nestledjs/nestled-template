import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
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
  let apiTokensService: { validateApiToken: jest.Mock; recordTokenUse: jest.Mock }
  let strategy: JwtStrategy

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    auth = { validateUser: jest.fn() }
    apiTokensService = { validateApiToken: jest.fn(), recordTokenUse: jest.fn() }
    strategy = new JwtStrategy(auth as never, apiTokensService as never)
    ;(strategy as any).success = jest.fn()
    ;(strategy as any).fail = jest.fn()
    ;(strategy as any).error = jest.fn()
  })

  // A refusal of a valid token goes to passport's `error` as a 403 with a code; `fail` would reach
  // the client as a 401 whatever status it carried (see jwt.strategy.guard.spec.ts).
  const forbiddenCode = () => {
    expect((strategy as any).fail).not.toHaveBeenCalled()
    const error = (strategy as any).error.mock.calls[0]?.[0] as ForbiddenException
    expect(error).toBeInstanceOf(ForbiddenException)
    return (error.getResponse() as { code?: string }).code
  }

  it('authenticate returns nothing and passes an unexpected rejection to error', async () => {
    const failure = new Error('unexpected')
    jest.spyOn(strategy, 'authenticateAsync').mockRejectedValue(failure)

    const returned = strategy.authenticate({ headers: {} } as any)
    await new Promise(resolve => setImmediate(resolve))

    expect(returned).toBeUndefined()
    expect((strategy as any).error).toHaveBeenCalledWith(failure)
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

    await strategy.authenticateAsync(req)

    expect(apiTokensService.validateApiToken).toHaveBeenCalledWith(token)
    expect(auth.validateUser).toHaveBeenCalledWith('user-1')
    expect(req.apiTokenId).toBe('api-token-1')
    expect(req.apiTokenOrganizationId).toBe('org-1')
    expect((strategy as any).success).toHaveBeenCalledWith(user)
    expect(apiTokensService.recordTokenUse).toHaveBeenCalledWith('api-token-1')
  })

  it('fails invalid API tokens without trying user lookup', async () => {
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    apiTokensService.validateApiToken.mockResolvedValue(null)

    await strategy.authenticateAsync(req)

    expect(auth.validateUser).not.toHaveBeenCalled()
    expect((strategy as any).fail).toHaveBeenCalledWith(
      { message: 'Invalid or expired API token' },
      401,
    )
  })

  // RFC 8707: a token the MCP OAuth endpoint issued is bound to the MCP endpoint and is refused by
  // the rest of the API. Tokens without a binding (settings tokens, older MCP tokens) still work.
  it('refuses a token bound to a resource, before any user lookup', async () => {
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: null,
      resource: 'https://api.example.com/api/mcp',
    })

    await strategy.authenticateAsync(req)

    expect(auth.validateUser).not.toHaveBeenCalled()
    expect((strategy as any).success).not.toHaveBeenCalled()
    expect(forbiddenCode()).toBe('API_TOKEN_RESOURCE_MISMATCH')
    // Refused here (GraphQL and the rest of the API), so not counted as use of the token.
    expect(apiTokensService.recordTokenUse).not.toHaveBeenCalled()
  })

  it('still accepts an unbound token (resource null)', async () => {
    const user = { id: 'user-1' }
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: null,
      resource: null,
    })
    auth.validateUser.mockResolvedValue(user)

    await strategy.authenticateAsync(req)

    expect((strategy as any).success).toHaveBeenCalledWith(user)
    expect(apiTokensService.recordTokenUse).toHaveBeenCalledWith('api-token-1')
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

    await strategy.authenticateAsync(req)

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

    await strategy.authenticateAsync(req)

    expect(auth.validateUser).not.toHaveBeenCalled()
    expect((strategy as any).success).not.toHaveBeenCalled()
    expect(forbiddenCode()).toBe('API_TOKEN_ORGANIZATION_MISMATCH')
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

    await strategy.authenticateAsync(req)

    expect(forbiddenCode()).toBe('API_TOKEN_ORGANIZATION_MISMATCH')
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

    await strategy.authenticateAsync(req)

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

    await strategy.authenticateAsync(req)

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

    await strategy.authenticateAsync(req)

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

  it.each([
    ['comes first', (valid: string, forged: string) => `__session=${forged}; __session=${valid}`],
    ['comes last', (valid: string, forged: string) => `__session=${valid}; __session=${forged}`],
  ])(
    'uses the older valid session over a newer cookie that does not verify (forged %s)',
    (_label, header) => {
      // Signed with the strategy's secret, issued an hour ago.
      const valid = new JwtService({ secret: 'test-secret' }).sign(
        { userId: 'user-1' },
        { expiresIn: '1d' },
      )
      // Planted from a sibling subdomain: a far-future iat, signed with a secret the API does not
      // hold. Ordering by the unverified iat alone would pick it.
      const forged = new JwtService({ secret: 'attacker-secret' }).sign({
        userId: 'user-2',
        iat: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600,
      })
      const req = { headers: { cookie: header(valid, forged) } } as unknown as Request

      expect(extractJwt(strategy, req)).toBe(valid)
    },
  )

  it('prefers the newest of two valid sessions', () => {
    const jwt = new JwtService({ secret: 'test-secret' })
    const now = Math.floor(Date.now() / 1000)
    const older = jwt.sign({ userId: 'user-1', iat: now - 60 }, { expiresIn: '1d' })
    const newer = jwt.sign({ userId: 'user-1', iat: now - 10 }, { expiresIn: '1d' })
    const req = {
      headers: { cookie: `__session=${newer}; __session=${older}` },
    } as unknown as Request

    expect(extractJwt(strategy, req)).toBe(newer)
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
  let apiTokensService: { validateApiToken: jest.Mock; recordTokenUse: jest.Mock }
  let strategy: JwtStrategy

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    auth = {
      validateUser: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', authGeneration: 0, isActive: false }),
      isTokenCurrent: jest.fn().mockResolvedValue(true),
    }
    apiTokensService = { validateApiToken: jest.fn(), recordTokenUse: jest.fn() }
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

    await strategy.authenticateAsync({
      headers: { authorization: `Bearer ${'a'.repeat(64)}` },
    } as any)

    expect((strategy as any).success).not.toHaveBeenCalled()
    expect((strategy as any).fail).toHaveBeenCalledWith(
      { message: 'User not found for API token' },
      401,
    )
    expect(apiTokensService.recordTokenUse).not.toHaveBeenCalled()
  })
})

// A failed lookup is not a bad token. Clients drop the token (or the session) on a 401, so an
// internal failure must surface as a 503, which they treat as outage evidence. Passport hands
// `error(err)` to AuthGuard, which throws `err`; `fail(challenge, 401)` becomes a 401.
describe('JwtStrategy API token internal failures', () => {
  const token = 'b'.repeat(64)
  const req = () => ({ headers: { authorization: `Bearer ${token}` } }) as never
  let auth: { validateUser: jest.Mock; isTokenCurrent: jest.Mock }
  let apiTokensService: { validateApiToken: jest.Mock; recordTokenUse: jest.Mock }
  let strategy: JwtStrategy
  let outcome: { success: jest.Mock; fail: jest.Mock; error: jest.Mock }

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    auth = {
      validateUser: jest.fn().mockResolvedValue({ id: 'user-1', authGeneration: 1 }),
      isTokenCurrent: jest.fn().mockResolvedValue(true),
    }
    apiTokensService = { validateApiToken: jest.fn(), recordTokenUse: jest.fn() }
    strategy = new JwtStrategy(auth as never, apiTokensService as never)
    outcome = { success: jest.fn(), fail: jest.fn(), error: jest.fn() }
    Object.assign(strategy, outcome)
  })

  const passedError = () => outcome.error.mock.calls[0]?.[0] as unknown

  it('answers a failed token lookup with a 503, not a 401', async () => {
    apiTokensService.validateApiToken.mockRejectedValue(new Error('database unavailable'))

    await strategy.authenticateAsync(req())

    expect(outcome.fail).not.toHaveBeenCalled()
    expect(passedError()).toBeInstanceOf(ServiceUnavailableException)
    expect((passedError() as ServiceUnavailableException).getStatus()).toBe(503)
    expect(passedError()).not.toBeInstanceOf(UnauthorizedException)
  })

  it("answers a failed lookup of the token's user with a 503, not a 401", async () => {
    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: null,
    })
    auth.validateUser.mockRejectedValue(new Error('connection terminated'))

    await strategy.authenticateAsync(req())

    expect(outcome.fail).not.toHaveBeenCalled()
    expect(outcome.success).not.toHaveBeenCalled()
    expect(passedError()).toBeInstanceOf(ServiceUnavailableException)
    expect(apiTokensService.recordTokenUse).not.toHaveBeenCalled()
  })

  it('still answers a genuinely invalid, expired or revoked token with a 401', async () => {
    apiTokensService.validateApiToken.mockResolvedValue(null)

    await strategy.authenticateAsync(req())

    expect(outcome.error).not.toHaveBeenCalled()
    expect(outcome.fail).toHaveBeenCalledWith({ message: 'Invalid or expired API token' }, 401)
  })

  // Session JWTs: validate() does not catch, so a failed lookup reaches passport as an error (a
  // 500), never as the UnauthorizedException a dead session gets.
  it('lets a failed session lookup through as an error, not an UnauthorizedException', async () => {
    auth.validateUser.mockRejectedValue(new Error('database unavailable'))

    const failure = strategy.validate({ headers: {} } as Request, { userId: 'user-1' })

    await expect(failure).rejects.toThrow('database unavailable')
    await expect(failure).rejects.not.toBeInstanceOf(UnauthorizedException)
  })
})

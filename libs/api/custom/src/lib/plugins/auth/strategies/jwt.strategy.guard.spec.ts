import { ExecutionContext, ForbiddenException, HttpException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { GqlAuthGuard } from '@nestled-template/api/utils'
import { JwtStrategy } from './jwt.strategy'

/**
 * The API-token refusals as a client sees them: through passport and the real `AuthGuard('jwt')`,
 * not the strategy's `fail` mock. AuthGuard turns every `fail(…)` into an UnauthorizedException
 * whatever status it carries, so a refusal of a valid token must reach it as an error to stay 403.
 */
describe('JwtStrategy API-token refusals through AuthGuard', () => {
  const token = 'b'.repeat(64)
  let apiTokensService: { validateApiToken: jest.Mock; recordTokenUse: jest.Mock }
  let auth: { validateUser: jest.Mock }

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    auth = { validateUser: jest.fn().mockResolvedValue({ id: 'user-1' }) }
    apiTokensService = { validateApiToken: jest.fn(), recordTokenUse: jest.fn() }
    // Registers itself with passport as 'jwt', which AuthGuard('jwt') looks up.
    new JwtStrategy(auth as never, apiTokensService as never)
  })

  function httpContext(headers: Record<string, string>): ExecutionContext {
    const req = { headers: { authorization: `Bearer ${token}`, ...headers } }
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    } as unknown as ExecutionContext
  }

  async function refusal(headers: Record<string, string> = {}): Promise<HttpException> {
    const guard = new GqlAuthGuard()
    try {
      await guard.canActivate(httpContext(headers))
    } catch (error) {
      return error as HttpException
    }
    throw new Error('expected the guard to refuse')
  }

  it('answers a scoped token sent with another organization header with a 403 and a code', async () => {
    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: 'org-1',
      resource: null,
    })

    const error = await refusal({ 'x-organization-id': 'org-2' })

    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getStatus()).toBe(403)
    expect(error.getResponse()).toMatchObject({ code: 'API_TOKEN_ORGANIZATION_MISMATCH' })
    expect(auth.validateUser).not.toHaveBeenCalled()
  })

  it('answers a token bound to another resource with a 403 and a code', async () => {
    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: null,
      resource: 'https://api.example.com/api/mcp',
    })

    const error = await refusal()

    expect(error.getStatus()).toBe(403)
    expect(error.getResponse()).toMatchObject({ code: 'API_TOKEN_RESOURCE_MISMATCH' })
    expect(apiTokensService.recordTokenUse).not.toHaveBeenCalled()
  })

  it('still answers an unknown token with a 401', async () => {
    apiTokensService.validateApiToken.mockResolvedValue(null)

    expect((await refusal()).getStatus()).toBe(401)
  })

  it('still answers a token whose owner is gone with a 401', async () => {
    apiTokensService.validateApiToken.mockResolvedValue({
      userId: 'user-1',
      tokenId: 'api-token-1',
      organizationId: null,
      resource: null,
    })
    auth.validateUser.mockResolvedValue(null)

    expect((await refusal()).getStatus()).toBe(401)
  })

  it('answers a failed lookup with a 503', async () => {
    apiTokensService.validateApiToken.mockRejectedValue(new Error('database unavailable'))

    expect((await refusal()).getStatus()).toBe(503)
  })
})

/**
 * What the web server sends when a browser holds several session cookies: all of them in one Cookie
 * header and no bearer token. Through passport and the real `AuthGuard('jwt')`.
 */
describe('JwtStrategy with several session cookies, through AuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret' })
  const now = Math.floor(Date.now() / 1000)
  const COOKIE_NAME_KEYS = ['VITE_COOKIE_NAME', 'API_COOKIE_NAME']
  let savedNames: Array<string | undefined>
  let auth: { validateUser: jest.Mock; isTokenCurrent: jest.Mock }

  const signed = (userId: string, iat: number) => jwt.sign({ userId, iat }, { expiresIn: 3600 })
  const unverified = (userId: string, iat: number) =>
    new JwtService({ secret: 'another-secret' }).sign({ userId, iat }, { expiresIn: 3600 })

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    savedNames = COOKIE_NAME_KEYS.map(key => process.env[key])
    COOKIE_NAME_KEYS.forEach(key => delete process.env[key])
    auth = {
      validateUser: jest.fn(async (id: string) => ({ id })),
      isTokenCurrent: jest.fn().mockReturnValue(true),
    }
    new JwtStrategy(
      auth as never,
      { validateApiToken: jest.fn().mockResolvedValue(null), recordTokenUse: jest.fn() } as never,
    )
  })

  afterEach(() => {
    COOKIE_NAME_KEYS.forEach((key, index) => {
      const value = savedNames[index]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  })

  async function userFor(headers: Record<string, string>): Promise<string | undefined> {
    const req: { headers: Record<string, string>; user?: { id: string } } = { headers }
    await new GqlAuthGuard().canActivate({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    } as unknown as ExecutionContext)
    return req.user?.id
  }

  const cookies = (...tokens: string[]) => ({
    cookie: tokens.map(token => `__session=${token}`).join('; '),
  })

  it.each([
    ['first', [unverified('user-x', now), signed('user-1', now - 60)]],
    ['last', [signed('user-1', now - 60), unverified('user-x', now)]],
  ])(
    'a newer cookie that does not verify (%s) does not hide the one that does',
    async (_w, tokens) => {
      await expect(userFor(cookies(...tokens))).resolves.toBe('user-1')
    },
  )

  it('as a bearer token, that newer cookie is refused: why the web server sends none', async () => {
    const error = await userFor({
      authorization: `Bearer ${unverified('user-x', now)}`,
      ...cookies(signed('user-1', now - 60)),
    }).catch((thrown: HttpException) => thrown.getStatus())
    expect(error).toBe(401)
  })

  it('reads the cookie the API sets, whatever API_COOKIE_NAME says', async () => {
    process.env['API_COOKIE_NAME'] = 'another'
    await expect(userFor(cookies(signed('user-1', now)))).resolves.toBe('user-1')

    process.env['VITE_COOKIE_NAME'] = 'app'
    await expect(userFor({ cookie: `app=${signed('user-2', now)}` })).resolves.toBe('user-2')
  })

  it('takes the newest of several that verify', async () => {
    await expect(
      userFor(cookies(signed('user-old', now - 60), signed('user-new', now))),
    ).resolves.toBe('user-new')
  })

  it('refuses when none verifies', async () => {
    const error = await userFor(cookies(unverified('a', now), unverified('b', now - 1))).catch(
      (thrown: HttpException) => thrown.getStatus(),
    )
    expect(error).toBe(401)
  })
})

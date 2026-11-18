import { ExecutionContext, ForbiddenException, HttpException } from '@nestjs/common'
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

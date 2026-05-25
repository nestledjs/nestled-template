import { JwtStrategy } from './jwt.strategy'

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
})

import { ApiTokenAuthMiddleware } from './api-token-auth.middleware'

// The middleware runs in front of McpController (apps/api/src/app.module.ts) and is what turns an
// MCP bearer token — an API token, including one issued by the MCP OAuth token endpoint — into
// `req.user`. These tests pin that behaviour, which the MCP v2 migration leaves unchanged.
describe('ApiTokenAuthMiddleware', () => {
  const token = 'a1'.repeat(32)
  const user = { id: 'user-123', organizations: [] }
  let apiTokensService: { validateApiToken: jest.Mock; recordTokenUse: jest.Mock }
  let data: { user: { findUnique: jest.Mock } }
  let middleware: ApiTokenAuthMiddleware

  const run = async (authorization?: string, host = 'api.example.com') => {
    const req: any = {
      headers: authorization ? { authorization } : {},
      protocol: 'https',
      get: (name: string) => (name === 'host' ? host : undefined),
    }
    const next = jest.fn()
    await middleware.use(req, {} as any, next)
    return { req, next }
  }

  beforeEach(() => {
    apiTokensService = {
      validateApiToken: jest.fn().mockResolvedValue({
        tokenId: 'token-1',
        userId: 'user-123',
        organizationId: 'org-123',
      }),
      recordTokenUse: jest.fn(),
    }
    data = { user: { findUnique: jest.fn().mockResolvedValue(user) } }
    middleware = new ApiTokenAuthMiddleware(apiTokensService as any, data as any)
  })

  it('attaches the token user and its organization scope for a valid token', async () => {
    const { req, next } = await run(`Bearer ${token}`)

    expect(apiTokensService.validateApiToken).toHaveBeenCalledWith(token)
    expect(data.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-123' } }),
    )
    expect(req.user).toBe(user)
    expect(req.apiTokenId).toBe('token-1')
    expect(req.apiTokenOrganizationId).toBe('org-123')
    expect(next).toHaveBeenCalledTimes(1)
    expect(apiTokensService.recordTokenUse).toHaveBeenCalledWith('token-1')
  })

  it('keeps an unscoped token unscoped', async () => {
    apiTokensService.validateApiToken.mockResolvedValue({
      tokenId: 'token-2',
      userId: 'user-123',
      organizationId: null,
    })

    const { req } = await run(`Bearer ${token}`)

    expect(req.user).toBe(user)
    expect(req.apiTokenOrganizationId).toBeNull()
  })

  it.each([
    ['no Authorization header', undefined],
    ['a non-bearer scheme', `Basic ${token}`],
    ['a token that is not an API token', 'Bearer not-a-64-character-hex-api-token'],
  ])('leaves the request unauthenticated for %s', async (_label, authorization) => {
    const { req, next } = await run(authorization)

    expect(apiTokensService.validateApiToken).not.toHaveBeenCalled()
    expect(req.user).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('leaves the request unauthenticated for an unknown, revoked or expired token', async () => {
    apiTokensService.validateApiToken.mockResolvedValue(null)

    const { req, next } = await run(`Bearer ${token}`)

    expect(req.user).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('leaves the request unauthenticated when the token user no longer exists', async () => {
    data.user.findUnique.mockResolvedValue(null)

    const { req } = await run(`Bearer ${token}`)

    expect(req.user).toBeUndefined()
    expect(req.apiTokenOrganizationId).toBeUndefined()
    expect(apiTokensService.recordTokenUse).not.toHaveBeenCalled()
  })

  it("refuses a deactivated user's token, as JwtStrategy does, and does not record its use", async () => {
    data.user.findUnique.mockResolvedValue({ ...user, isActive: false })

    const { req, next } = await run(`Bearer ${token}`)

    expect(req.user).toBeUndefined()
    expect(req.apiTokenId).toBeUndefined()
    expect(req.apiTokenOrganizationId).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
    expect(apiTokensService.recordTokenUse).not.toHaveBeenCalled()
  })

  it('accepts an active user explicitly marked active', async () => {
    const active = { ...user, isActive: true }
    data.user.findUnique.mockResolvedValue(active)

    const { req } = await run(`Bearer ${token}`)

    expect(req.user).toBe(active)
    expect(apiTokensService.recordTokenUse).toHaveBeenCalledWith('token-1')
  })

  describe('resource binding (RFC 8707)', () => {
    const bound = (resource: string) => ({
      tokenId: 'token-3',
      userId: 'user-123',
      organizationId: 'org-123',
      resource,
    })

    it('accepts a token bound to the MCP endpoint this request reached', async () => {
      apiTokensService.validateApiToken.mockResolvedValue(bound('https://api.example.com/api/mcp'))

      const { req } = await run(`Bearer ${token}`)

      expect(req.user).toBe(user)
      expect(apiTokensService.recordTokenUse).toHaveBeenCalledWith('token-3')
    })

    it('compares the binding in canonical form', async () => {
      apiTokensService.validateApiToken.mockResolvedValue(bound('https://API.example.com/api/mcp/'))

      const { req } = await run(`Bearer ${token}`)

      expect(req.user).toBe(user)
    })

    it.each([
      ['another host', 'https://other.example.com/api/mcp', 'api.example.com'],
      ['another resource on this host', 'https://api.example.com/api/other', 'api.example.com'],
      [
        'this resource reached through another host',
        'https://api.example.com/api/mcp',
        'alias.example.com',
      ],
    ])('refuses a token bound to %s', async (_label, resource, host) => {
      apiTokensService.validateApiToken.mockResolvedValue(bound(resource))

      const { req, next } = await run(`Bearer ${token}`, host)

      expect(req.user).toBeUndefined()
      expect(data.user.findUnique).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledTimes(1)
      // Refused here, so not counted as use of the token.
      expect(apiTokensService.recordTokenUse).not.toHaveBeenCalled()
    })

    it('still accepts a token issued before binding existed (resource null)', async () => {
      apiTokensService.validateApiToken.mockResolvedValue({ ...bound(''), resource: null })

      const { req } = await run(`Bearer ${token}`)

      expect(req.user).toBe(user)
    })
  })

  it('fails closed when validation throws', async () => {
    apiTokensService.validateApiToken.mockRejectedValue(new Error('database down'))

    const { req, next } = await run(`Bearer ${token}`)

    expect(req.user).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })
})

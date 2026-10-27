import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { McpOAuthService, OAuthClientError } from './mcp-oauth.service'
import { ClientMetadataError } from './mcp-client-metadata'
import { ApiTokensService } from '../api-tokens/api-tokens.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

describe('McpOAuthService', () => {
  let service: McpOAuthService
  let mockData: any
  let mockApiTokensService: jest.Mocked<Pick<ApiTokensService, 'generateApiToken'>>
  let mockConfig: jest.Mocked<Pick<ConfigService, 'get'>>

  beforeEach(async () => {
    const clientRows = new Map<string, any>()
    mockData = {
      mcpOAuthClient: {
        create: jest.fn(async ({ data }: any) => {
          clientRows.set(data.id, { ...data })
          return clientRows.get(data.id)
        }),
        findUnique: jest.fn(async ({ where }: any) => clientRows.get(where.id) ?? null),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = clientRows.get(where.id)
          if (row) Object.assign(row, data)
          return { count: row ? 1 : 0 }
        }),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      organizationMember: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    }
    mockApiTokensService = {
      generateApiToken: jest.fn(),
    }
    mockConfig = {
      get: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpOAuthService,
        { provide: ApiCoreDataAccessService, useValue: mockData },
        { provide: ApiTokensService, useValue: mockApiTokensService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile()

    service = module.get<McpOAuthService>(McpOAuthService)
  })

  describe('Client Registration', () => {
    it('should store a client and return it by id', async () => {
      const client = await service.registerClient('Test App', ['https://example.com/callback'])
      expect(client.clientName).toBe('Test App')
      expect(client.redirectUris).toEqual(['https://example.com/callback'])
      expect(client.clientId).toMatch(/^[a-f0-9]{32}$/)
      expect(mockData.mcpOAuthClient.create).toHaveBeenCalledWith({
        data: {
          id: client.clientId,
          clientName: 'Test App',
          redirectUris: ['https://example.com/callback'],
        },
        select: { id: true, clientName: true, redirectUris: true },
      })
      await expect(service.getClient(client.clientId)).resolves.toEqual(client)
    })

    it('should return undefined for an unknown client id, without a query for a non-DCR id', async () => {
      await expect(service.getClient('0'.repeat(32))).resolves.toBeUndefined()
      await expect(service.getClient('nonexistent')).resolves.toBeUndefined()
      expect(mockData.mcpOAuthClient.findUnique).toHaveBeenCalledTimes(1)
    })

    it('should register multiple clients independently', async () => {
      const a = await service.registerClient('App A', ['https://a.example.com/cb'])
      const b = await service.registerClient('App B', ['https://b.example.com/cb'])
      expect(a.clientId).not.toBe(b.clientId)
      expect((await service.getClient(a.clientId))?.clientName).toBe('App A')
      expect((await service.getClient(b.clientId))?.clientName).toBe('App B')
    })

    it('should bound the stored client name', async () => {
      const client = await service.registerClient(`  ${'x'.repeat(500)}  `, [
        'https://a.example.com/cb',
      ])
      expect(client.clientName).toHaveLength(200)
      expect((await service.registerClient('   ', ['https://a.example.com/cb'])).clientName).toBe(
        'MCP Client',
      )
    })
  })

  describe('Stored registrations: use and pruning', () => {
    it('records use only for DCR ids', async () => {
      const client = await service.registerClient('App', ['https://app.example.com/cb'])
      mockData.mcpOAuthClient.updateMany.mockClear()

      await service.touchClient(client.clientId)
      await service.touchClient('https://client.example.com/client.json')

      expect(mockData.mcpOAuthClient.updateMany).toHaveBeenCalledTimes(1)
      expect(mockData.mcpOAuthClient.updateMany).toHaveBeenCalledWith({
        where: { id: client.clientId },
        data: { lastUsedAt: expect.any(Date) },
      })
    })

    it('does not record use when a client is checked or resolved for a redirect', async () => {
      // /authorize makes these checks before sign-in; counting them as use would let anyone who
      // knows a client id and its redirect URI keep the client from ever being pruned.
      const client = await service.registerClient('App', ['https://app.example.com/cb'])
      mockData.mcpOAuthClient.updateMany.mockClear()

      await service.precheckClient(client.clientId, 'https://app.example.com/cb')
      await service.resolveClientForRedirect(client.clientId, 'https://app.example.com/cb')

      expect(mockData.mcpOAuthClient.updateMany).not.toHaveBeenCalled()
    })

    it('does not record use for a redirect the client did not register', async () => {
      const client = await service.registerClient('App', ['https://app.example.com/cb'])
      mockData.mcpOAuthClient.updateMany.mockClear()

      await expect(
        service.resolveClientForRedirect(client.clientId, 'https://evil.example.com/cb'),
      ).rejects.toBeInstanceOf(OAuthClientError)
      expect(mockData.mcpOAuthClient.updateMany).not.toHaveBeenCalled()
    })

    it('prunes registrations never used within a day, or unused for 30 days', async () => {
      mockData.mcpOAuthClient.deleteMany.mockResolvedValue({ count: 4 })
      const now = Date.UTC(2026, 9, 26)

      await expect(service.pruneStaleClients(now)).resolves.toBe(4)

      expect(mockData.mcpOAuthClient.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { lastUsedAt: null, createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } },
            { lastUsedAt: { lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
          ],
        },
      })
    })

    it('prunes from registration at most once an hour, without failing the registration', async () => {
      const prune = jest.spyOn(service, 'pruneStaleClients').mockRejectedValue(new Error('db down'))
      const now = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 26, 12))
      try {
        await service.registerClient('A', ['https://a.example.com/cb'])
        await service.registerClient('B', ['https://b.example.com/cb'])
        expect(prune).toHaveBeenCalledTimes(1)

        now.mockReturnValue(Date.UTC(2026, 9, 26, 13))
        await expect(service.registerClient('C', ['https://c.example.com/cb'])).resolves.toEqual(
          expect.objectContaining({ clientName: 'C' }),
        )
        expect(prune).toHaveBeenCalledTimes(2)
      } finally {
        now.mockRestore()
      }
    })

    it("caps the total size of a registration's redirect URIs", () => {
      const uri = (i: number) =>
        `https://a.example.com/${String(i).padStart(4, '0')}${'x'.repeat(1000)}`
      expect(service.validateRedirectUris([uri(1), uri(2), uri(3)])).not.toBeNull()
      expect(service.validateRedirectUris([uri(1), uri(2), uri(3), uri(4)])).toBeNull()
    })
  })

  describe('Client resolution for /authorize', () => {
    const cimdUrl = 'https://client.example.com/oauth/client.json'

    it('prechecks DCR clients and URL-shaped client ids without a network request', async () => {
      const client = await service.registerClient('App', ['https://app.example.com/cb'])
      const resolve = jest.spyOn((service as any).clientMetadata, 'resolve')

      await expect(
        service.precheckClient(client.clientId, 'https://app.example.com/cb'),
      ).resolves.toBeUndefined()
      await expect(
        service.precheckClient(client.clientId, 'https://evil.example.com/cb'),
      ).rejects.toMatchObject({ error: 'invalid_request' })
      await expect(
        service.precheckClient(cimdUrl, 'https://client.example.com/cb'),
      ).resolves.toBeUndefined()
      await expect(service.precheckClient(cimdUrl, 'javascript:alert(1)')).rejects.toMatchObject({
        error: 'invalid_request',
      })
      await expect(
        service.precheckClient('unregistered', 'https://app.example.com/cb'),
      ).rejects.toMatchObject({ error: 'invalid_client' })
      await expect(
        service.precheckClient(
          'http://client.example.com/client.json',
          'https://app.example.com/cb',
        ),
      ).rejects.toMatchObject({ error: 'invalid_client' })
      expect(resolve).not.toHaveBeenCalled()
    })

    it('accepts a DCR client only at a redirect_uri it registered', async () => {
      const client = await service.registerClient('App', ['https://app.example.com/cb'])

      await expect(
        service.resolveClientForRedirect(client.clientId, 'https://app.example.com/cb'),
      ).resolves.toEqual(client)
      await expect(
        service.resolveClientForRedirect(client.clientId, 'https://evil.example.com/cb'),
      ).rejects.toEqual(
        new OAuthClientError('invalid_request', 'redirect_uri is not registered for this client'),
      )
    })

    it('lets a loopback redirect use any port (RFC 8252)', async () => {
      const client = await service.registerClient('CLI', ['http://127.0.0.1:33418/callback'])

      await expect(
        service.resolveClientForRedirect(client.clientId, 'http://127.0.0.1:50123/callback'),
      ).resolves.toEqual(client)
      await expect(
        service.resolveClientForRedirect(client.clientId, 'http://127.0.0.1:50123/other'),
      ).rejects.toBeInstanceOf(OAuthClientError)
    })

    it('rejects an unknown DCR client as invalid_client', async () => {
      await expect(
        service.resolveClientForRedirect('unknown', 'https://app.example.com/cb'),
      ).rejects.toMatchObject({ error: 'invalid_client' })
    })

    it('resolves a CIMD client from its metadata document and checks the redirect against it', async () => {
      jest.spyOn((service as any).clientMetadata, 'resolve').mockResolvedValue({
        clientId: cimdUrl,
        clientName: 'Example Client',
        redirectUris: ['https://client.example.com/callback'],
      })

      await expect(
        service.resolveClientForRedirect(cimdUrl, 'https://client.example.com/callback'),
      ).resolves.toMatchObject({ clientId: cimdUrl, clientName: 'Example Client' })
      await expect(
        service.resolveClientForRedirect(cimdUrl, 'https://other.example.com/callback'),
      ).rejects.toMatchObject({ error: 'invalid_request' })
    })

    it('answers a rejected metadata document as invalid_client', async () => {
      jest
        .spyOn((service as any).clientMetadata, 'resolve')
        .mockRejectedValue(
          new ClientMetadataError('Client metadata document client_id does not match its URL'),
        )

      await expect(
        service.resolveClientForRedirect(cimdUrl, 'https://client.example.com/callback'),
      ).rejects.toEqual(
        new OAuthClientError(
          'invalid_client',
          'Client metadata document client_id does not match its URL',
        ),
      )
    })

    it('validates DCR redirect_uris', () => {
      expect(service.validateRedirectUris(['https://app.example.com/cb'])).toEqual([
        'https://app.example.com/cb',
      ])
      expect(
        service.validateRedirectUris(['http://localhost:8080/cb', 'cursor://example.app/oauth']),
      ).toEqual(['http://localhost:8080/cb', 'cursor://example.app/oauth'])
      expect(service.validateRedirectUris([])).toBeNull()
      expect(service.validateRedirectUris(undefined)).toBeNull()
      expect(service.validateRedirectUris(['http://app.example.com/cb'])).toBeNull()
      expect(service.validateRedirectUris(['javascript:alert(1)'])).toBeNull()
      expect(service.validateRedirectUris([42])).toBeNull()
      expect(service.validateRedirectUris([`https://a.example.com/${'x'.repeat(2048)}`])).toBeNull()
      expect(
        service.validateRedirectUris(
          Array.from({ length: 11 }, (_, i) => `https://a.example.com/${i}`),
        ),
      ).toBeNull()
    })
  })

  describe('Discovery metadata', () => {
    const req = {
      protocol: 'https',
      get: (name: string) => (name === 'host' ? 'api.example.com' : undefined),
    }

    it('advertises CIMD, RFC 9207 iss and the deprecated DCR endpoint', () => {
      expect(service.buildAuthorizationServerMetadata(req)).toEqual(
        expect.objectContaining({
          issuer: 'https://api.example.com/api/mcp',
          authorization_endpoint: 'https://api.example.com/api/mcp/authorize',
          token_endpoint: 'https://api.example.com/api/mcp/token',
          registration_endpoint: 'https://api.example.com/api/mcp/register',
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          client_id_metadata_document_supported: true,
          authorization_response_iss_parameter_supported: true,
        }),
      )
    })

    it('names the authorization server in the protected resource metadata', () => {
      expect(service.buildProtectedResourceMetadata(req)).toEqual({
        resource: 'https://api.example.com/api/mcp',
        authorization_servers: ['https://api.example.com/api/mcp'],
        bearer_methods_supported: ['header'],
      })
    })
  })

  describe('Auth Code Lifecycle', () => {
    const baseParams = {
      userId: 'user-1',
      authGeneration: 0,
      organizationId: 'org-1',
      clientId: 'client-1',
      redirectUri: 'https://example.com/cb',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      scope: 'openid',
      resource: 'https://api.example.com/api/mcp',
    }

    it('should create and consume an auth code', () => {
      const code = service.createAuthCode(baseParams)
      expect(code).toHaveLength(64)
      const result = service.consumeAuthCode(code)
      expect(result).toMatchObject(baseParams)
    })

    it('should return null for unknown code', () => {
      expect(service.consumeAuthCode('bad-code')).toBeNull()
    })

    it('should only allow a code to be consumed once', () => {
      const code = service.createAuthCode(baseParams)
      expect(service.consumeAuthCode(code)).not.toBeNull()
      expect(service.consumeAuthCode(code)).toBeNull()
    })

    it('should return null for an expired code', () => {
      const code = service.createAuthCode(baseParams)
      // Reach into the private map and backdate the expiry
      const map = (service as any).authCodes as Map<string, { expiresAt: Date }>
      map.get(code)!.expiresAt = new Date(Date.now() - 1000)
      expect(service.consumeAuthCode(code)).toBeNull()
    })

    it('should store organizationId as null when not provided', () => {
      const code = service.createAuthCode({ ...baseParams, organizationId: null })
      const result = service.consumeAuthCode(code)
      expect(result?.organizationId).toBeNull()
    })
  })

  describe('PKCE Verification', () => {
    it('should verify S256 code challenge correctly', () => {
      const verifier = 'my-secret-verifier'
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      expect(service.verifyPkce(verifier, challenge, 'S256')).toBe(true)
    })

    it('should reject wrong verifier for S256', () => {
      const challenge = createHash('sha256').update('correct').digest('base64url')
      expect(service.verifyPkce('wrong', challenge, 'S256')).toBe(false)
    })

    it('should refuse the plain method even when verifier equals challenge', () => {
      expect(service.verifyPkce('secret', 'secret', 'plain')).toBe(false)
    })

    it('should accept only S256 with a well-formed challenge', () => {
      const challenge = createHash('sha256').update('verifier').digest('base64url')
      expect(service.isAcceptablePkce(challenge, 'S256')).toBe(true)
      expect(service.isAcceptablePkce(challenge, 'plain')).toBe(false)
      expect(service.isAcceptablePkce(challenge, undefined)).toBe(false)
      expect(service.isAcceptablePkce(undefined, 'S256')).toBe(false)
      expect(service.isAcceptablePkce('too-short', 'S256')).toBe(false)
    })
  })

  describe('Pending Authorizations', () => {
    const params = {
      userId: 'user-1',
      sessionId: 'session-1',
      authGeneration: 2,
      clientId: 'client-1',
      clientName: 'Client',
      redirectUri: 'https://example.com/cb',
      state: null,
      codeChallenge: 'challenge',
      scope: 'openid',
      requestedOrganizationId: null,
      issuer: 'https://api.example.com/api/mcp',
      resource: 'https://api.example.com/api/mcp',
    }

    it('should create a record with distinct random id and CSRF token and a 10 minute TTL', () => {
      const before = Date.now()
      const pending = service.createPendingAuthorization(params)
      expect(pending.id).not.toBe(pending.csrfToken)
      expect(pending.id.length).toBeGreaterThanOrEqual(43)
      expect(pending.expiresAt.getTime() - before).toBeGreaterThanOrEqual(service.PENDING_TTL_MS)
      expect(pending.expiresAt.getTime() - before).toBeLessThan(service.PENDING_TTL_MS + 1000)
      expect(service.getPendingAuthorization(pending.id)).toBe(pending)
    })

    it('should be taken at most once', () => {
      const pending = service.createPendingAuthorization(params)
      expect(service.takePendingAuthorization(pending.id)).toBe(pending)
      expect(service.takePendingAuthorization(pending.id)).toBeNull()
      expect(service.getPendingAuthorization(pending.id)).toBeNull()
    })

    it('should expire', () => {
      const pending = service.createPendingAuthorization(params)
      const now = jest.spyOn(Date, 'now').mockReturnValue(pending.expiresAt.getTime())
      try {
        expect(service.takePendingAuthorization(pending.id)).toBeNull()
      } finally {
        now.mockRestore()
      }
    })

    it('should bind to the user, session and auth generation that made it', () => {
      const pending = service.createPendingAuthorization(params)
      const claims = { userId: 'user-1', sessionId: 'session-1', authGeneration: 2 }
      expect(service.isPendingBoundTo(pending, claims)).toBe(true)
      expect(service.isPendingBoundTo(pending, { ...claims, userId: 'user-2' })).toBe(false)
      expect(service.isPendingBoundTo(pending, { ...claims, sessionId: 'session-2' })).toBe(false)
      expect(service.isPendingBoundTo(pending, { ...claims, sessionId: undefined })).toBe(false)
      expect(service.isPendingBoundTo(pending, { ...claims, authGeneration: 3 })).toBe(false)
    })

    it('should compare the CSRF token exactly', () => {
      const pending = service.createPendingAuthorization(params)
      expect(service.isCsrfTokenValid(pending, pending.csrfToken)).toBe(true)
      expect(service.isCsrfTokenValid(pending, `${pending.csrfToken}x`)).toBe(false)
      expect(service.isCsrfTokenValid(pending, '')).toBe(false)
      expect(service.isCsrfTokenValid(pending, undefined)).toBe(false)
    })
  })

  describe('Redirect URI safety', () => {
    // #64: the acceptable-form rule moved to validateRedirectUris (DCR) and precheckClient.
    it.each(['https://example.com/cb', 'http://127.0.0.1:3333/cb', 'cursor://anysphere/cb'])(
      'should accept %s',
      uri => expect(service.validateRedirectUris([uri])).toEqual([uri]),
    )

    it.each([
      'javascript:alert(1)',
      'data:text/html,x',
      'about:blank',
      'not a url',
      'https://example.com/cb#frag',
    ])('should refuse %s', uri => expect(service.validateRedirectUris([uri])).toBeNull())
  })

  describe('Resource indicators (RFC 8707)', () => {
    const base = 'https://api.example.com/api/mcp'

    it('binds to this endpoint when resource is omitted or names it', () => {
      expect(service.resolveResource(undefined, base)).toBe(base)
      expect(service.resolveResource('', base)).toBe(base)
      expect(service.resolveResource(base, base)).toBe(base)
      expect(service.resolveResource('HTTPS://API.EXAMPLE.COM/api/mcp/', base)).toBe(base)
    })

    it('refuses any other resource', () => {
      expect(service.resolveResource('https://api.example.com', base)).toBeNull()
      expect(service.resolveResource('https://evil.example.com/api/mcp', base)).toBeNull()
      expect(service.resolveResource(`${base}#x`, base)).toBeNull()
      expect(service.resolveResource('mcp', base)).toBeNull()
    })
  })

  describe('Organization Resolution', () => {
    it('should list the user organizations oldest membership first', async () => {
      mockData.organizationMember.findMany.mockResolvedValue([
        { organization: { id: 'org-a', name: 'A' } },
        { organization: { id: 'org-b', name: 'B' } },
      ])
      await expect(service.listUserOrganizations('user-1')).resolves.toEqual([
        { id: 'org-a', name: 'A' },
        { id: 'org-b', name: 'B' },
      ])
      expect(mockData.organizationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' }, orderBy: { createdAt: 'asc' } }),
      )
    })

    it('should summarise the account with its primary email', async () => {
      mockData.user.findUnique.mockResolvedValue({
        firstName: 'Ada',
        lastName: null,
        emails: [{ email: 'ada@example.com' }],
      })
      await expect(service.getAccountSummary('user-1')).resolves.toEqual({
        name: 'Ada',
        email: 'ada@example.com',
      })
    })

    it('should validate org membership when member exists', async () => {
      mockData.organizationMember.findFirst.mockResolvedValue({ id: 'mem-1' })
      expect(await service.validateOrgMembership('user-1', 'org-1')).toBe(true)
    })

    it('should return false for non-member', async () => {
      mockData.organizationMember.findFirst.mockResolvedValue(null)
      expect(await service.validateOrgMembership('user-1', 'org-1')).toBe(false)
    })
  })

  describe('Access Token Creation', () => {
    it('should create an org-scoped API token', async () => {
      mockApiTokensService.generateApiToken.mockResolvedValue({ token: 'plain-token-abc' } as any)
      const token = await service.createAccessToken(
        'user-1',
        'org-1',
        2,
        'https://api.example.com/api/mcp',
      )
      expect(token).toBe('plain-token-abc')
      // The token is bound to the generation of the session that authorized the code, and to the
      // MCP endpoint (RFC 8707).
      expect(mockApiTokensService.generateApiToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ organizationId: 'org-1' }),
        2,
        { resource: 'https://api.example.com/api/mcp' },
      )
    })

    it('should create a token without org scope when organizationId is null', async () => {
      mockApiTokensService.generateApiToken.mockResolvedValue({ token: 'plain-token-xyz' } as any)
      await service.createAccessToken('user-1', null, 0, 'https://api.example.com/api/mcp')
      expect(mockApiTokensService.generateApiToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ organizationId: undefined }),
        0,
        { resource: 'https://api.example.com/api/mcp' },
      )
    })
  })

  describe('getMcpBaseUrl', () => {
    it('should build url from request headers', () => {
      const req = {
        protocol: 'http',
        get: (h: string) => (h === 'host' ? 'localhost:3000' : undefined),
      } as any
      expect(service.getMcpBaseUrl(req)).toBe('http://localhost:3000/api/mcp')
    })

    it('should prefer x-forwarded headers when present', () => {
      const req = {
        protocol: 'http',
        get: (h: string) => {
          if (h === 'x-forwarded-proto') return 'https'
          if (h === 'x-forwarded-host') return 'app.example.com'
          return undefined
        },
      } as any
      expect(service.getMcpBaseUrl(req)).toBe('https://app.example.com/api/mcp')
    })

    it('should use the first entry of a comma-separated forwarding header', () => {
      const req = {
        protocol: 'http',
        get: (h: string) => {
          if (h === 'x-forwarded-proto') return 'https, http'
          if (h === 'x-forwarded-host') return ' app.example.com , internal.example.com'
          return 'internal:3000'
        },
      } as any
      expect(service.getMcpBaseUrl(req)).toBe('https://app.example.com/api/mcp')
      expect(service.buildAuthorizationServerMetadata(req).issuer).toBe(
        'https://app.example.com/api/mcp',
      )
    })

    it('should fall back to config apiUrl when no request provided', () => {
      mockConfig.get.mockReturnValue('https://api.example.com')
      expect(service.getMcpBaseUrl()).toBe('https://api.example.com/api/mcp')
    })
  })
})

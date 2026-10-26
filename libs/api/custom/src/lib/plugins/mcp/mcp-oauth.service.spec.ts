import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { McpOAuthService } from './mcp-oauth.service'
import { ApiTokensService } from '../api-tokens/api-tokens.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

describe('McpOAuthService', () => {
  let service: McpOAuthService
  let mockData: any
  let mockApiTokensService: jest.Mocked<Pick<ApiTokensService, 'generateApiToken'>>
  let mockConfig: jest.Mocked<Pick<ConfigService, 'get'>>

  beforeEach(async () => {
    mockData = {
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
    it('should register a client and return it by id', () => {
      const client = service.registerClient('Test App', ['https://example.com/callback'])
      expect(client.clientName).toBe('Test App')
      expect(client.redirectUris).toEqual(['https://example.com/callback'])
      expect(client.clientId).toHaveLength(32)
      expect(service.getClient(client.clientId)).toBe(client)
    })

    it('should return undefined for unknown client id', () => {
      expect(service.getClient('nonexistent')).toBeUndefined()
    })

    it('should register multiple clients independently', () => {
      const a = service.registerClient('App A', [])
      const b = service.registerClient('App B', [])
      expect(a.clientId).not.toBe(b.clientId)
      expect(service.getClient(a.clientId)?.clientName).toBe('App A')
      expect(service.getClient(b.clientId)?.clientName).toBe('App B')
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
    it.each(['https://example.com/cb', 'http://127.0.0.1:3333/cb', 'cursor://anysphere/cb'])(
      'should accept %s',
      uri => expect(service.isSafeRedirectUri(uri)).toBe(true),
    )

    it.each([
      'javascript:alert(1)',
      'data:text/html,x',
      'not a url',
      'https://example.com/cb#frag',
    ])('should refuse %s', uri => expect(service.isSafeRedirectUri(uri)).toBe(false))
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
      const token = await service.createAccessToken('user-1', 'org-1', 2)
      expect(token).toBe('plain-token-abc')
      // The token is bound to the generation of the session that authorized the code.
      expect(mockApiTokensService.generateApiToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ organizationId: 'org-1' }),
        2,
      )
    })

    it('should create a token without org scope when organizationId is null', async () => {
      mockApiTokensService.generateApiToken.mockResolvedValue({ token: 'plain-token-xyz' } as any)
      await service.createAccessToken('user-1', null, 0)
      expect(mockApiTokensService.generateApiToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ organizationId: undefined }),
        0,
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

    it('should fall back to config apiUrl when no request provided', () => {
      mockConfig.get.mockReturnValue('https://api.example.com')
      expect(service.getMcpBaseUrl()).toBe('https://api.example.com/api/mcp')
    })
  })
})

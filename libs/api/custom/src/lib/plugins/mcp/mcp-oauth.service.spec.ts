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
        count: jest.fn(),
        findFirst: jest.fn(),
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
      organizationId: 'org-1',
      clientId: 'client-1',
      redirectUri: 'https://example.com/cb',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'plain',
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

    it('should verify plain code challenge correctly', () => {
      expect(service.verifyPkce('secret', 'secret', 'plain')).toBe(true)
    })

    it('should reject wrong verifier for plain', () => {
      expect(service.verifyPkce('wrong', 'secret', 'plain')).toBe(false)
    })
  })

  describe('Organization Resolution', () => {
    it('should count user organizations', async () => {
      mockData.organizationMember.count.mockResolvedValue(3)
      const count = await service.countUserOrganizations('user-1')
      expect(count).toBe(3)
      expect(mockData.organizationMember.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      })
    })

    it('should resolve organization id for single-org user', async () => {
      mockData.organizationMember.findFirst.mockResolvedValue({ organizationId: 'org-abc' })
      const orgId = await service.resolveOrganizationId('user-1')
      expect(orgId).toBe('org-abc')
    })

    it('should return null when user has no organizations', async () => {
      mockData.organizationMember.findFirst.mockResolvedValue(null)
      expect(await service.resolveOrganizationId('user-1')).toBeNull()
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
      const token = await service.createAccessToken('user-1', 'org-1')
      expect(token).toBe('plain-token-abc')
      expect(mockApiTokensService.generateApiToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ organizationId: 'org-1' }),
      )
    })

    it('should create a token without org scope when organizationId is null', async () => {
      mockApiTokensService.generateApiToken.mockResolvedValue({ token: 'plain-token-xyz' } as any)
      await service.createAccessToken('user-1', null)
      expect(mockApiTokensService.generateApiToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ organizationId: undefined }),
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

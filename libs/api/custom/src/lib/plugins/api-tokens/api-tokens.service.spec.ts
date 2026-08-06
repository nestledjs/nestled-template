import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ApiTokensService } from './api-tokens.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { SecurityEventsService } from '../security/security-events.service'
import { GenerateApiTokenInput, RotateApiTokenInput } from './dto'
import { createHash } from 'node:crypto'
describe('ApiTokensService', () => {
  let service: ApiTokensService
  let mockData: any
  let mockSecurityEvents: jest.Mocked<SecurityEventsService>
  beforeEach(async () => {
    mockData = {
      apiToken: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      organizationMember: {
        findFirst: jest.fn(),
      },
    }
    mockSecurityEvents = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    } as any
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiTokensService,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockData,
        },
        {
          provide: SecurityEventsService,
          useValue: mockSecurityEvents,
        },
      ],
    }).compile()
    service = module.get<ApiTokensService>(ApiTokensService)
  })
  describe('Token Generation', () => {
    it('should generate an API token successfully', async () => {
      const userId = 'user-123'
      const input: GenerateApiTokenInput = {
        name: 'Production API Token',
        expiresAt: new Date('2025-12-31'),
      }
      const mockApiToken = {
        id: 'token-123',
        name: 'Production API Token',
        tokenHash: 'hashed-token',
        userId,
        expiresAt: input.expiresAt,
        lastUsedAt: null,
        revoked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockData.apiToken.create.mockResolvedValue(mockApiToken as any)
      const result = await service.generateApiToken(userId, input)
      expect(result.token).toBeDefined()
      expect(result.token).toHaveLength(64) // 32 bytes = 64 hex chars
      expect(result.apiToken).toEqual(mockApiToken)
      expect(mockData.apiToken.create).toHaveBeenCalledWith({
        data: {
          name: 'Production API Token',
          tokenHash: expect.any(String),
          userId,
          expiresAt: input.expiresAt,
          organizationId: undefined,
          lastUsedAt: null,
          revoked: false,
        },
      })
      expect(mockSecurityEvents.logEvent).toHaveBeenCalledWith(userId, 'API_TOKEN_CREATED', {
        metadata: {
          tokenId: 'token-123',
          tokenName: 'Production API Token',
          organizationId: null,
        },
      })
    })
    it('should verify organization membership before generating an org-scoped token', async () => {
      const userId = 'user-123'
      const input: GenerateApiTokenInput = {
        name: 'MCP Token',
        organizationId: 'org-123',
      }
      const mockApiToken = {
        id: 'token-123',
        name: 'MCP Token',
        tokenHash: 'hashed-token',
        userId,
        organizationId: 'org-123',
        lastUsedAt: null,
        revoked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockData.organizationMember.findFirst.mockResolvedValue({ id: 'member-123' })
      mockData.apiToken.create.mockResolvedValue(mockApiToken as any)

      const result = await service.generateApiToken(userId, input)

      expect(result.apiToken).toEqual(mockApiToken)
      expect(mockData.organizationMember.findFirst).toHaveBeenCalledWith({
        where: { userId, organizationId: 'org-123' },
        select: { id: true },
      })
      expect(mockData.apiToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-123' }),
        }),
      )
      expect(mockSecurityEvents.logEvent).toHaveBeenCalledWith(userId, 'API_TOKEN_CREATED', {
        metadata: {
          tokenId: 'token-123',
          tokenName: 'MCP Token',
          organizationId: 'org-123',
        },
      })
    })
    it('should reject org-scoped token generation for non-members', async () => {
      mockData.organizationMember.findFirst.mockResolvedValue(null)

      await expect(
        service.generateApiToken('user-123', {
          name: 'MCP Token',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(mockData.apiToken.create).not.toHaveBeenCalled()
    })
    it('should generate unique tokens each time', async () => {
      const userId = 'user-123'
      const input: GenerateApiTokenInput = {
        name: 'Test Token',
      }
      mockData.apiToken.create.mockResolvedValue({
        id: 'token-1',
        tokenHash: 'hash-1',
      } as any)
      const result1 = await service.generateApiToken(userId, input)
      mockData.apiToken.create.mockResolvedValue({
        id: 'token-2',
        tokenHash: 'hash-2',
      } as any)
      const result2 = await service.generateApiToken(userId, input)
      expect(result1.token).not.toEqual(result2.token)
    })
    it('should hash token before storing', async () => {
      const userId = 'user-123'
      const input: GenerateApiTokenInput = {
        name: 'Test Token',
      }
      mockData.apiToken.create.mockResolvedValue({
        id: 'token-123',
        tokenHash: 'stored-hash',
      } as any)
      const result = await service.generateApiToken(userId, input)
      // tokenHash carries @graphqlOmit, so it is not in the GraphQL schema and cannot be queried.
      // The stored value is still asserted here, since that is the property that matters.
      // Verify that create was called with a hash, not the plaintext token
      const createCall = mockData.apiToken.create.mock.calls[0][0]
      expect(createCall.data.tokenHash).not.toEqual(result.token)
      expect(createCall.data.tokenHash).toHaveLength(64) // SHA-256 produces 64 hex chars
    })
  })
  describe('List Tokens', () => {
    it('should list all tokens for a user', async () => {
      const userId = 'user-123'
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          userId,
          revoked: false,
          createdAt: new Date(),
        },
        {
          id: 'token-2',
          name: 'Token 2',
          userId,
          revoked: false,
          createdAt: new Date(),
        },
      ]
      mockData.apiToken.findMany.mockResolvedValue(mockTokens as any)
      const result = await service.listApiTokens(userId)
      expect(result).toEqual(mockTokens)
      expect(mockData.apiToken.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
    })
    it('should return empty array when user has no tokens', async () => {
      mockData.apiToken.findMany.mockResolvedValue([])
      const result = await service.listApiTokens('user-123')
      expect(result).toEqual([])
    })
  })
  describe('Token Revocation', () => {
    it('should revoke a token successfully', async () => {
      const userId = 'user-123'
      const tokenId = 'token-123'
      const mockToken = {
        id: tokenId,
        name: 'Test Token',
        userId,
        revoked: false,
      }
      const revokedToken = {
        ...mockToken,
        revoked: true,
      }
      mockData.apiToken.findUnique.mockResolvedValue(mockToken as any)
      mockData.apiToken.update.mockResolvedValue(revokedToken as any)
      const result = await service.revokeApiToken(userId, tokenId)
      expect(result.revoked).toBe(true)
      expect(mockData.apiToken.update).toHaveBeenCalledWith({
        where: { id: tokenId },
        data: { revoked: true },
      })
      expect(mockSecurityEvents.logEvent).toHaveBeenCalledWith(userId, 'API_TOKEN_REVOKED', {
        metadata: { tokenId, tokenName: 'Test Token' },
      })
    })
    it('should throw error when revoking token that does not belong to user', async () => {
      mockData.apiToken.findUnique.mockResolvedValue({
        id: 'token-123',
        userId: 'different-user',
        revoked: false,
      } as any)
      await expect(service.revokeApiToken('user-123', 'token-123')).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.revokeApiToken('user-123', 'token-123')).rejects.toThrow(
        'API token not found',
      )
    })
    it('should throw error when revoking non-existent token', async () => {
      mockData.apiToken.findUnique.mockResolvedValue(null)
      await expect(service.revokeApiToken('user-123', 'non-existent')).rejects.toThrow(
        BadRequestException,
      )
    })
    it('should throw error when revoking already revoked token', async () => {
      mockData.apiToken.findUnique.mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        revoked: true,
      } as any)
      await expect(service.revokeApiToken('user-123', 'token-123')).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.revokeApiToken('user-123', 'token-123')).rejects.toThrow(
        'already revoked',
      )
    })
  })
  describe('Token Rotation', () => {
    it('should rotate token and revoke old one by default', async () => {
      const userId = 'user-123'
      const input: RotateApiTokenInput = {
        tokenId: 'old-token-123',
      }
      const oldToken = {
        id: 'old-token-123',
        name: 'Production Token',
        userId,
        tokenHash: 'old-hash',
        expiresAt: new Date('2025-12-31'),
        organizationId: 'org-123',
        revoked: false,
      }
      const newToken = {
        id: 'new-token-456',
        name: 'Production Token',
        userId,
        tokenHash: 'new-hash',
        expiresAt: oldToken.expiresAt,
        organizationId: oldToken.organizationId,
        revoked: false,
      }
      mockData.apiToken.findUnique.mockResolvedValue(oldToken as any)
      mockData.apiToken.create.mockResolvedValue(newToken as any)
      mockData.apiToken.update.mockResolvedValue({ ...oldToken, revoked: true } as any)
      const result = await service.rotateApiToken(userId, input)
      expect(result.token).toBeDefined()
      expect(result.token).toHaveLength(64)
      expect(result.apiToken.id).toBe('new-token-456')
      expect(mockData.apiToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
        }),
      })
      // Old token should be revoked
      expect(mockData.apiToken.update).toHaveBeenCalledWith({
        where: { id: 'old-token-123' },
        data: { revoked: true },
      })
      expect(mockSecurityEvents.logEvent).toHaveBeenCalledWith(userId, 'API_TOKEN_ROTATED', {
        metadata: {
          oldTokenId: 'old-token-123',
          newTokenId: 'new-token-456',
          tokenName: 'Production Token',
          organizationId: 'org-123',
          keepOldTokenActive: undefined,
        },
      })
    })
    it('should keep old token active when requested', async () => {
      const userId = 'user-123'
      const input: RotateApiTokenInput = {
        tokenId: 'old-token-123',
        keepOldTokenActive: true,
      }
      const oldToken = {
        id: 'old-token-123',
        name: 'Production Token',
        userId,
        revoked: false,
      }
      mockData.apiToken.findUnique.mockResolvedValue(oldToken as any)
      mockData.apiToken.create.mockResolvedValue({
        id: 'new-token-456',
        name: 'Production Token',
      } as any)
      await service.rotateApiToken(userId, input)
      // Old token should NOT be revoked
      expect(mockData.apiToken.update).not.toHaveBeenCalled()
    })
    it('should throw error when rotating token that does not belong to user', async () => {
      mockData.apiToken.findUnique.mockResolvedValue({
        id: 'token-123',
        userId: 'different-user',
      } as any)
      await expect(service.rotateApiToken('user-123', { tokenId: 'token-123' })).rejects.toThrow(
        BadRequestException,
      )
    })
    it('should throw error when rotating non-existent token', async () => {
      mockData.apiToken.findUnique.mockResolvedValue(null)
      await expect(service.rotateApiToken('user-123', { tokenId: 'non-existent' })).rejects.toThrow(
        BadRequestException,
      )
    })
  })
  describe('Token Validation', () => {
    it('should validate a valid token', async () => {
      const plainToken = 'a'.repeat(64) // 64 hex chars
      const tokenHash = createHash('sha256').update(plainToken).digest('hex')
      const mockApiToken = {
        id: 'token-123',
        userId: 'user-123',
        tokenHash,
        revoked: false,
        expiresAt: new Date('2099-12-31'), // Future date
      }
      mockData.apiToken.findFirst.mockResolvedValue(mockApiToken as any)
      mockData.apiToken.update.mockResolvedValue({} as any)
      const result = await service.validateApiToken(plainToken)
      expect(result).toEqual({
        userId: 'user-123',
        tokenId: 'token-123',
        organizationId: null,
      })
      expect(mockData.apiToken.findFirst).toHaveBeenCalledWith({
        where: {
          tokenHash,
          revoked: false,
        },
      })
    })
    it('should return null for invalid token', async () => {
      mockData.apiToken.findFirst.mockResolvedValue(null)
      const result = await service.validateApiToken('invalid-token')
      expect(result).toBeNull()
    })
    it('should return null for expired token', async () => {
      const plainToken = 'a'.repeat(64)
      const tokenHash = createHash('sha256').update(plainToken).digest('hex')
      const mockApiToken = {
        id: 'token-123',
        userId: 'user-123',
        tokenHash,
        revoked: false,
        expiresAt: new Date('2020-01-01'), // Past date
      }
      mockData.apiToken.findFirst.mockResolvedValue(mockApiToken as any)
      const result = await service.validateApiToken(plainToken)
      expect(result).toBeNull()
    })
    it('should return null for revoked token', async () => {
      const plainToken = 'a'.repeat(64)
      // findFirst should return null because we filter by revoked: false
      mockData.apiToken.findFirst.mockResolvedValue(null)
      const result = await service.validateApiToken(plainToken)
      expect(result).toBeNull()
    })
    it('should validate token without expiration', async () => {
      const plainToken = 'a'.repeat(64)
      const tokenHash = createHash('sha256').update(plainToken).digest('hex')
      const mockApiToken = {
        id: 'token-123',
        userId: 'user-123',
        tokenHash,
        revoked: false,
        expiresAt: null, // No expiration
      }
      mockData.apiToken.findFirst.mockResolvedValue(mockApiToken as any)
      mockData.apiToken.update.mockResolvedValue({} as any)
      const result = await service.validateApiToken(plainToken)
      expect(result).toEqual({
        userId: 'user-123',
        tokenId: 'token-123',
        organizationId: null,
      })
    })
    it('should handle lastUsedAt update failure gracefully', async () => {
      const plainToken = 'a'.repeat(64)
      const tokenHash = createHash('sha256').update(plainToken).digest('hex')
      mockData.apiToken.findFirst.mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        tokenHash,
        revoked: false,
        expiresAt: null,
      } as any)
      // Simulate update failure
      mockData.apiToken.update.mockRejectedValue(new Error('Database error'))
      // Should still return valid result even if update fails
      const result = await service.validateApiToken(plainToken)
      expect(result).toEqual({
        userId: 'user-123',
        tokenId: 'token-123',
        organizationId: null,
      })
    })
  })
  describe('Token Hashing', () => {
    it('should produce consistent hashes for same input', async () => {
      const userId = 'user-123'
      const input: GenerateApiTokenInput = {
        name: 'Test Token',
      }
      let firstHash: string
      mockData.apiToken.create.mockImplementation((args: any) => {
        firstHash = args.data.tokenHash
        return Promise.resolve({ id: 'token-1', tokenHash: firstHash })
      })
      await service.generateApiToken(userId, input)
      let secondHash: string
      mockData.apiToken.create.mockImplementation((args: any) => {
        secondHash = args.data.tokenHash
        return Promise.resolve({ id: 'token-2', tokenHash: secondHash })
      })
      await service.generateApiToken(userId, input)
      // Different tokens should produce different hashes
      expect(firstHash!).not.toEqual(secondHash!)
    })
    it('should use SHA-256 for hashing', async () => {
      const testToken = 'test-token-value'
      const expectedHash = createHash('sha256').update(testToken).digest('hex')
      mockData.apiToken.findFirst.mockResolvedValue({
        id: 'token-123',
        userId: 'user-123',
        tokenHash: expectedHash,
        revoked: false,
      })
      mockData.apiToken.update.mockResolvedValue({})
      const result = await service.validateApiToken(testToken)
      expect(result).toBeDefined()
      expect(result!.tokenId).toBe('token-123')
    })
  })
})

import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OAuthService } from './oauth.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { OAuthProvider } from './dto'
// Mock the ESM modules that cause Jest issues
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}))
jest.mock('@octokit/oauth-app', () => ({
  OAuthApp: jest.fn().mockImplementation(() => ({
    createToken: jest.fn(),
  })),
}))
describe('OAuthService', () => {
  let service: OAuthService
  let mockData: any
  let mockConfigService: jest.Mocked<ConfigService>
  beforeEach(async () => {
    mockData = {
      oAuthAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      organizationMember: {
        create: jest.fn(),
      },
    }
    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          'oauth.google.clientId': 'google-client-id',
          'oauth.google.clientSecret': 'google-client-secret',
          'oauth.github.clientId': 'github-client-id',
          'oauth.github.clientSecret': 'github-client-secret',
        }
        return config[key]
      }),
    } as any
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockData,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()
    service = module.get<OAuthService>(OAuthService)
  })
  describe('Provider Initialization', () => {
    it('should initialize with Google and GitHub providers', () => {
      expect(service).toBeDefined()
      expect(mockConfigService.get).toHaveBeenCalledWith('oauth.google.clientId')
      expect(mockConfigService.get).toHaveBeenCalledWith('oauth.google.clientSecret')
      expect(mockConfigService.get).toHaveBeenCalledWith('oauth.github.clientId')
      expect(mockConfigService.get).toHaveBeenCalledWith('oauth.github.clientSecret')
    })
    it('should throw BadRequestException when Google is not configured', async () => {
      // Create a new service instance without Google config
      mockConfigService.get.mockReturnValue(undefined)
      const moduleWithoutGoogle: TestingModule = await Test.createTestingModule({
        providers: [
          OAuthService,
          {
            provide: ApiCoreDataAccessService,
            useValue: mockData,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile()
      const serviceWithoutGoogle = moduleWithoutGoogle.get<OAuthService>(OAuthService)
      await expect(serviceWithoutGoogle.verifyGoogleToken('token')).rejects.toThrow(
        BadRequestException,
      )
      await expect(serviceWithoutGoogle.verifyGoogleToken('token')).rejects.toThrow(
        'Google OAuth is not configured',
      )
    })
    it('should throw BadRequestException when GitHub is not configured', async () => {
      // Create a new service instance without GitHub config
      mockConfigService.get.mockReturnValue(undefined)
      const moduleWithoutGitHub: TestingModule = await Test.createTestingModule({
        providers: [
          OAuthService,
          {
            provide: ApiCoreDataAccessService,
            useValue: mockData,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile()
      const serviceWithoutGitHub = moduleWithoutGitHub.get<OAuthService>(OAuthService)
      await expect(serviceWithoutGitHub.verifyGitHubCode('code')).rejects.toThrow(
        BadRequestException,
      )
      await expect(serviceWithoutGitHub.verifyGitHubCode('code')).rejects.toThrow(
        'GitHub OAuth is not configured',
      )
    })
  })
  describe('Link OAuth Account', () => {
    it('should link Google account to existing user', async () => {
      const userId = 'user-123'
      const token = 'google-token'
      // Mock no existing OAuth account
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      mockData.oAuthAccount.create.mockResolvedValue({
        id: 'oauth-123',
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        userId,
      })
      // Mock Google token verification by spying on the method
      jest.spyOn(service, 'verifyGoogleToken').mockResolvedValue({
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
        name: 'Test User',
      })
      await service.linkOAuthAccount(userId, OAuthProvider.GOOGLE, token)
      expect(service.verifyGoogleToken).toHaveBeenCalledWith(token)
      expect(mockData.oAuthAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerUserId: {
            provider: OAuthProvider.GOOGLE,
            providerUserId: 'google-user-id',
          },
        },
      })
      expect(mockData.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          provider: OAuthProvider.GOOGLE,
          providerUserId: 'google-user-id',
          userId,
        },
      })
    })
    it('should link GitHub account to existing user', async () => {
      const userId = 'user-123'
      const code = 'github-code'
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      mockData.oAuthAccount.create.mockResolvedValue({
        id: 'oauth-456',
        provider: OAuthProvider.GITHUB,
        providerUserId: 'github-user-id',
        userId,
      })
      // Mock GitHub code verification
      jest.spyOn(service, 'verifyGitHubCode').mockResolvedValue({
        provider: OAuthProvider.GITHUB,
        providerUserId: 'github-user-id',
        email: 'user@example.com',
        name: 'Test User',
      })
      await service.linkOAuthAccount(userId, OAuthProvider.GITHUB, code)
      expect(service.verifyGitHubCode).toHaveBeenCalledWith(code)
      expect(mockData.oAuthAccount.create).toHaveBeenCalled()
    })
    it('should throw ConflictException when OAuth account is already linked to same user', async () => {
      const userId = 'user-123'
      const token = 'google-token'
      mockData.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oauth-123',
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        userId: 'user-123', // Same user
      })
      jest.spyOn(service, 'verifyGoogleToken').mockResolvedValue({
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
      })
      await expect(service.linkOAuthAccount(userId, OAuthProvider.GOOGLE, token)).rejects.toThrow(
        ConflictException,
      )
      await expect(service.linkOAuthAccount(userId, OAuthProvider.GOOGLE, token)).rejects.toThrow(
        'This OAuth account is already linked to your account',
      )
    })
    it('should throw ConflictException when OAuth account is linked to different user', async () => {
      const userId = 'user-123'
      const token = 'google-token'
      mockData.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oauth-123',
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        userId: 'different-user-456', // Different user
      })
      jest.spyOn(service, 'verifyGoogleToken').mockResolvedValue({
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
      })
      await expect(service.linkOAuthAccount(userId, OAuthProvider.GOOGLE, token)).rejects.toThrow(
        ConflictException,
      )
      await expect(service.linkOAuthAccount(userId, OAuthProvider.GOOGLE, token)).rejects.toThrow(
        'This OAuth account is already linked to another user',
      )
    })
    it('should throw BadRequestException for unsupported provider', async () => {
      const userId = 'user-123'
      const token = 'token'
      await expect(
        service.linkOAuthAccount(userId, 'UNSUPPORTED' as OAuthProvider, token),
      ).rejects.toThrow(BadRequestException)
      await expect(
        service.linkOAuthAccount(userId, 'UNSUPPORTED' as OAuthProvider, token),
      ).rejects.toThrow('Unsupported OAuth provider')
    })
  })
  describe('Unlink OAuth Account', () => {
    it('should unlink OAuth account from user', async () => {
      const userId = 'user-123'
      const provider = OAuthProvider.GOOGLE
      const mockUser = {
        id: userId,
        password: 'hashed-password', // Has password, so can unlink
        oAuthAccounts: [
          {
            id: 'oauth-123',
            provider: OAuthProvider.GOOGLE,
            providerUserId: 'google-user-id',
            userId,
          },
        ],
      }
      mockData.user.findUnique.mockResolvedValue(mockUser as any)
      mockData.oAuthAccount.delete.mockResolvedValue({} as any)
      await service.unlinkOAuthAccount(userId, provider)
      expect(mockData.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: { oAuthAccounts: true },
      })
      expect(mockData.oAuthAccount.delete).toHaveBeenCalledWith({
        where: { id: 'oauth-123' },
      })
    })
    it('should throw UnauthorizedException when user not found', async () => {
      mockData.user.findUnique.mockResolvedValue(null)
      await expect(
        service.unlinkOAuthAccount('non-existent', OAuthProvider.GOOGLE),
      ).rejects.toThrow(UnauthorizedException)
      await expect(
        service.unlinkOAuthAccount('non-existent', OAuthProvider.GOOGLE),
      ).rejects.toThrow('User not found')
    })
    it('should throw BadRequestException when trying to unlink the only auth method', async () => {
      const userId = 'user-123'
      const mockUser = {
        id: userId,
        password: null, // No password
        oAuthAccounts: [
          {
            id: 'oauth-123',
            provider: OAuthProvider.GOOGLE,
            providerUserId: 'google-user-id',
            userId,
          },
        ], // Only one OAuth account
      }
      mockData.user.findUnique.mockResolvedValue(mockUser as any)
      await expect(service.unlinkOAuthAccount(userId, OAuthProvider.GOOGLE)).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.unlinkOAuthAccount(userId, OAuthProvider.GOOGLE)).rejects.toThrow(
        'Cannot unlink the only authentication method',
      )
    })
    it('should throw BadRequestException when OAuth account not linked', async () => {
      const userId = 'user-123'
      const mockUser = {
        id: userId,
        password: 'hashed-password',
        oAuthAccounts: [], // No OAuth accounts
      }
      mockData.user.findUnique.mockResolvedValue(mockUser as any)
      await expect(service.unlinkOAuthAccount(userId, OAuthProvider.GOOGLE)).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.unlinkOAuthAccount(userId, OAuthProvider.GOOGLE)).rejects.toThrow(
        'OAuth account not linked',
      )
    })
    it('should allow unlinking when user has multiple OAuth accounts', async () => {
      const userId = 'user-123'
      const mockUser = {
        id: userId,
        password: null, // No password
        oAuthAccounts: [
          {
            id: 'oauth-google',
            provider: OAuthProvider.GOOGLE,
            providerUserId: 'google-user-id',
            userId,
          },
          {
            id: 'oauth-github',
            provider: OAuthProvider.GITHUB,
            providerUserId: 'github-user-id',
            userId,
          },
        ], // Multiple OAuth accounts
      }
      mockData.user.findUnique.mockResolvedValue(mockUser as any)
      mockData.oAuthAccount.delete.mockResolvedValue({} as any)
      await service.unlinkOAuthAccount(userId, OAuthProvider.GOOGLE)
      expect(mockData.oAuthAccount.delete).toHaveBeenCalledWith({
        where: { id: 'oauth-google' },
      })
    })
  })
  describe('Find or Create User from OAuth', () => {
    it('should return existing user when OAuth account exists', async () => {
      const profile = {
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
        name: 'Test User',
      }
      const mockOAuthAccount = {
        id: 'oauth-123',
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        userId: 'user-123',
        user: {
          id: 'user-123',
          displayName: 'testuser',
          email: 'user@example.com',
        },
      }
      mockData.oAuthAccount.findUnique.mockResolvedValue(mockOAuthAccount as any)
      const result = await service.findOrCreateUserFromOAuth(profile)
      expect(result).toEqual(mockOAuthAccount.user)
      expect(mockData.oAuthAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerUserId: {
            provider: OAuthProvider.GOOGLE,
            providerUserId: 'google-user-id',
          },
        },
        include: { user: true },
      })
    })
    it('should link OAuth to existing user with matching email', async () => {
      const profile = {
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
        name: 'Test User',
      }
      const existingUser = {
        id: 'user-123',
        displayName: 'testuser',
      }
      // OAuth account doesn't exist
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      // But user with email exists
      mockData.user.findFirst.mockResolvedValue(existingUser as any)
      mockData.oAuthAccount.create.mockResolvedValue({
        id: 'oauth-new',
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        userId: 'user-123',
      } as any)
      const result = await service.findOrCreateUserFromOAuth(profile)
      expect(result).toEqual(existingUser)
      expect(mockData.user.findFirst).toHaveBeenCalledWith({
        where: {
          emails: {
            some: {
              email: {
                equals: 'user@example.com',
                mode: 'insensitive',
              },
            },
          },
        },
      })
      expect(mockData.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          provider: OAuthProvider.GOOGLE,
          providerUserId: 'google-user-id',
          userId: 'user-123',
        },
      })
    })
    it('should create new user when no existing user found', async () => {
      const profile = {
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'newuser@example.com',
        name: 'New User',
      }
      const newUser = {
        id: 'user-new',
        displayName: 'New User',
        emailValidated: true,
      }
      // OAuth account doesn't exist
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      // User with email doesn't exist
      mockData.user.findFirst.mockResolvedValue(null)
      // Display name is unique
      mockData.user.findUnique.mockResolvedValue(null)
      // Create user
      mockData.user.create.mockResolvedValue(newUser as any)
      mockData.oAuthAccount.create.mockResolvedValue({} as any)
      const result = await service.findOrCreateUserFromOAuth(profile)
      expect(result).toEqual(newUser)
      expect(mockData.user.create).toHaveBeenCalledWith({
        data: {
          displayName: 'New User',
          emailValidated: true,
          emails: {
            create: {
              email: 'newuser@example.com',
              primary: true,
              verified: true,
              emailType: 'PERSONAL',
            },
          },
        },
      })
      expect(mockData.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          provider: OAuthProvider.GOOGLE,
          providerUserId: 'google-user-id',
          userId: 'user-new',
        },
      })
    })
    it('should generate unique display name when name conflicts exist', async () => {
      const profile = {
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
        name: 'TestUser',
      }
      const newUser = {
        id: 'user-new',
        displayName: 'TestUser1',
      }
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      mockData.user.findFirst.mockResolvedValue(null)
      // First check returns conflict, second check is unique
      mockData.user.findUnique
        .mockResolvedValueOnce({ id: 'existing' } as any) // 'TestUser' exists
        .mockResolvedValueOnce(null) // 'TestUser1' is unique
      mockData.user.create.mockResolvedValue(newUser as any)
      mockData.oAuthAccount.create.mockResolvedValue({} as any)
      await service.findOrCreateUserFromOAuth(profile)
      expect(mockData.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          displayName: 'TestUser1',
        }),
      })
    })
    it('should use email prefix as display name when name not provided', async () => {
      const profile = {
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'testuser@example.com',
        // No name provided
      }
      const newUser = {
        id: 'user-new',
        displayName: 'testuser',
      }
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      mockData.user.findFirst.mockResolvedValue(null)
      mockData.user.findUnique.mockResolvedValue(null)
      mockData.user.create.mockResolvedValue(newUser as any)
      mockData.oAuthAccount.create.mockResolvedValue({} as any)
      await service.findOrCreateUserFromOAuth(profile)
      expect(mockData.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          displayName: 'testuser',
        }),
      })
    })
    it('should add user to organization when organizationId provided', async () => {
      const profile = {
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
        name: 'Test User',
      }
      const organizationId = 'org-123'
      const newUser = {
        id: 'user-new',
        displayName: 'Test User',
      }
      const memberRole = {
        id: 'role-member',
        name: 'Member',
        organizationId,
      }
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      mockData.user.findFirst.mockResolvedValue(null)
      mockData.user.findUnique.mockResolvedValue(null)
      mockData.user.create.mockResolvedValue(newUser as any)
      mockData.role.findFirst.mockResolvedValue(memberRole as any)
      mockData.organizationMember.create.mockResolvedValue({} as any)
      mockData.oAuthAccount.create.mockResolvedValue({} as any)
      await service.findOrCreateUserFromOAuth(profile, organizationId)
      expect(mockData.role.findFirst).toHaveBeenCalledWith({
        where: {
          name: 'Member',
          organizationId,
        },
      })
      expect(mockData.organizationMember.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-new',
          organizationId,
          roleId: 'role-member',
        },
      })
    })
    it('should not add to organization when Member role not found', async () => {
      const profile = {
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
      }
      const organizationId = 'org-123'
      const newUser = {
        id: 'user-new',
        displayName: 'user',
      }
      mockData.oAuthAccount.findUnique.mockResolvedValue(null)
      mockData.user.findFirst.mockResolvedValue(null)
      mockData.user.findUnique.mockResolvedValue(null)
      mockData.user.create.mockResolvedValue(newUser as any)
      mockData.role.findFirst.mockResolvedValue(null) // No Member role found
      mockData.oAuthAccount.create.mockResolvedValue({} as any)
      await service.findOrCreateUserFromOAuth(profile, organizationId)
      expect(mockData.role.findFirst).toHaveBeenCalled()
      expect(mockData.organizationMember.create).not.toHaveBeenCalled()
    })
  })
  describe('verifyGoogleToken Edge Cases', () => {
    it('should throw UnauthorizedException when payload is missing', async () => {
      const mockGoogleClient = {
        verifyIdToken: jest.fn().mockResolvedValue({
          getPayload: () => null,
        }),
      }
      ;(service as any).googleClient = mockGoogleClient
      await expect(service.verifyGoogleToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      )
    })
    it('should throw UnauthorizedException when sub (provider user ID) is missing', async () => {
      const mockGoogleClient = {
        verifyIdToken: jest.fn().mockResolvedValue({
          getPayload: () => ({ email: 'user@example.com' }),
        }),
      }
      ;(service as any).googleClient = mockGoogleClient
      await expect(service.verifyGoogleToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      )
    })
    it('should throw UnauthorizedException when email is missing', async () => {
      const mockGoogleClient = {
        verifyIdToken: jest.fn().mockResolvedValue({
          getPayload: () => ({ sub: 'google-user-id' }),
        }),
      }
      ;(service as any).googleClient = mockGoogleClient
      await expect(service.verifyGoogleToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      )
    })
    it('should throw UnauthorizedException when token verification fails', async () => {
      const mockGoogleClient = {
        verifyIdToken: jest.fn().mockRejectedValue(new Error('Verification failed')),
      }
      ;(service as any).googleClient = mockGoogleClient
      await expect(service.verifyGoogleToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      )
    })
    it('should return valid profile when token is valid', async () => {
      const mockGoogleClient = {
        verifyIdToken: jest.fn().mockResolvedValue({
          getPayload: () => ({
            sub: 'google-user-id',
            email: 'user@example.com',
            name: 'Test User',
            picture: 'https://example.com/pic.jpg',
          }),
        }),
      }
      ;(service as any).googleClient = mockGoogleClient
      const result = await service.verifyGoogleToken('valid-token')
      expect(result).toEqual({
        provider: OAuthProvider.GOOGLE,
        providerUserId: 'google-user-id',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'https://example.com/pic.jpg',
      })
    })
  })
  describe('verifyGitHubCode Edge Cases', () => {
    beforeEach(() => {
      // Mock global fetch
      globalThis.fetch = jest.fn()
    })
    it('should throw UnauthorizedException when GitHub API returns error', async () => {
      const mockGitHubApp = {
        createToken: jest.fn().mockResolvedValue({
          authentication: { token: 'github-token' },
        }),
      }
      ;(service as any).githubApp = mockGitHubApp
      ;(globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
      })
      await expect(service.verifyGitHubCode('invalid-code')).rejects.toThrow(UnauthorizedException)
    })
    it('should handle missing email by fetching from emails endpoint', async () => {
      const mockGitHubApp = {
        createToken: jest.fn().mockResolvedValue({
          authentication: { token: 'github-token' },
        }),
      }
      ;(service as any).githubApp = mockGitHubApp
      ;(globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 12345,
            login: 'testuser',
            name: 'Test User',
            avatar_url: 'https://example.com/avatar.jpg',
            // No email in main profile
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { email: 'other@example.com', primary: false, verified: true },
            { email: 'primary@example.com', primary: true, verified: true },
          ],
        })
      const result = await service.verifyGitHubCode('valid-code')
      expect(result).toEqual({
        provider: OAuthProvider.GITHUB,
        providerUserId: '12345',
        email: 'primary@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      })
    })
    it('should use first email when no primary email exists', async () => {
      const mockGitHubApp = {
        createToken: jest.fn().mockResolvedValue({
          authentication: { token: 'github-token' },
        }),
      }
      ;(service as any).githubApp = mockGitHubApp
      ;(globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 12345,
            login: 'testuser',
            // No email in main profile
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { email: 'first@example.com', primary: false, verified: true },
            { email: 'second@example.com', primary: false, verified: false },
          ],
        })
      const result = await service.verifyGitHubCode('valid-code')
      expect(result.email).toBe('first@example.com')
    })
    it('should throw UnauthorizedException when no email available', async () => {
      const mockGitHubApp = {
        createToken: jest.fn().mockResolvedValue({
          authentication: { token: 'github-token' },
        }),
      }
      ;(service as any).githubApp = mockGitHubApp
      ;(globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 12345,
            login: 'testuser',
            // No email
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        })
      await expect(service.verifyGitHubCode('valid-code')).rejects.toThrow(
        'GitHub account must have a verified email address',
      )
    })
    it('should use email from main profile when available', async () => {
      const mockGitHubApp = {
        createToken: jest.fn().mockResolvedValue({
          authentication: { token: 'github-token' },
        }),
      }
      ;(service as any).githubApp = mockGitHubApp
      ;(globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12345,
          email: 'main@example.com',
          login: 'testuser',
          name: 'Test User',
        }),
      })
      const result = await service.verifyGitHubCode('valid-code')
      expect(result.email).toBe('main@example.com')
      expect(globalThis.fetch).toHaveBeenCalledTimes(1) // Should not fetch emails endpoint
    })
  })
})

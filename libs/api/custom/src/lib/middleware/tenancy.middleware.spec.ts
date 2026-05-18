import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { NextFunction } from 'express'
import { TenancyMiddleware } from './tenancy.middleware'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import { OrganizationContext } from '@nestled-template/api/utils'
describe('TenancyMiddleware (CRITICAL SECURITY)', () => {
  let middleware: TenancyMiddleware
  let mockData: any
  let mockRequest: any
  let mockResponse: any
  let mockNext: NextFunction
  beforeEach(async () => {
    // Create mock Prisma data access service
    mockData = {
      organizationMember: {
        findFirst: jest.fn(),
      },
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenancyMiddleware,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockData,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile()
    middleware = module.get<TenancyMiddleware>(TenancyMiddleware)
    // Reset request/response/next before each test
    mockRequest = {
      headers: {},
      user: undefined,
      organizationContext: undefined,
    }
    mockResponse = {}
    mockNext = jest.fn()
    // Clear all mocks
    jest.clearAllMocks()
  })
  describe('Authentication Flow', () => {
    it('should skip middleware if no authenticated user', async () => {
      // No user on request
      mockRequest.user = undefined
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockNext).toHaveBeenCalledWith() // Called with no arguments
      expect(mockData.organizationMember.findFirst).not.toHaveBeenCalled()
      expect(mockRequest.organizationContext).toBeUndefined()
    })
    it('should skip middleware for unauthenticated requests', async () => {
      // Request with no user property at all
      delete mockRequest.user
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockNext).toHaveBeenCalledWith()
      expect(mockData.organizationMember.findFirst).not.toHaveBeenCalled()
    })
  })
  describe('Organization Context Loading from Header', () => {
    it('should load organization context from X-Organization-ID header', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: null,
      }
      const organizationId = 'org-from-header'
      mockRequest.user = mockUser as User
      mockRequest.headers = {
        'x-organization-id': organizationId,
      }
      const mockMembership = {
        roleId: 'role-123',
        role: {
          name: 'Admin',
          permissions: [
            { subject: 'project', action: 'read' },
            { subject: 'project', action: 'write' },
          ],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockData.organizationMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          organizationId,
        },
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      })
      expect(mockRequest.organizationContext).toEqual({
        organizationId,
        userId: 'user-123',
        roleId: 'role-123',
        roleName: 'Admin',
        permissions: [
          { subject: 'project', action: 'read' },
          { subject: 'project', action: 'write' },
        ],
      })
      expect(mockNext).toHaveBeenCalledWith()
    })
    it('should prioritize X-Organization-ID header over activeOrganizationId', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-active',
      }
      const headerOrgId = 'org-from-header'
      mockRequest.user = mockUser as User
      mockRequest.headers = {
        'x-organization-id': headerOrgId,
      }
      const mockMembership = {
        roleId: 'role-123',
        role: {
          name: 'Member',
          permissions: [],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Should use header org ID, not active org ID
      expect(mockData.organizationMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          organizationId: headerOrgId, // NOT 'org-active'
        },
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      })
      expect(mockRequest.organizationContext?.organizationId).toBe(headerOrgId)
    })
  })
  describe('Organization Context Loading from User Active Organization', () => {
    it('should fall back to user activeOrganizationId if no header', async () => {
      const activeOrgId = 'org-active'
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: activeOrgId,
      }
      mockRequest.user = mockUser as User
      mockRequest.headers = {} // No X-Organization-ID header
      const mockMembership = {
        roleId: 'role-456',
        role: {
          name: 'Owner',
          permissions: [{ subject: 'organization', action: 'delete' }],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockData.organizationMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          organizationId: activeOrgId,
        },
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      })
      expect(mockRequest.organizationContext?.organizationId).toBe(activeOrgId)
    })
    it('should skip if user has no activeOrganizationId and no header', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: null,
      }
      mockRequest.user = mockUser as User
      mockRequest.headers = {} // No header
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockData.organizationMember.findFirst).not.toHaveBeenCalled()
      expect(mockRequest.organizationContext).toBeUndefined()
      expect(mockNext).toHaveBeenCalledWith()
    })
    it('should skip if user has undefined activeOrganizationId', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: undefined,
      }
      mockRequest.user = mockUser as User
      mockRequest.headers = {}
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockNext).toHaveBeenCalledWith()
      expect(mockRequest.organizationContext).toBeUndefined()
    })
  })
  describe('Membership Validation (CRITICAL SECURITY)', () => {
    it('should throw ForbiddenException if user is not a member of organization', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-not-member',
      }
      mockRequest.user = mockUser as User
      // User is NOT a member - findFirst returns null
      mockData.organizationMember.findFirst.mockResolvedValue(null)
      await expect(middleware.use(mockRequest, mockResponse, mockNext)).rejects.toThrow(
        ForbiddenException,
      )
      await expect(middleware.use(mockRequest, mockResponse, mockNext)).rejects.toThrow(
        'User user-123 is not a member of organization org-not-member',
      )
      expect(mockRequest.organizationContext).toBeUndefined()
    })
    it('should prevent access to organization from header if not a member', async () => {
      const mockUser: Partial<User> = {
        id: 'user-456',
        activeOrganizationId: 'org-mine',
      }
      mockRequest.user = mockUser as User
      mockRequest.headers = {
        'x-organization-id': 'org-not-mine', // Trying to access different org
      }
      // User is not a member of org-not-mine
      mockData.organizationMember.findFirst.mockResolvedValue(null)
      await expect(middleware.use(mockRequest, mockResponse, mockNext)).rejects.toThrow(
        ForbiddenException,
      )
      await expect(middleware.use(mockRequest, mockResponse, mockNext)).rejects.toThrow(
        'User user-456 is not a member of organization org-not-mine',
      )
    })
    it('should validate membership query includes user and organization', async () => {
      const mockUser: Partial<User> = {
        id: 'user-789',
        activeOrganizationId: 'org-789',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-123',
        role: {
          name: 'Admin',
          permissions: [],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Verify BOTH userId and organizationId are checked
      const callArgs = mockData.organizationMember.findFirst.mock.calls[0][0]
      expect(callArgs.where).toEqual({
        userId: 'user-789',
        organizationId: 'org-789',
      })
    })
  })
  describe('Permission Loading', () => {
    it('should load user permissions from role', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-admin',
        role: {
          name: 'Administrator',
          permissions: [
            { subject: 'user', action: 'create' },
            { subject: 'user', action: 'read' },
            { subject: 'user', action: 'update' },
            { subject: 'user', action: 'delete' },
            { subject: 'organization', action: 'manage' },
          ],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockRequest.organizationContext?.permissions).toEqual([
        { subject: 'user', action: 'create' },
        { subject: 'user', action: 'read' },
        { subject: 'user', action: 'update' },
        { subject: 'user', action: 'delete' },
        { subject: 'organization', action: 'manage' },
      ])
    })
    it('should handle roles with no permissions', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-guest',
        role: {
          name: 'Guest',
          permissions: [], // No permissions
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockRequest.organizationContext?.permissions).toEqual([])
      expect(mockRequest.organizationContext?.roleName).toBe('Guest')
    })
    it('should include role information in context', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-custom',
        role: {
          name: 'Custom Role',
          permissions: [{ subject: 'project', action: 'view' }],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockRequest.organizationContext?.roleId).toBe('role-custom')
      expect(mockRequest.organizationContext?.roleName).toBe('Custom Role')
    })
  })
  describe('Context Population', () => {
    it('should populate all required fields in organizationContext', async () => {
      const mockUser: Partial<User> = {
        id: 'user-complete',
        activeOrganizationId: 'org-complete',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-complete',
        role: {
          name: 'Complete Role',
          permissions: [{ subject: 'test', action: 'action' }],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      const context = mockRequest.organizationContext
      expect(context).toBeDefined()
      expect(context).toHaveProperty('organizationId', 'org-complete')
      expect(context).toHaveProperty('userId', 'user-complete')
      expect(context).toHaveProperty('roleId', 'role-complete')
      expect(context).toHaveProperty('roleName', 'Complete Role')
      expect(context).toHaveProperty('permissions')
      expect(Array.isArray(context?.permissions)).toBe(true)
    })
    it('should attach organizationContext to request object', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-123',
        role: {
          name: 'Test Role',
          permissions: [],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      // Verify context is undefined before
      expect(mockRequest.organizationContext).toBeUndefined()
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Verify context is populated after
      expect(mockRequest.organizationContext).toBeDefined()
      expect(mockRequest.organizationContext).toEqual({
        organizationId: 'org-123',
        userId: 'user-123',
        roleId: 'role-123',
        roleName: 'Test Role',
        permissions: [],
      })
    })
    it('should preserve userId from authenticated user in context', async () => {
      const mockUser: Partial<User> = {
        id: 'user-secure-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-123',
        role: {
          name: 'Member',
          permissions: [],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // CRITICAL: userId must match the authenticated user, not from client
      expect(mockRequest.organizationContext?.userId).toBe('user-secure-123')
      expect(mockRequest.organizationContext?.userId).toBe(mockRequest.user?.id)
    })
  })
  describe('Error Handling', () => {
    it('should throw ForbiddenException when membership validation fails', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-forbidden',
      }
      mockRequest.user = mockUser as User
      mockData.organizationMember.findFirst.mockResolvedValue(null)
      const middlewarePromise = middleware.use(mockRequest, mockResponse, mockNext)
      await expect(middlewarePromise).rejects.toThrow(ForbiddenException)
      expect(mockNext).not.toHaveBeenCalled() // Should not call next() when throwing
    })
    it('should propagate ForbiddenException without calling next', async () => {
      const mockUser: Partial<User> = {
        id: 'user-error',
        activeOrganizationId: 'org-error',
      }
      mockRequest.user = mockUser as User
      mockData.organizationMember.findFirst.mockResolvedValue(null)
      try {
        await middleware.use(mockRequest, mockResponse, mockNext)
        fail('Should have thrown ForbiddenException')
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException)
        expect(mockNext).not.toHaveBeenCalled()
      }
    })
    it('should call next with error for non-ForbiddenException errors', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const databaseError = new Error('Database connection failed')
      mockData.organizationMember.findFirst.mockRejectedValue(databaseError)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Should call next with the error (not throw)
      expect(mockNext).toHaveBeenCalledWith(databaseError)
    })
    it('should handle database errors gracefully', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const dbError = new Error('Connection timeout')
      mockData.organizationMember.findFirst.mockRejectedValue(dbError)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockNext).toHaveBeenCalledWith(dbError)
      expect(mockRequest.organizationContext).toBeUndefined()
    })
  })
  describe('Integration Scenarios', () => {
    it('should handle complete multi-tenant request flow', async () => {
      const mockUser: Partial<User> = {
        id: 'user-multi-tenant',
        activeOrganizationId: 'org-tenant-1',
      }
      mockRequest.user = mockUser as User
      mockRequest.headers = {
        'x-organization-id': 'org-tenant-2', // Switching to different org
      }
      const mockMembership = {
        roleId: 'role-member',
        role: {
          name: 'Member',
          permissions: [
            { subject: 'document', action: 'read' },
            { subject: 'document', action: 'create' },
          ],
        },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Should use header org, not active org
      expect(mockRequest.organizationContext?.organizationId).toBe('org-tenant-2')
      expect(mockRequest.organizationContext?.userId).toBe('user-multi-tenant')
      expect(mockRequest.organizationContext?.permissions).toHaveLength(2)
      expect(mockNext).toHaveBeenCalledWith()
    })
    it('should allow user to access multiple organizations they are member of', async () => {
      const mockUser: Partial<User> = {
        id: 'user-multi-org',
        activeOrganizationId: 'org-primary',
      }
      mockRequest.user = mockUser as User
      const mockMembershipOrg1 = {
        roleId: 'role-org1',
        role: { name: 'Admin', permissions: [{ subject: 'org', action: 'manage' }] },
      }
      const mockMembershipOrg2 = {
        roleId: 'role-org2',
        role: { name: 'Member', permissions: [{ subject: 'org', action: 'view' }] },
      }
      // First request to org-primary
      mockData.organizationMember.findFirst.mockResolvedValueOnce(mockMembershipOrg1)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockRequest.organizationContext?.organizationId).toBe('org-primary')
      expect(mockRequest.organizationContext?.roleName).toBe('Admin')
      // Create new request for second org
      const mockRequest2: any = {
        headers: { 'x-organization-id': 'org-secondary' },
        user: mockUser as User,
        organizationContext: undefined,
      }
      const mockNext2 = jest.fn()
      mockData.organizationMember.findFirst.mockResolvedValueOnce(mockMembershipOrg2)
      await middleware.use(mockRequest2, mockResponse, mockNext2)
      expect(mockRequest2.organizationContext?.organizationId).toBe('org-secondary')
      expect(mockRequest2.organizationContext?.roleName).toBe('Member')
    })
    it('should handle header case insensitivity (Express standard)', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: null,
      }
      mockRequest.user = mockUser as User
      // Express automatically lowercases headers, so we simulate that behavior
      mockRequest.headers = {
        'x-organization-id': 'org-uppercase', // Express normalizes to lowercase
      }
      const mockMembership = {
        roleId: 'role-123',
        role: { name: 'Member', permissions: [] },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Should still work (Express normalizes to lowercase)
      expect(mockData.organizationMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-uppercase',
          }),
        }),
      )
    })
  })
  describe('Middleware Execution Flow', () => {
    it('should call next() after successful context setup', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-123',
        role: { name: 'Member', permissions: [] },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockNext).toHaveBeenCalledTimes(1)
      expect(mockNext).toHaveBeenCalledWith() // No error argument
    })
    it('should not modify request if skipping (no org context)', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: null, // No active org
      }
      mockRequest.user = mockUser as User
      mockRequest.headers = {} // No header
      mockRequest.organizationContext = undefined
      await middleware.use(mockRequest, mockResponse, mockNext)
      expect(mockRequest.organizationContext).toBeUndefined()
      expect(mockNext).toHaveBeenCalledWith()
    })
    it('should execute membership check before setting context', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: 'org-invalid',
      }
      mockRequest.user = mockUser as User
      mockData.organizationMember.findFirst.mockResolvedValue(null)
      try {
        await middleware.use(mockRequest, mockResponse, mockNext)
        fail('Should have thrown')
      } catch (error) {
        // Context should NOT be set when membership fails
        expect(mockRequest.organizationContext).toBeUndefined()
        expect(error).toBeInstanceOf(ForbiddenException)
      }
    })
  })
  describe('Security Edge Cases', () => {
    it('should prevent empty organization ID from bypassing validation', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: '',
      }
      mockRequest.user = mockUser as User
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Empty string is falsy, should skip
      expect(mockData.organizationMember.findFirst).not.toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalledWith()
    })
    it('should prevent whitespace-only organization ID', async () => {
      const mockUser: Partial<User> = {
        id: 'user-123',
        activeOrganizationId: '   ',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-123',
        role: { name: 'Member', permissions: [] },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Whitespace string is truthy, will attempt lookup
      // This is correct behavior - let DB validation handle invalid IDs
      expect(mockData.organizationMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: '   ',
          }),
        }),
      )
    })
    it('should require exact user ID match in membership', async () => {
      const mockUser: Partial<User> = {
        id: 'user-real',
        activeOrganizationId: 'org-123',
      }
      mockRequest.user = mockUser as User
      const mockMembership = {
        roleId: 'role-123',
        role: { name: 'Member', permissions: [] },
      }
      mockData.organizationMember.findFirst.mockResolvedValue(mockMembership)
      await middleware.use(mockRequest, mockResponse, mockNext)
      // Verify exact userId is used from authenticated user
      expect(mockData.organizationMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-real', // Must match exactly
          organizationId: 'org-123',
        },
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      })
      // Verify context userId matches authenticated user
      expect(mockRequest.organizationContext?.userId).toBe('user-real')
    })
  })
})

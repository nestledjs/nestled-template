import { Test, TestingModule } from '@nestjs/testing'
import { AdminService } from './admin.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { AdminUserFiltersInput } from './dto'
import { SecurityEventType } from '@nestled-template/api/core/models'
describe('AdminService', () => {
  let service: AdminService
  let mockData: any
  beforeEach(async () => {
    mockData = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      userSession: {
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      organizationMember: {
        count: jest.fn(),
      },
      teamMember: {
        count: jest.fn(),
      },
      securityEvent: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      subscription: {
        count: jest.fn(),
      },
      email: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockData,
        },
      ],
    }).compile()
    service = module.get<AdminService>(AdminService)
  })
  describe('getUsers', () => {
    it('should return paginated users with default filters', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          emails: [{ email: 'john@example.com', primary: true }],
        },
        {
          id: 'user-2',
          firstName: 'Jane',
          lastName: 'Smith',
          emails: [{ email: 'jane@example.com', primary: true }],
        },
      ]
      mockData.user.findMany.mockResolvedValue(mockUsers as any)
      mockData.user.count.mockResolvedValue(2)
      const filters: AdminUserFiltersInput = {}
      const result = await service.getUsers(filters)
      expect(result.users).toEqual(mockUsers)
      expect(result.total).toBe(2)
      expect(result.skip).toBe(0)
      expect(result.take).toBe(50)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 0,
          take: 50,
        }),
      )
    })
    it('should filter users by search text', async () => {
      mockData.user.findMany.mockResolvedValue([])
      mockData.user.count.mockResolvedValue(0)
      const filters: AdminUserFiltersInput = { search: 'john' }
      await service.getUsers(filters)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { id: { contains: 'john', mode: 'insensitive' } },
              { firstName: { contains: 'john', mode: 'insensitive' } },
              { lastName: { contains: 'john', mode: 'insensitive' } },
              { emails: { some: { email: { contains: 'john', mode: 'insensitive' } } } },
            ],
          },
        }),
      )
    })
    it('should filter users by organization', async () => {
      mockData.user.findMany.mockResolvedValue([])
      mockData.user.count.mockResolvedValue(0)
      const filters: AdminUserFiltersInput = { organizationId: 'org-123' }
      await service.getUsers(filters)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizations: {
              some: { organizationId: 'org-123' },
            },
          },
        }),
      )
    })
    it('should filter by superAdmin status', async () => {
      mockData.user.findMany.mockResolvedValue([])
      mockData.user.count.mockResolvedValue(0)
      const filters: AdminUserFiltersInput = { isSuperAdmin: true }
      await service.getUsers(filters)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isSuperAdmin: true },
        }),
      )
    })
    it('should filter by 2FA enabled status', async () => {
      mockData.user.findMany.mockResolvedValue([])
      mockData.user.count.mockResolvedValue(0)
      const filters: AdminUserFiltersInput = { twoFactorEnabled: true }
      await service.getUsers(filters)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { twoFactorEnabled: true },
        }),
      )
    })
    it('should filter by account locked status', async () => {
      mockData.user.findMany.mockResolvedValue([])
      mockData.user.count.mockResolvedValue(0)
      const filters: AdminUserFiltersInput = { accountLocked: true }
      await service.getUsers(filters)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            lockedUntil: { gt: expect.any(Date) },
          },
        }),
      )
    })
    it('should filter by registration date range', async () => {
      mockData.user.findMany.mockResolvedValue([])
      mockData.user.count.mockResolvedValue(0)
      const registeredAfter = new Date('2024-01-01')
      const registeredBefore = new Date('2024-12-31')
      const filters: AdminUserFiltersInput = { registeredAfter, registeredBefore }
      await service.getUsers(filters)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: registeredAfter,
              lte: registeredBefore,
            },
          },
        }),
      )
    })
    it('should support custom pagination and sorting', async () => {
      mockData.user.findMany.mockResolvedValue([])
      mockData.user.count.mockResolvedValue(100)
      const filters: AdminUserFiltersInput = {
        skip: 20,
        take: 10,
        sortBy: 'firstName',
        sortOrder: 'asc',
      }
      const result = await service.getUsers(filters)
      expect(result.skip).toBe(20)
      expect(result.take).toBe(10)
      expect(mockData.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          orderBy: { firstName: 'asc' },
        }),
      )
    })
  })
  describe('getOrganizations', () => {
    it('should return paginated organizations', async () => {
      const mockOrganizations = [
        { id: 'org-1', name: 'Organization 1', members: [] },
        { id: 'org-2', name: 'Organization 2', members: [] },
      ]
      mockData.organization.findMany.mockResolvedValue(mockOrganizations as any)
      mockData.organization.count.mockResolvedValue(2)
      const result = await service.getOrganizations({})
      expect(result.organizations).toEqual(mockOrganizations)
      expect(result.total).toBe(2)
      expect(result.skip).toBe(0)
      expect(result.take).toBe(50)
    })
    it('should filter organizations by search text', async () => {
      mockData.organization.findMany.mockResolvedValue([])
      mockData.organization.count.mockResolvedValue(0)
      await service.getOrganizations({ search: 'acme' })
      expect(mockData.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { contains: 'acme', mode: 'insensitive' } },
        }),
      )
    })
    it('should support custom pagination', async () => {
      mockData.organization.findMany.mockResolvedValue([])
      mockData.organization.count.mockResolvedValue(100)
      const result = await service.getOrganizations({ skip: 10, take: 5 })
      expect(result.skip).toBe(10)
      expect(result.take).toBe(5)
    })
  })
  describe('getUserDetails', () => {
    it('should return detailed user information', async () => {
      const mockUser = {
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        emails: [{ email: 'john@example.com', primary: true }],
        organizations: [],
        TeamMember: [],
        activeSessions: [],
        AuditLog: [],
      }
      mockData.user.findUnique.mockResolvedValue(mockUser as any)
      const result = await service.getUserDetails('user-123')
      expect(result).toEqual(mockUser)
      expect(mockData.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: expect.objectContaining({
          emails: true,
          organizations: expect.any(Object),
          activeSessions: expect.any(Object),
          AuditLog: expect.any(Object),
        }),
      })
    })
    it('should throw error when user not found', async () => {
      mockData.user.findUnique.mockResolvedValue(null)
      await expect(service.getUserDetails('non-existent')).rejects.toThrow(
        'User non-existent not found',
      )
    })
  })
  describe('getUserStats', () => {
    it('should return user activity statistics', async () => {
      mockData.userSession.count.mockResolvedValue(10)
      mockData.auditLog.count.mockResolvedValue(50)
      mockData.organizationMember.count.mockResolvedValue(3)
      mockData.teamMember.count.mockResolvedValue(2)
      const result = await service.getUserStats('user-123')
      expect(result).toEqual({
        totalSessions: 10,
        totalAuditLogs: 50,
        organizationCount: 3,
        teamCount: 2,
      })
    })
  })
  describe('getSecurityEvents', () => {
    it('should return filtered security events', async () => {
      const mockEvents = [
        { id: 'event-1', eventType: SecurityEventType.PASSWORD_CHANGED, userId: 'user-123' },
        { id: 'event-2', eventType: SecurityEventType.EMAIL_CHANGED, userId: 'user-123' },
      ]
      mockData.securityEvent.findMany.mockResolvedValue(mockEvents as any)
      mockData.securityEvent.count.mockResolvedValue(2)
      const result = await service.getSecurityEvents({ userId: 'user-123' })
      expect(result.events).toEqual(mockEvents)
      expect(result.total).toBe(2)
    })
    it('should filter by event type', async () => {
      mockData.securityEvent.findMany.mockResolvedValue([])
      mockData.securityEvent.count.mockResolvedValue(0)
      await service.getSecurityEvents({ eventType: SecurityEventType.PASSWORD_CHANGED })
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventType: SecurityEventType.PASSWORD_CHANGED },
        }),
      )
    })
    it('should filter by IP address', async () => {
      mockData.securityEvent.findMany.mockResolvedValue([])
      mockData.securityEvent.count.mockResolvedValue(0)
      await service.getSecurityEvents({ ipAddress: '192.168' })
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ipAddress: { contains: '192.168' } },
        }),
      )
    })
    it('should filter by date range', async () => {
      mockData.securityEvent.findMany.mockResolvedValue([])
      mockData.securityEvent.count.mockResolvedValue(0)
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-12-31')
      await service.getSecurityEvents({ startDate, endDate })
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
      )
    })
  })
  describe('getAuditLogs', () => {
    it('should return filtered audit logs', async () => {
      const mockLogs = [
        { id: 'log-1', action: 'CREATE', entityType: 'User', userId: 'user-123' },
        { id: 'log-2', action: 'UPDATE', entityType: 'Organization', userId: 'user-123' },
      ]
      mockData.auditLog.findMany.mockResolvedValue(mockLogs as any)
      mockData.auditLog.count.mockResolvedValue(2)
      const result = await service.getAuditLogs({ userId: 'user-123' })
      expect(result.logs).toEqual(mockLogs)
      expect(result.total).toBe(2)
    })
    it('should filter by organization', async () => {
      mockData.auditLog.findMany.mockResolvedValue([])
      mockData.auditLog.count.mockResolvedValue(0)
      await service.getAuditLogs({ organizationId: 'org-123' })
      expect(mockData.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-123' },
        }),
      )
    })
    it('should filter by action and entity type', async () => {
      mockData.auditLog.findMany.mockResolvedValue([])
      mockData.auditLog.count.mockResolvedValue(0)
      await service.getAuditLogs({ action: 'CREATE', entityType: 'User' })
      expect(mockData.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            action: { contains: 'CREATE', mode: 'insensitive' },
            entityType: { contains: 'User', mode: 'insensitive' },
          },
        }),
      )
    })
  })
  describe('getDashboardStats', () => {
    it('should return platform-wide dashboard statistics', async () => {
      mockData.user.count.mockResolvedValue(150)
      mockData.organization.count.mockResolvedValue(30)
      mockData.userSession.count.mockResolvedValue(45)
      mockData.securityEvent.count.mockResolvedValue(12)
      mockData.subscription.count.mockResolvedValue(25)
      const result = await service.getDashboardStats()
      expect(result).toEqual({
        totalUsers: 150,
        totalOrganizations: 30,
        activeSessions: 45,
        recentSecurityEvents: 12,
        activeSubscriptions: 25,
      })
      // Verify security events query includes 24-hour filter
      expect(mockData.securityEvent.count).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expect.any(Date),
          },
        },
      })
    })
  })
  describe('deactivateUser', () => {
    it('should deactivate a user account', async () => {
      const mockUser = {
        id: 'user-123',
        isActive: false,
        deactivatedAt: new Date(),
        emails: [],
      }
      mockData.user.update.mockResolvedValue(mockUser as any)
      const result = await service.deactivateUser('user-123')
      expect(result.isActive).toBe(false)
      expect(result.deactivatedAt).toBeDefined()
      expect(mockData.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          isActive: false,
          deactivatedAt: expect.any(Date),
        },
        include: { emails: true },
      })
    })
  })
  describe('activateUser', () => {
    it('should activate a user account', async () => {
      const mockUser = {
        id: 'user-123',
        isActive: true,
        deactivatedAt: null,
        emails: [],
      }
      mockData.user.update.mockResolvedValue(mockUser as any)
      const result = await service.activateUser('user-123')
      expect(result.isActive).toBe(true)
      expect(result.deactivatedAt).toBeNull()
      expect(mockData.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          isActive: true,
          deactivatedAt: null,
        },
        include: { emails: true },
      })
    })
  })
  describe('verifyEmail', () => {
    it('should manually verify a user email', async () => {
      const mockEmail = {
        id: 'email-123',
        email: 'user@example.com',
        primary: true,
        verified: true,
      }
      const mockUser = {
        id: 'user-123',
        emailValidated: true,
        emails: [mockEmail],
      }
      mockData.email.update.mockResolvedValue({} as any)
      mockData.email.findUnique.mockResolvedValue(mockEmail as any)
      mockData.user.update.mockResolvedValue({} as any)
      mockData.user.findUnique.mockResolvedValue(mockUser as any)
      const result = await service.verifyEmail('user-123', 'email-123')
      expect(result.emailValidated).toBe(true)
      expect(mockData.email.update).toHaveBeenCalledWith({
        where: { id: 'email-123' },
        data: {
          verified: true,
          verifyToken: null,
          verifyExpires: null,
        },
      })
    })
    it('should update user emailValidated flag for primary email', async () => {
      const mockEmail = {
        id: 'email-123',
        primary: true,
      }
      mockData.email.update.mockResolvedValue({} as any)
      mockData.email.findUnique.mockResolvedValue(mockEmail as any)
      mockData.user.update.mockResolvedValue({} as any)
      mockData.user.findUnique.mockResolvedValue({
        id: 'user-123',
        emails: [],
      } as any)
      await service.verifyEmail('user-123', 'email-123')
      expect(mockData.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { emailValidated: true },
      })
    })
    it('should not update emailValidated for non-primary email', async () => {
      const mockEmail = {
        id: 'email-123',
        primary: false,
      }
      mockData.email.update.mockResolvedValue({} as any)
      mockData.email.findUnique.mockResolvedValue(mockEmail as any)
      mockData.user.findUnique.mockResolvedValue({
        id: 'user-123',
        emails: [],
      } as any)
      await service.verifyEmail('user-123', 'email-123')
      expect(mockData.user.update).not.toHaveBeenCalled()
    })
  })
  describe('forcePasswordReset', () => {
    it('should force password reset for a user', async () => {
      const mockUser = {
        id: 'user-123',
        passwordResetToken: 'reset-token',
        passwordResetExpires: new Date(),
        emails: [],
      }
      mockData.user.update.mockResolvedValue(mockUser as any)
      mockData.userSession.updateMany.mockResolvedValue({ count: 3 } as any)
      const result = await service.forcePasswordReset('user-123')
      expect(result.passwordResetToken).toBeDefined()
      expect(result.passwordResetExpires).toBeDefined()
      expect(mockData.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: {
            passwordResetToken: expect.any(String),
            passwordResetExpires: expect.any(Date),
          },
        }),
      )
    })
    it('should invalidate all active sessions when forcing password reset', async () => {
      mockData.user.update.mockResolvedValue({
        id: 'user-123',
        emails: [],
      } as any)
      mockData.userSession.updateMany.mockResolvedValue({ count: 5 } as any)
      await service.forcePasswordReset('user-123')
      expect(mockData.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isValid: true,
        },
        data: {
          isValid: false,
        },
      })
    })
    it('should generate unique reset tokens', async () => {
      let firstToken: string
      let secondToken: string
      mockData.user.update.mockImplementation((args: any) => {
        const token = args.data.passwordResetToken
        if (!firstToken) {
          firstToken = token
        } else {
          secondToken = token
        }
        return Promise.resolve({ id: 'user-123', passwordResetToken: token, emails: [] } as any)
      })
      mockData.userSession.updateMany.mockResolvedValue({ count: 0 } as any)
      await service.forcePasswordReset('user-1')
      await service.forcePasswordReset('user-2')
      expect(firstToken!).toBeDefined()
      expect(secondToken!).toBeDefined()
      expect(firstToken!).not.toEqual(secondToken!)
    })
  })
})

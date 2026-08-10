import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrganizationService } from './organization.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { EmailService } from '@nestled-template/api/integrations'
describe('OrganizationService', () => {
  let service: OrganizationService
  let data: any // Use any to avoid Prisma type conflicts with Jest mocks
  let emailService: jest.Mocked<EmailService>
  beforeEach(async () => {
    // Create mock data service - cast to any to avoid TypeScript strictness
    const mockData: any = {
      organization: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      role: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
      organizationMember: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      invite: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      email: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((arg: any) => {
        // Handle both callback and array forms
        if (typeof arg === 'function') {
          return arg(mockData)
        }
        return Promise.all(arg)
      }),
    }
    const mockEmailService = {
      sendTemplate: jest.fn().mockResolvedValue(true),
    }
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          'app.name': 'Test App',
          siteUrl: 'http://localhost:3000',
        }
        return config[key]
      }),
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: ApiCoreDataAccessService, useValue: mockData },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()
    service = module.get<OrganizationService>(OrganizationService)
    data = module.get(ApiCoreDataAccessService)
    emailService = module.get(EmailService) as jest.Mocked<EmailService>
  })
  afterEach(() => {
    jest.clearAllMocks()
  })
  describe('userCreateOrganization', () => {
    it('should create organization with Owner role and member', async () => {
      const userId = 'user-123'
      const input = { name: 'Test Org' }
      // Mock organization creation
      data.organization.create.mockResolvedValue({
        id: 'org-123',
        name: 'Test Org',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      // Mock permissions retrieval
      data.permission.findMany.mockResolvedValue([
        { id: 'perm-1', subject: 'member', action: 'read' },
        { id: 'perm-2', subject: 'member', action: 'invite' },
      ] as any)
      // Mock role creation
      data.role.create.mockResolvedValue({ id: 'role-123' } as any)
      // Mock finding Owner role
      data.role.findFirst.mockResolvedValue({
        id: 'role-owner',
        name: 'Owner',
        organizationId: 'org-123',
      } as any)
      // Mock member creation
      data.organizationMember.create.mockResolvedValue({} as any)
      // Mock user without active org
      data.user.findUnique.mockResolvedValue({
        id: userId,
        activeOrganizationId: null,
      } as any)
      // Mock user update
      data.user.update.mockResolvedValue({} as any)
      const result = await service.userCreateOrganization(userId, input)
      expect(result.name).toBe('Test Org')
      expect(data.organization.create).toHaveBeenCalledWith({
        data: { name: 'Test Org' },
      })
      expect(data.organizationMember.create).toHaveBeenCalledWith({
        data: {
          userId,
          organizationId: 'org-123',
          roleId: 'role-owner',
        },
      })
      expect(data.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { activeOrganizationId: 'org-123' },
      })
    })
    it('should not update active org if user already has one', async () => {
      const userId = 'user-123'
      const input = { name: 'Test Org' }
      data.organization.create.mockResolvedValue({ id: 'org-123', name: 'Test Org' } as any)
      data.permission.findMany.mockResolvedValue([])
      data.role.findFirst.mockResolvedValue({ id: 'role-owner', name: 'Owner' } as any)
      data.organizationMember.create.mockResolvedValue({} as any)
      // User already has active org
      data.user.findUnique.mockResolvedValue({
        id: userId,
        activeOrganizationId: 'existing-org',
      } as any)
      await service.userCreateOrganization(userId, input)
      expect(data.user.update).not.toHaveBeenCalled()
    })
  })
  describe('userUpdateOrganization', () => {
    it('should update organization when user is owner', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      const input = { name: 'Updated Name' }
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        role: { name: 'Owner' },
      } as any)
      data.organization.update.mockResolvedValue({
        id: organizationId,
        name: 'Updated Name',
      } as any)
      const result = await service.userUpdateOrganization(userId, organizationId, input)
      expect(result.name).toBe('Updated Name')
      expect(data.organization.update).toHaveBeenCalledWith({
        where: { id: organizationId },
        data: { name: 'Updated Name' },
      })
      expect(data.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          organizationId,
          entityId: organizationId,
          entityType: 'Organization',
          action: 'ORGANIZATION_UPDATED',
        }),
      })
    })
    it('should throw ForbiddenException when user is not owner', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      const input = { name: 'Updated Name' }
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        role: { name: 'Admin' },
      } as any)
      await expect(service.userUpdateOrganization(userId, organizationId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('userDeleteOrganization', () => {
    it('should delete organization when user is owner', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      // Mock owner check
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        role: { name: 'Owner' },
      } as any)
      data.invite.deleteMany.mockResolvedValue({ count: 2 } as any)
      data.organizationMember.deleteMany.mockResolvedValue({ count: 5 } as any)
      data.role.deleteMany.mockResolvedValue({ count: 3 } as any)
      data.organization.delete.mockResolvedValue({} as any)
      data.user.findUnique.mockResolvedValue({
        id: userId,
        activeOrganizationId: organizationId,
      } as any)
      data.user.update.mockResolvedValue({} as any)
      const result = await service.userDeleteOrganization(userId, organizationId)
      expect(result).toBe(true)
      expect(data.invite.deleteMany).toHaveBeenCalledWith({ where: { organizationId } })
      expect(data.organizationMember.deleteMany).toHaveBeenCalledWith({ where: { organizationId } })
      expect(data.role.deleteMany).toHaveBeenCalledWith({ where: { organizationId } })
      expect(data.organization.delete).toHaveBeenCalledWith({ where: { id: organizationId } })
      expect(data.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { activeOrganizationId: null },
      })
    })
    it('should throw ForbiddenException when user is not owner', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      // Not an owner
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        role: { name: 'Admin' },
      } as any)
      await expect(service.userDeleteOrganization(userId, organizationId)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('addOrganizationMember', () => {
    it('should add member when user has invite permission', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'new-user-456',
        roleId: 'role-member',
      }
      // Has invite permission
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'invite' }] },
        } as any)
        .mockResolvedValueOnce(null) // No existing member
      data.organizationMember.create.mockResolvedValue({} as any)
      const result = await service.addOrganizationMember(userId, input)
      expect(result).toBe(true)
      expect(data.organizationMember.create).toHaveBeenCalledWith({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          roleId: input.roleId,
        },
      })
    })
    it('should throw BadRequestException if user is already a member', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'existing-user',
        roleId: 'role-member',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'invite' }] },
        } as any)
        .mockResolvedValueOnce({ id: 'existing-member' } as any) // Already a member
      await expect(service.addOrganizationMember(userId, input)).rejects.toThrow(
        BadRequestException,
      )
    })
  })
  describe('removeOrganizationMember', () => {
    it('should remove member when user has permission', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'target-user-456',
      }
      // Has remove permission
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'remove' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Member' } } as any) // Target is not owner
        .mockResolvedValueOnce({ id: 'member-to-delete' } as any) // Find member to delete
      data.organizationMember.delete.mockResolvedValue({} as any)
      const result = await service.removeOrganizationMember(userId, input)
      expect(result).toBe(true)
      expect(data.organizationMember.delete).toHaveBeenCalledWith({
        where: { id: 'member-to-delete' },
      })
      expect(data.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          organizationId: input.organizationId,
          entityId: input.userId,
          entityType: 'OrganizationMember',
          action: 'ORGANIZATION_MEMBER_REMOVED',
        }),
      })
    })
    it('should throw BadRequestException when trying to remove self', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'user-123', // Same as caller
      }
      data.organizationMember.findFirst.mockResolvedValueOnce({
        role: { permissions: [{ subject: 'member', action: 'remove' }] },
      } as any)
      await expect(service.removeOrganizationMember(userId, input)).rejects.toThrow(
        BadRequestException,
      )
    })
    it('should throw BadRequestException when trying to remove owner', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'owner-user',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'remove' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Owner' } } as any) // Target IS owner
      await expect(service.removeOrganizationMember(userId, input)).rejects.toThrow(
        BadRequestException,
      )
    })
  })
  describe('updateOrganizationMemberRole', () => {
    it('should update member role when user has permission', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'target-user',
        roleId: 'new-role-id',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'update' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Member' } } as any) // Not owner
        .mockResolvedValueOnce({ id: 'member-to-update', roleId: 'old-role-id' } as any)
      data.organizationMember.update.mockResolvedValue({} as any)
      const result = await service.updateOrganizationMemberRole(userId, input)
      expect(result).toBe(true)
      expect(data.organizationMember.update).toHaveBeenCalledWith({
        where: { id: 'member-to-update' },
        data: { roleId: 'new-role-id' },
      })
      expect(data.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          organizationId: input.organizationId,
          entityId: input.userId,
          entityType: 'OrganizationMember',
          action: 'ORGANIZATION_MEMBER_ROLE_UPDATED',
          changes: expect.objectContaining({
            roleId: { before: 'old-role-id', after: 'new-role-id' },
          }),
        }),
      })
    })
    it('should throw BadRequestException when trying to change owner role', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'owner-user',
        roleId: 'new-role-id',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'update' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Owner' } } as any) // Target IS owner
      await expect(service.updateOrganizationMemberRole(userId, input)).rejects.toThrow(
        BadRequestException,
      )
    })
  })
  describe('createOrganizationInvitation', () => {
    it('should create invitation and send email', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        email: 'newuser@example.com',
        roleId: 'role-member',
      }
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)
      data.invite.findFirst.mockResolvedValue(null) // No existing invitation
      data.invite.create.mockResolvedValue({
        id: 'invite-123',
        token: 'mock-token',
      } as any)
      data.organization.findUnique.mockResolvedValue({
        id: 'org-123',
        name: 'Test Org',
      } as any)
      data.user.findUnique.mockResolvedValue({
        id: userId,
        firstName: 'John',
        displayName: 'John Doe',
      } as any)
      const token = await service.createOrganizationInvitation(userId, input)
      expect(token).toBeTruthy()
      expect(data.invite.create).toHaveBeenCalled()
      expect(data.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          organizationId: input.organizationId,
          entityId: 'invite-123',
          entityType: 'Invite',
          action: 'ORGANIZATION_INVITATION_CREATED',
        }),
      })
      expect(emailService.sendTemplate).toHaveBeenCalledWith(
        'newuser@example.com',
        expect.objectContaining({
          templateId: 'organization-invitation',
          variables: expect.objectContaining({
            organizationName: 'Test Org',
            inviterName: 'John',
          }),
        }),
      )
    })
    it('should throw BadRequestException if invitation already exists', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        email: 'existing@example.com',
        roleId: 'role-member',
      }
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)
      // Existing pending invitation
      data.invite.findFirst.mockResolvedValue({
        id: 'existing-invite',
        status: 'PENDING',
      } as any)
      await expect(service.createOrganizationInvitation(userId, input)).rejects.toThrow(
        BadRequestException,
      )
    })
    it('should reject owner invitations from non-owner admins', async () => {
      const userId = 'admin-user'
      const input = {
        organizationId: 'org-123',
        email: 'owner@example.com',
        roleId: 'role-owner',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'invite' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Admin' } } as any)
      data.role.findFirst.mockResolvedValue({ name: 'Owner' } as any)

      await expect(service.createOrganizationInvitation(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
      expect(data.invite.create).not.toHaveBeenCalled()
    })
  })
  describe('acceptOrganizationInvitation', () => {
    it('should accept valid invitation and add user to organization', async () => {
      const userId = 'user-123'
      const input = { token: 'valid-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        token: 'valid-token',
        email: 'user@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10000), // Not expired
        organizationId: 'org-123',
        roleId: 'role-member',
        organization: { id: 'org-123', name: 'Test Org' },
        role: { name: 'Member' },
      } as any)
      data.email.findFirst.mockResolvedValue({
        email: 'user@example.com',
        primary: true,
      } as any)
      data.organizationMember.findFirst.mockResolvedValue(null) // Not already a member
      data.organizationMember.create.mockResolvedValue({} as any)
      data.invite.update.mockResolvedValue({} as any)
      data.user.findUnique.mockResolvedValue({
        id: userId,
        activeOrganizationId: null,
      } as any)
      data.user.update.mockResolvedValue({} as any)
      const result = await service.acceptOrganizationInvitation(userId, input)
      expect(result.name).toBe('Test Org')
      expect(data.organizationMember.create).toHaveBeenCalled()
      expect(data.invite.update).toHaveBeenCalledWith({
        where: { id: 'invite-123' },
        data: { status: 'ACCEPTED' },
      })
    })
    it('should throw BadRequestException for expired invitation', async () => {
      const userId = 'user-123'
      const input = { token: 'expired-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 10000), // Expired
      } as any)
      data.invite.update.mockResolvedValue({} as any)
      await expect(service.acceptOrganizationInvitation(userId, input)).rejects.toThrow(
        BadRequestException,
      )
      // Should mark as expired
      expect(data.invite.update).toHaveBeenCalledWith({
        where: { id: 'invite-123' },
        data: { status: 'EXPIRED' },
      })
    })
    it('should throw BadRequestException if email does not match', async () => {
      const userId = 'user-123'
      const input = { token: 'valid-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10000),
      } as any)
      data.email.findFirst.mockResolvedValue({
        email: 'different@example.com', // Different email
        primary: true,
      } as any)
      await expect(service.acceptOrganizationInvitation(userId, input)).rejects.toThrow(
        BadRequestException,
      )
    })
  })
  describe('switchActiveOrganization', () => {
    it('should switch active organization when user is a member', async () => {
      const userId = 'user-123'
      const input = { organizationId: 'org-456' }
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'member-123',
      } as any)
      data.user.update.mockResolvedValue({
        id: userId,
        activeOrganizationId: 'org-456',
      } as any)
      const result = await service.switchActiveOrganization(userId, input)
      expect(result.activeOrganizationId).toBe('org-456')
      expect(data.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { activeOrganizationId: 'org-456' },
      })
    })
    it('should throw ForbiddenException when user is not a member', async () => {
      const userId = 'user-123'
      const input = { organizationId: 'org-456' }
      data.organizationMember.findFirst.mockResolvedValue(null) // Not a member
      await expect(service.switchActiveOrganization(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('getUserOrganizations', () => {
    it('should return all organizations for user', async () => {
      const userId = 'user-123'
      data.organizationMember.findMany.mockResolvedValue([
        {
          organization: { id: 'org-1', name: 'Org 1', logo: { id: 'logo-1' }, images: [] },
          role: { name: 'Owner' },
        },
        {
          organization: { id: 'org-2', name: 'Org 2', logo: null, images: [] },
          role: { name: 'Member' },
        },
      ] as any)
      const result = await service.getUserOrganizations(userId)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Org 1')
      expect(result[0].logo).toEqual({ id: 'logo-1' })
      expect(result[1].name).toBe('Org 2')
      expect(data.organizationMember.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          organization: {
            include: {
              logo: true,
              images: true,
            },
          },
          role: true,
        },
      })
    })
  })
  describe('transferOrganizationOwnership', () => {
    it('should transfer ownership when current user is owner', async () => {
      const userId = 'current-owner'
      const input = {
        organizationId: 'org-123',
        newOwnerUserId: 'new-owner',
      }
      // Current user is owner
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          id: 'member-current',
          role: { name: 'Owner' },
        } as any)
        .mockResolvedValueOnce({
          id: 'member-new',
          roleId: 'role-admin',
          role: { name: 'Admin' },
        } as any)
        .mockResolvedValueOnce({
          id: 'member-current',
        } as any)
      data.role.findFirst.mockResolvedValue({
        id: 'role-owner',
        name: 'Owner',
      } as any)
      data.$transaction.mockImplementation((arg: any) => {
        // Handle both callback and array forms
        if (typeof arg === 'function') {
          return arg(data)
        }
        return Promise.all(arg)
      })
      data.organizationMember.update.mockResolvedValue({} as any)
      const result = await service.transferOrganizationOwnership(userId, input)
      expect(result).toBe(true)
      expect(data.$transaction).toHaveBeenCalled()
    })
    it('should throw ForbiddenException when current user is not owner', async () => {
      const userId = 'not-owner'
      const input = {
        organizationId: 'org-123',
        newOwnerUserId: 'new-owner',
      }
      // Current user is NOT owner
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'member-123',
        role: { name: 'Admin' },
      } as any)
      await expect(service.transferOrganizationOwnership(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })
    it('should throw BadRequestException when target user is not a member', async () => {
      const userId = 'current-owner'
      const input = {
        organizationId: 'org-123',
        newOwnerUserId: 'non-member',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          id: 'member-current',
          role: { name: 'Owner' },
        } as any)
        .mockResolvedValueOnce(null) // Target is not a member
      await expect(service.transferOrganizationOwnership(userId, input)).rejects.toThrow(
        BadRequestException,
      )
    })
    it('should throw Error when owner role not found', async () => {
      const userId = 'current-owner'
      const input = {
        organizationId: 'org-123',
        newOwnerUserId: 'new-owner',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          id: 'member-current',
          role: { name: 'Owner' },
        } as any)
        .mockResolvedValueOnce({
          id: 'member-new',
          roleId: 'role-admin',
          role: { name: 'Admin' },
        } as any)
      data.role.findFirst.mockResolvedValue(null) // Owner role not found
      await expect(service.transferOrganizationOwnership(userId, input)).rejects.toThrow(
        'Owner role not found for this organization',
      )
    })
    it('should throw Error when current owner member record not found', async () => {
      const userId = 'current-owner'
      const input = {
        organizationId: 'org-123',
        newOwnerUserId: 'new-owner',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          id: 'member-current',
          role: { name: 'Owner' },
        } as any)
        .mockResolvedValueOnce({
          id: 'member-new',
          roleId: 'role-admin',
          role: { name: 'Admin' },
        } as any)
        .mockResolvedValueOnce(null) // Current owner member not found
      data.role.findFirst.mockResolvedValue({
        id: 'role-owner',
        name: 'Owner',
      } as any)
      await expect(service.transferOrganizationOwnership(userId, input)).rejects.toThrow(
        'Current owner member record not found',
      )
    })
  })
  describe('getOrganizationMembers', () => {
    it('should return organization members when user is a member', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      data.organizationMember.findFirst.mockResolvedValueOnce({
        id: 'member-123',
      } as any)
      data.organizationMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          user: {
            id: 'user-1',
            firstName: 'John',
            emails: [{ email: 'john@example.com', primary: true }],
          },
          role: {
            name: 'Owner',
            permissions: [{ subject: 'organization', action: 'update' }],
          },
        },
        {
          id: 'member-2',
          user: {
            id: 'user-2',
            firstName: 'Jane',
            emails: [{ email: 'jane@example.com', primary: true }],
          },
          role: {
            name: 'Member',
            permissions: [{ subject: 'member', action: 'read' }],
          },
        },
      ] as any)
      const result = await service.getOrganizationMembers(userId, organizationId)
      expect(result).toHaveLength(2)
      expect(result[0].user.firstName).toBe('John')
      expect(result[1].user.firstName).toBe('Jane')
    })
    it('should throw ForbiddenException when user is not a member', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      data.organizationMember.findFirst.mockResolvedValue(null) // Not a member
      await expect(service.getOrganizationMembers(userId, organizationId)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('getOrganizationInvitations', () => {
    it('should return pending invitations when user has permission', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'read' }] },
      } as any)
      data.invite.findMany.mockResolvedValue([
        {
          id: 'invite-1',
          email: 'invited1@example.com',
          status: 'PENDING',
          inviter: {
            id: 'inviter-1',
            firstName: 'John',
            emails: [{ email: 'john@example.com', primary: true }],
          },
          role: { name: 'Member' },
        },
        {
          id: 'invite-2',
          email: 'invited2@example.com',
          status: 'PENDING',
          inviter: {
            id: 'inviter-2',
            firstName: 'Jane',
            emails: [{ email: 'jane@example.com', primary: true }],
          },
          role: { name: 'Admin' },
        },
      ] as any)
      const result = await service.getOrganizationInvitations(userId, organizationId)
      expect(result).toHaveLength(2)
      expect(result[0].email).toBe('invited1@example.com')
      expect(result[1].email).toBe('invited2@example.com')
    })
    it('should throw ForbiddenException when user lacks permission', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'organization', action: 'update' }] }, // Wrong permission
      } as any)
      await expect(service.getOrganizationInvitations(userId, organizationId)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('getOrganizationRoles', () => {
    it('should return roles when user is a member', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'member-123',
      } as any)
      data.role.findMany.mockResolvedValue([
        {
          id: 'role-1',
          name: 'Owner',
          permissions: [{ subject: 'organization', action: 'update' }],
        },
        {
          id: 'role-2',
          name: 'Admin',
          permissions: [{ subject: 'member', action: 'invite' }],
        },
        {
          id: 'role-3',
          name: 'Member',
          permissions: [{ subject: 'member', action: 'read' }],
        },
      ] as any)
      const result = await service.getOrganizationRoles(userId, organizationId)
      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('Owner')
      expect(result[1].name).toBe('Admin')
      expect(result[2].name).toBe('Member')
    })
    it('should throw ForbiddenException when user is not a member', async () => {
      const userId = 'user-123'
      const organizationId = 'org-123'
      data.organizationMember.findFirst.mockResolvedValue(null) // Not a member
      await expect(service.getOrganizationRoles(userId, organizationId)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('getInvitationDetails', () => {
    it('should return invitation details for valid token', async () => {
      const token = 'valid-token'
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10000),
        organization: { name: 'Test Org' },
        role: { name: 'Member' },
        inviter: {
          id: 'inviter-1',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
        },
      } as any)
      const result = await service.getInvitationDetails(token)
      expect(result.email).toBe('invited@example.com')
      expect(result.organizationName).toBe('Test Org')
      expect(result.roleName).toBe('Member')
      expect(result.inviterName).toBe('John Doe')
    })
    it('should use displayName when firstName is not available', async () => {
      const token = 'valid-token'
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10000),
        organization: { name: 'Test Org' },
        role: { name: 'Member' },
        inviter: {
          id: 'inviter-1',
          firstName: null,
          lastName: null,
          displayName: 'JohnDoe123',
        },
      } as any)
      const result = await service.getInvitationDetails(token)
      expect(result.inviterName).toBe('JohnDoe123')
    })
    it('should fall back to a generic name when the inviter has no name at all', async () => {
      // firstName, lastName and displayName are all optional on User. Returning null here would
      // fail the non-null GraphQL field and break the whole invitation page for the invitee.
      const token = 'valid-token'
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10000),
        organization: { name: 'Test Org' },
        role: { name: 'Member' },
        inviter: {
          id: 'inviter-1',
          firstName: null,
          lastName: null,
          displayName: null,
        },
      } as any)
      const result = await service.getInvitationDetails(token)
      expect(result.inviterName).toBe('A team member')
    })
    it('should throw NotFoundException when invitation not found', async () => {
      const token = 'invalid-token'
      data.invite.findUnique.mockResolvedValue(null)
      await expect(service.getInvitationDetails(token)).rejects.toThrow(NotFoundException)
    })
    it('should throw BadRequestException when invitation status is not PENDING', async () => {
      const token = 'used-token'
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        status: 'ACCEPTED',
        organization: { name: 'Test Org' },
      } as any)
      await expect(service.getInvitationDetails(token)).rejects.toThrow(
        'This invitation has already been used or expired',
      )
    })
    it('should mark invitation as expired and throw error when expired', async () => {
      const token = 'expired-token'
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 10000), // Expired
        organization: { name: 'Test Org' },
      } as any)
      data.invite.update.mockResolvedValue({} as any)
      await expect(service.getInvitationDetails(token)).rejects.toThrow(
        'This invitation has expired',
      )
      expect(data.invite.update).toHaveBeenCalledWith({
        where: { id: 'invite-123' },
        data: { status: 'EXPIRED' },
      })
    })
    it('should default to "Member" when role name is not available', async () => {
      const token = 'valid-token'
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10000),
        organization: { name: 'Test Org' },
        role: null, // No role
        inviter: {
          id: 'inviter-1',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
        },
      } as any)
      const result = await service.getInvitationDetails(token)
      expect(result.roleName).toBe('Member')
    })
  })
  describe('resendOrganizationInvitation', () => {
    it('should resend invitation with new token', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        organizationId: 'org-123',
        organization: { name: 'Test Org' },
        role: { name: 'Member' },
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)
      data.invite.update.mockResolvedValue({} as any)
      data.user.findUnique.mockResolvedValue({
        id: userId,
        firstName: 'John',
        displayName: 'John Doe',
      } as any)
      const result = await service.resendOrganizationInvitation(userId, input)
      expect(result).toBe(true)
      expect(data.invite.update).toHaveBeenCalledWith({
        where: { id: 'invite-123' },
        data: expect.objectContaining({
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      })
      expect(emailService.sendTemplate).toHaveBeenCalledWith(
        'invited@example.com',
        expect.objectContaining({
          templateId: 'organization-invitation',
        }),
      )
    })
    it('should throw NotFoundException when invitation not found', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invalid-invite' }
      data.invite.findUnique.mockResolvedValue(null)
      await expect(service.resendOrganizationInvitation(userId, input)).rejects.toThrow(
        NotFoundException,
      )
    })
    it('should throw ForbiddenException when user lacks permission', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        organizationId: 'org-123',
        organization: { name: 'Test Org' },
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'organization', action: 'update' }] }, // Wrong permission
      } as any)
      await expect(service.resendOrganizationInvitation(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })
    it('should throw BadRequestException when invitation is not PENDING', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'ACCEPTED', // Not pending
        organizationId: 'org-123',
        organization: { name: 'Test Org' },
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)
      await expect(service.resendOrganizationInvitation(userId, input)).rejects.toThrow(
        'Can only resend pending invitations',
      )
    })
    it('should throw Error when inviter details not found', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        organizationId: 'org-123',
        organization: { name: 'Test Org' },
        role: { name: 'Member' },
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)
      data.invite.update.mockResolvedValue({} as any)
      data.user.findUnique.mockResolvedValue(null) // Inviter not found
      await expect(service.resendOrganizationInvitation(userId, input)).rejects.toThrow(
        'Failed to fetch inviter details',
      )
    })
  })
  describe('cancelOrganizationInvitation', () => {
    it('should cancel pending invitation and record audit log', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
        organizationId: 'org-123',
        roleId: 'role-member',
        role: { name: 'Member' },
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)
      data.invite.update.mockResolvedValue({} as any)

      const result = await service.cancelOrganizationInvitation(userId, input)

      expect(result).toBe(true)
      expect(data.invite.update).toHaveBeenCalledWith({
        where: { id: 'invite-123' },
        data: { status: 'DECLINED' },
      })
      expect(data.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          organizationId: 'org-123',
          entityId: 'invite-123',
          entityType: 'Invite',
          action: 'ORGANIZATION_INVITATION_CANCELLED',
          changes: expect.objectContaining({
            email: 'invited@example.com',
            status: { before: 'PENDING', after: 'DECLINED' },
          }),
        }),
      })
    })

    it('should throw NotFoundException when invitation not found', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'missing-invite' }
      data.invite.findUnique.mockResolvedValue(null)

      await expect(service.cancelOrganizationInvitation(userId, input)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('should throw ForbiddenException when user lacks invite permission', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        organizationId: 'org-123',
        status: 'PENDING',
        role: { name: 'Member' },
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'read' }] },
      } as any)

      await expect(service.cancelOrganizationInvitation(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('should require owner to cancel Owner invitations', async () => {
      const userId = 'admin-user'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        organizationId: 'org-123',
        status: 'PENDING',
        role: { name: 'Owner' },
      } as any)
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'invite' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Admin' } } as any)

      await expect(service.cancelOrganizationInvitation(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('should throw BadRequestException when invitation is not PENDING', async () => {
      const userId = 'user-123'
      const input = { invitationId: 'invite-123' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        organizationId: 'org-123',
        status: 'ACCEPTED',
        role: { name: 'Member' },
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)

      await expect(service.cancelOrganizationInvitation(userId, input)).rejects.toThrow(
        'Can only cancel pending invitations',
      )
    })
  })
  describe('rejectOrganizationInvitation', () => {
    it('should reject invitation and mark as DECLINED', async () => {
      const userId = 'user-123'
      const input = { token: 'valid-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        token: 'valid-token',
        email: 'user@example.com',
        status: 'PENDING',
        organizationId: 'org-123',
      } as any)
      data.email.findFirst.mockResolvedValue({
        email: 'user@example.com',
        primary: true,
      } as any)
      data.invite.update.mockResolvedValue({} as any)
      const result = await service.rejectOrganizationInvitation(userId, input)
      expect(result).toBe(true)
      expect(data.invite.update).toHaveBeenCalledWith({
        where: { id: 'invite-123' },
        data: { status: 'DECLINED' },
      })
    })
    it('should throw NotFoundException when invitation not found', async () => {
      const userId = 'user-123'
      const input = { token: 'invalid-token' }
      data.invite.findUnique.mockResolvedValue(null)
      await expect(service.rejectOrganizationInvitation(userId, input)).rejects.toThrow(
        NotFoundException,
      )
    })
    it('should throw BadRequestException when invitation is not PENDING', async () => {
      const userId = 'user-123'
      const input = { token: 'used-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        status: 'ACCEPTED', // Not pending
      } as any)
      await expect(service.rejectOrganizationInvitation(userId, input)).rejects.toThrow(
        'This invitation has already been used or expired',
      )
    })
    it('should throw BadRequestException when email does not match', async () => {
      const userId = 'user-123'
      const input = { token: 'valid-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
      } as any)
      data.email.findFirst.mockResolvedValue({
        email: 'different@example.com', // Different email
        primary: true,
      } as any)
      await expect(service.rejectOrganizationInvitation(userId, input)).rejects.toThrow(
        'This invitation was sent to a different email address',
      )
    })
    it('should throw BadRequestException when user has no email', async () => {
      const userId = 'user-123'
      const input = { token: 'valid-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'invited@example.com',
        status: 'PENDING',
      } as any)
      data.email.findFirst.mockResolvedValue(null) // No email found
      await expect(service.rejectOrganizationInvitation(userId, input)).rejects.toThrow(
        'This invitation was sent to a different email address',
      )
    })
  })
  describe('userCreateOrganization - error cases', () => {
    it('should throw Error when Owner role creation fails', async () => {
      const userId = 'user-123'
      const input = { name: 'Test Org' }
      data.organization.create.mockResolvedValue({ id: 'org-123', name: 'Test Org' } as any)
      data.permission.findMany.mockResolvedValue([])
      data.role.findFirst.mockResolvedValue(null) // Owner role not found
      await expect(service.userCreateOrganization(userId, input)).rejects.toThrow(
        'Failed to create Owner role for organization',
      )
    })
  })
  describe('addOrganizationMember - permission check', () => {
    it('should throw ForbiddenException when user lacks invite permission', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'new-user-456',
        roleId: 'role-member',
      }
      // No invite permission
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'organization', action: 'update' }] }, // Wrong permission
      } as any)
      await expect(service.addOrganizationMember(userId, input)).rejects.toThrow(ForbiddenException)
    })
  })
  describe('removeOrganizationMember - not found case', () => {
    it('should throw NotFoundException when member not found', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'target-user-456',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'remove' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Member' } } as any) // Target is not owner
        .mockResolvedValueOnce(null) // Member to delete not found
      await expect(service.removeOrganizationMember(userId, input)).rejects.toThrow(
        NotFoundException,
      )
    })
    it('should throw ForbiddenException when user lacks remove permission', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'target-user-456',
      }
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'read' }] }, // No remove permission
      } as any)
      await expect(service.removeOrganizationMember(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('updateOrganizationMemberRole - not found case', () => {
    it('should throw NotFoundException when member not found', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'target-user',
        roleId: 'new-role-id',
      }
      data.organizationMember.findFirst
        .mockResolvedValueOnce({
          role: { permissions: [{ subject: 'member', action: 'update' }] },
        } as any)
        .mockResolvedValueOnce({ role: { name: 'Member' } } as any) // Not owner
        .mockResolvedValueOnce(null) // Member not found
      await expect(service.updateOrganizationMemberRole(userId, input)).rejects.toThrow(
        NotFoundException,
      )
    })
    it('should throw ForbiddenException when user lacks update permission', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        userId: 'target-user',
        roleId: 'new-role-id',
      }
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'read' }] }, // No update permission
      } as any)
      await expect(service.updateOrganizationMemberRole(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })
  describe('createOrganizationInvitation - error cases', () => {
    it('should throw ForbiddenException when user lacks invite permission', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        email: 'newuser@example.com',
        roleId: 'role-member',
      }
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'organization', action: 'update' }] }, // Wrong permission
      } as any)
      await expect(service.createOrganizationInvitation(userId, input)).rejects.toThrow(
        ForbiddenException,
      )
    })
    it('should throw Error when organization or inviter details not found', async () => {
      const userId = 'user-123'
      const input = {
        organizationId: 'org-123',
        email: 'newuser@example.com',
        roleId: 'role-member',
      }
      data.organizationMember.findFirst.mockResolvedValue({
        role: { permissions: [{ subject: 'member', action: 'invite' }] },
      } as any)
      data.invite.findFirst.mockResolvedValue(null)
      data.invite.create.mockResolvedValue({
        id: 'invite-123',
        token: 'mock-token',
      } as any)
      data.organization.findUnique.mockResolvedValue(null) // Organization not found
      data.user.findUnique.mockResolvedValue(null) // Inviter not found
      await expect(service.createOrganizationInvitation(userId, input)).rejects.toThrow(
        'Failed to fetch organization or inviter details',
      )
    })
  })
  describe('acceptOrganizationInvitation - edge cases', () => {
    it('should throw NotFoundException when invitation not found', async () => {
      const userId = 'user-123'
      const input = { token: 'invalid-token' }
      data.invite.findUnique.mockResolvedValue(null)
      await expect(service.acceptOrganizationInvitation(userId, input)).rejects.toThrow(
        NotFoundException,
      )
    })
    it('should throw BadRequestException when invitation is not PENDING', async () => {
      const userId = 'user-123'
      const input = { token: 'used-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        status: 'ACCEPTED', // Not pending
      } as any)
      await expect(service.acceptOrganizationInvitation(userId, input)).rejects.toThrow(
        'This invitation has already been used or expired',
      )
    })
    it('should throw BadRequestException when user is already a member', async () => {
      const userId = 'user-123'
      const input = { token: 'valid-token' }
      data.invite.findUnique.mockResolvedValue({
        id: 'invite-123',
        email: 'user@example.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10000),
        organizationId: 'org-123',
        organization: { id: 'org-123', name: 'Test Org' },
        role: { name: 'Member' },
      } as any)
      data.email.findFirst.mockResolvedValue({
        email: 'user@example.com',
        primary: true,
      } as any)
      data.organizationMember.findFirst.mockResolvedValue({
        id: 'existing-member', // Already a member
      } as any)
      await expect(service.acceptOrganizationInvitation(userId, input)).rejects.toThrow(
        'You are already a member of this organization',
      )
    })
  })

  describe('organization role management', () => {
    const permission = { id: 'permission-1', subject: 'member', action: 'read' }

    it('creates a custom role within the caller grant ceiling and audits it transactionally', async () => {
      data.role.findFirst.mockResolvedValue(null)
      data.permission.findMany.mockResolvedValue([permission])
      data.user.findUnique.mockResolvedValue({
        isSuperAdmin: false,
        organizations: [{ role: { permissions: [permission] } }],
      })
      data.role.create.mockResolvedValue({
        id: 'role-custom',
        name: 'Observer',
        description: null,
        isSystem: false,
        permissions: [permission],
      })

      await expect(
        service.userCreateOrganizationRole('user-1', {
          organizationId: 'org-1',
          name: 'Observer',
          permissionKeys: ['member:read'],
        }),
      ).resolves.toMatchObject({ id: 'role-custom' })
      expect(data.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            permissions: { connect: [{ id: 'permission-1' }] },
          }),
        }),
      )
      expect(data.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ORGANIZATION_ROLE_CREATED' }),
        }),
      )
    })

    it('rejects permissions above the caller organization role', async () => {
      data.role.findFirst.mockResolvedValue(null)
      data.permission.findMany.mockResolvedValue([permission])
      data.user.findUnique.mockResolvedValue({
        isSuperAdmin: false,
        organizations: [{ role: { permissions: [] } }],
      })

      await expect(
        service.userCreateOrganizationRole('user-1', {
          organizationId: 'org-1',
          name: 'Observer',
          permissionKeys: ['member:read'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(data.role.create).not.toHaveBeenCalled()
    })

    it('treats the legacy all:manage permission as the organization grant ceiling', async () => {
      data.role.findFirst.mockResolvedValue(null)
      data.permission.findMany.mockResolvedValue([permission])
      data.user.findUnique.mockResolvedValue({
        isSuperAdmin: false,
        organizations: [
          { role: { permissions: [{ id: 'all-manage', subject: 'all', action: 'manage' }] } },
        ],
      })
      data.role.create.mockResolvedValue({
        id: 'role-custom',
        name: 'Observer',
        description: null,
        isSystem: false,
        permissions: [permission],
      })

      await expect(
        service.userCreateOrganizationRole('user-1', {
          organizationId: 'org-1',
          name: 'Observer',
          permissionKeys: ['member:read'],
        }),
      ).resolves.toMatchObject({ id: 'role-custom' })
    })

    it('keeps default organization roles immutable', async () => {
      data.role.findFirst.mockResolvedValue({
        id: 'owner-role',
        isSystem: true,
        permissions: [],
        members: [],
        teamMembers: [],
        invites: [],
      })

      await expect(
        service.userUpdateOrganizationRole('user-1', {
          organizationId: 'org-1',
          roleId: 'owner-role',
          name: 'Different owner',
          permissionKeys: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('does not delete a custom role that is still assigned', async () => {
      data.role.findFirst.mockResolvedValue({
        id: 'custom-role',
        name: 'Observer',
        isSystem: false,
        permissions: [],
        members: [{ userId: 'member-1' }],
        teamMembers: [],
        invites: [],
      })
      data.user.findUnique.mockResolvedValue({
        isSuperAdmin: true,
        organizations: [],
      })

      await expect(
        service.userDeleteOrganizationRole('root-1', {
          organizationId: 'org-1',
          roleId: 'custom-role',
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(data.role.delete).not.toHaveBeenCalled()
    })
  })
})

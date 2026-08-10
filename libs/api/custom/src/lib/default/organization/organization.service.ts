import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { Organization, User } from '@nestled-template/api/core/models'
import { defaultRoles, type InputJsonValue } from '@nestled-template/api/prisma'
import {
  AddOrganizationMemberInput,
  RemoveOrganizationMemberInput,
  UpdateMemberRoleInput,
  CreateInvitationInput,
  ResendInvitationInput,
  CancelInvitationInput,
  AcceptInvitationInput,
  RejectInvitationInput,
  SwitchOrganizationInput,
  TransferOrganizationOwnershipInput,
  UserCreateOrganizationInput,
  UserUpdateOrganizationInput,
  CreateOrganizationRoleInput,
  UpdateOrganizationRoleInput,
  DeleteOrganizationRoleInput,
} from './dto'
import { EmailService } from '@nestled-template/api/integrations'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import { AuthCacheService } from '@nestled-template/api/utils'

@Injectable()
export class OrganizationService {
  constructor(
    private readonly data: ApiCoreDataAccessService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    @Optional() private readonly authCache?: AuthCacheService,
  ) {}

  private async recordAuditLog(input: {
    actorUserId: string
    organizationId?: string
    entityId: string
    entityType: string
    action: string
    changes?: InputJsonValue
  }): Promise<void> {
    try {
      await this.data.auditLog.create({
        data: {
          userId: input.actorUserId,
          organizationId: input.organizationId,
          entityId: input.entityId,
          entityType: input.entityType,
          action: input.action,
          changes: input.changes,
        },
      })
    } catch (error) {
      Logger.warn(
        `Failed to record audit log ${input.action} for ${input.entityType} ${input.entityId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Creates default roles for a new organization with proper permissions
   */
  private async createOrganizationRoles(organizationId: string) {
    // Get all permissions from database
    const allPermissions = await this.data.permission.findMany()

    for (const roleTemplate of defaultRoles) {
      // Find permissions that match this role's permission strings
      const rolePermissions = allPermissions.filter(p =>
        roleTemplate.permissions.includes(`${p.subject}:${p.action}`),
      )

      await this.data.role.create({
        data: {
          name: roleTemplate.name,
          description: roleTemplate.description,
          isSystem: true,
          organizationId,
          permissions: {
            connect: rolePermissions.map(p => ({ id: p.id })),
          },
        },
      })
    }
  }

  /**
   * Check if user is owner of organization
   */
  private async isOwner(userId: string, organizationId: string): Promise<boolean> {
    const member = await this.data.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
      },
      include: {
        role: true,
      },
    })

    return member?.role.name === 'Owner'
  }

  private async assertCanAssignRole(
    userId: string,
    organizationId: string,
    roleId: string,
  ): Promise<void> {
    const role = await this.data.role.findFirst({
      where: { id: roleId, organizationId },
      select: { name: true },
    })

    if (role?.name !== 'Owner') return

    const inviterIsOwner = await this.isOwner(userId, organizationId)
    if (!inviterIsOwner) {
      throw new ForbiddenException('Only organization owners can assign the Owner role')
    }
  }

  /**
   * Check if user has permission in organization
   */
  private async hasPermission(
    userId: string,
    organizationId: string,
    subject: string,
    action: string,
  ): Promise<boolean> {
    const member = await this.data.organizationMember.findFirst({
      where: {
        userId,
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

    if (!member) return false

    return member.role.permissions.some(p => p.subject === subject && p.action === action)
  }

  /**
   * User creates a new organization
   */
  async userCreateOrganization(
    userId: string,
    input: UserCreateOrganizationInput,
  ): Promise<Organization> {
    // Create the organization
    const organization = await this.data.organization.create({
      data: { name: input.name },
    })

    // Create default roles for the organization
    await this.createOrganizationRoles(organization.id)

    // Get the "Owner" role we just created
    const ownerRole = await this.data.role.findFirst({
      where: {
        name: 'Owner',
        organizationId: organization.id,
      },
    })

    if (!ownerRole) {
      throw new Error('Failed to create Owner role for organization')
    }

    // Add user as owner of the organization
    await this.data.organizationMember.create({
      data: {
        userId,
        organizationId: organization.id,
        roleId: ownerRole.id,
      },
    })

    // Set as active organization if user doesn't have one
    const user = await this.data.user.findUnique({ where: { id: userId } })
    if (!user?.activeOrganizationId) {
      await this.data.user.update({
        where: { id: userId },
        data: { activeOrganizationId: organization.id },
      })
    }

    Logger.log(`User ${userId} created organization: ${organization.name}`)

    return organization
  }

  /**
   * Update organization (owner-only for critical fields)
   */
  async userUpdateOrganization(
    userId: string,
    organizationId: string,
    input: UserUpdateOrganizationInput,
  ): Promise<Organization> {
    // Organization identity and branding are owner-managed by default.
    const canUpdate = await this.isOwner(userId, organizationId)

    if (!canUpdate) {
      throw new ForbiddenException('You do not have permission to update this organization')
    }

    const existingOrganization = await this.data.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    })

    // Update the organization
    const organization = await this.data.organization.update({
      where: { id: organizationId },
      data: {
        ...(input.name && { name: input.name }),
      },
    })

    await this.recordAuditLog({
      actorUserId: userId,
      organizationId,
      entityId: organizationId,
      entityType: 'Organization',
      action: 'ORGANIZATION_UPDATED',
      changes: {
        name: {
          before: existingOrganization?.name ?? null,
          after: organization.name,
        },
      },
    })

    Logger.log(`User ${userId} updated organization: ${organization.id}`)

    return organization
  }

  /**
   * Delete organization (owner-only)
   */
  async userDeleteOrganization(userId: string, organizationId: string): Promise<boolean> {
    // Only owners can delete organization
    const isOwnerUser = await this.isOwner(userId, organizationId)

    if (!isOwnerUser) {
      throw new ForbiddenException('Only organization owners can delete the organization')
    }

    // Manually cascade delete related records before deleting organization
    // This is necessary because the database schema doesn't have cascade deletes configured

    // Delete all pending invitations
    await this.data.invite.deleteMany({
      where: { organizationId },
    })

    // Delete all organization members
    await this.data.organizationMember.deleteMany({
      where: { organizationId },
    })

    // Delete all roles (Prisma will handle disconnecting permissions via implicit many-to-many)
    await this.data.role.deleteMany({
      where: { organizationId },
    })

    // Delete the organization
    await this.data.organization.delete({
      where: { id: organizationId },
    })

    // If this was the user's active organization, clear it
    const user = await this.data.user.findUnique({ where: { id: userId } })
    if (user?.activeOrganizationId === organizationId) {
      await this.data.user.update({
        where: { id: userId },
        data: { activeOrganizationId: null },
      })
    }

    Logger.log(`User ${userId} deleted organization: ${organizationId}`)

    return true
  }

  /**
   * Add member to organization (requires member:invite permission)
   */
  async addOrganizationMember(userId: string, input: AddOrganizationMemberInput): Promise<boolean> {
    // Check if user has permission to invite members
    const canInvite = await this.hasPermission(userId, input.organizationId, 'member', 'invite')

    if (!canInvite) {
      throw new ForbiddenException('You do not have permission to add members to this organization')
    }

    // Check if user is already a member
    const existingMember = await this.data.organizationMember.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
      },
    })

    if (existingMember) {
      throw new BadRequestException('User is already a member of this organization')
    }

    // Add the member
    await this.data.organizationMember.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        roleId: input.roleId,
      },
    })

    Logger.log(
      `User ${userId} added member ${input.userId} to organization ${input.organizationId}`,
    )

    return true
  }

  /**
   * Remove member from organization (requires member:remove permission)
   */
  async removeOrganizationMember(
    userId: string,
    input: RemoveOrganizationMemberInput,
  ): Promise<boolean> {
    // Check if user has permission to remove members
    const canRemove = await this.hasPermission(userId, input.organizationId, 'member', 'remove')

    if (!canRemove) {
      throw new ForbiddenException(
        'You do not have permission to remove members from this organization',
      )
    }

    // Cannot remove yourself
    if (userId === input.userId) {
      throw new BadRequestException('You cannot remove yourself from the organization')
    }

    // Cannot remove the owner
    const targetIsOwner = await this.isOwner(input.userId, input.organizationId)
    if (targetIsOwner) {
      throw new BadRequestException('Cannot remove the organization owner')
    }

    // Remove the member
    const member = await this.data.organizationMember.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
      },
    })

    if (!member) {
      throw new NotFoundException('Member not found in this organization')
    }

    await this.data.organizationMember.delete({
      where: { id: member.id },
    })

    await this.recordAuditLog({
      actorUserId: userId,
      organizationId: input.organizationId,
      entityId: input.userId,
      entityType: 'OrganizationMember',
      action: 'ORGANIZATION_MEMBER_REMOVED',
      changes: {
        removedUserId: input.userId,
        membershipId: member.id,
      },
    })

    // Invalidate cached membership for the removed user
    if (this.authCache?.isEnabled()) {
      await this.authCache.invalidateMembership(input.userId, input.organizationId)
      await this.authCache.invalidateUserActiveOrganization(input.userId)
    }

    Logger.log(
      `User ${userId} removed member ${input.userId} from organization ${input.organizationId}`,
    )

    return true
  }

  /**
   * Update member role (requires member:update permission)
   */
  async updateOrganizationMemberRole(
    userId: string,
    input: UpdateMemberRoleInput,
  ): Promise<boolean> {
    // Check if user has permission to update members
    const canUpdate = await this.hasPermission(userId, input.organizationId, 'member', 'update')

    if (!canUpdate) {
      throw new ForbiddenException(
        'You do not have permission to update member roles in this organization',
      )
    }

    await this.assertCanAssignRole(userId, input.organizationId, input.roleId)

    // Cannot change owner's role
    const targetIsOwner = await this.isOwner(input.userId, input.organizationId)
    if (targetIsOwner) {
      throw new BadRequestException('Cannot change the role of the organization owner')
    }

    // Update the member's role
    const member = await this.data.organizationMember.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
      },
    })

    if (!member) {
      throw new NotFoundException('Member not found in this organization')
    }

    await this.data.organizationMember.update({
      where: { id: member.id },
      data: { roleId: input.roleId },
    })

    await this.recordAuditLog({
      actorUserId: userId,
      organizationId: input.organizationId,
      entityId: input.userId,
      entityType: 'OrganizationMember',
      action: 'ORGANIZATION_MEMBER_ROLE_UPDATED',
      changes: {
        targetUserId: input.userId,
        membershipId: member.id,
        roleId: {
          before: member.roleId ?? null,
          after: input.roleId,
        },
      },
    })

    // Invalidate cached membership for the affected user
    if (this.authCache?.isEnabled()) {
      await this.authCache.invalidateMembership(input.userId, input.organizationId)
    }

    Logger.log(
      `User ${userId} updated role for member ${input.userId} in organization ${input.organizationId}`,
    )

    return true
  }

  /**
   * Create invitation to organization (requires member:invite permission)
   */
  async createOrganizationInvitation(
    userId: string,
    input: CreateInvitationInput,
  ): Promise<string> {
    // Check if user has permission to invite members
    const canInvite = await this.hasPermission(userId, input.organizationId, 'member', 'invite')

    if (!canInvite) {
      throw new ForbiddenException(
        'You do not have permission to invite members to this organization',
      )
    }

    await this.assertCanAssignRole(userId, input.organizationId, input.roleId)

    // Check if email already has a pending invitation
    const existingInvite = await this.data.invite.findFirst({
      where: {
        email: input.email.toLowerCase().trim(),
        organizationId: input.organizationId,
        status: 'PENDING',
      },
    })

    if (existingInvite) {
      throw new BadRequestException(
        'This email already has a pending invitation to this organization',
      )
    }

    // Generate invitation token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Create invitation
    const invitation = await this.data.invite.create({
      data: {
        email: input.email.toLowerCase().trim(),
        token,
        expiresAt,
        inviterId: userId,
        organizationId: input.organizationId,
        roleId: input.roleId,
        status: 'PENDING',
      },
    })

    await this.recordAuditLog({
      actorUserId: userId,
      organizationId: input.organizationId,
      entityId: invitation.id,
      entityType: 'Invite',
      action: 'ORGANIZATION_INVITATION_CREATED',
      changes: {
        email: input.email.toLowerCase().trim(),
        roleId: input.roleId,
        expiresAt: expiresAt.toISOString(),
      },
    })

    // Get organization and inviter details for email
    const [organization, inviter] = await Promise.all([
      this.data.organization.findUnique({ where: { id: input.organizationId } }),
      this.data.user.findUnique({ where: { id: userId } }),
    ])

    if (!organization || !inviter) {
      throw new Error('Failed to fetch organization or inviter details')
    }

    // Send invitation email
    const appName = this.config.get('app.name')
    const siteUrl = this.config.get('siteUrl')
    const invitationUrl = `${siteUrl}/accept-invitation?token=${token}`

    await this.emailService.sendTemplate(input.email, {
      templateId: 'organization-invitation',
      variables: {
        organizationName: organization.name,
        inviterName: inviter.firstName || inviter.displayName || 'A team member',
        invitationUrl,
        appName,
        expirationDays: 7,
      },
    })

    Logger.log(`User ${userId} invited ${input.email} to organization ${input.organizationId}`)

    // Return the token so it can be used to accept the invitation
    // In production, users get this token from the email link
    return token
  }

  /**
   * Get invitation details (public - no authentication required)
   */
  async getInvitationDetails(token: string) {
    const invite = await this.data.invite.findUnique({
      where: { token },
      include: {
        organization: true,
        role: true,
        inviter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
    })

    if (!invite) {
      throw new NotFoundException('Invitation not found')
    }

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('This invitation has already been used or expired')
    }

    if (invite.expiresAt < new Date()) {
      // Mark as expired
      await this.data.invite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      })
      throw new BadRequestException('This invitation has expired')
    }

    // Return safe invitation details (no sensitive data)
    return {
      id: invite.id,
      email: invite.email,
      organizationName: invite.organization.name,
      roleName: invite.role?.name || 'Member',
      // firstName, lastName and displayName are all optional on User, so this needs the same
      // final fallback the invitation emails use. Without it an inviter with none of them set
      // returns null for a non-null GraphQL field, failing the whole query for the invitee.
      inviterName: invite.inviter.firstName
        ? `${invite.inviter.firstName} ${invite.inviter.lastName || ''}`.trim()
        : invite.inviter.displayName || 'A team member',
      expiresAt: invite.expiresAt,
    }
  }

  /**
   * Resend organization invitation (requires member:invite permission)
   */
  async resendOrganizationInvitation(
    userId: string,
    input: ResendInvitationInput,
  ): Promise<boolean> {
    // Find the invitation
    const invite = await this.data.invite.findUnique({
      where: { id: input.invitationId },
      include: { organization: true, role: true },
    })

    if (!invite) {
      throw new NotFoundException('Invitation not found')
    }

    // Check if user has permission to invite members
    const canInvite = await this.hasPermission(userId, invite.organizationId, 'member', 'invite')

    if (!canInvite) {
      throw new ForbiddenException(
        'You do not have permission to resend invitations for this organization',
      )
    }

    // Only allow resending PENDING invitations
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Can only resend pending invitations')
    }

    // Generate new invitation token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Update invitation with new token and expiration
    await this.data.invite.update({
      where: { id: invite.id },
      data: {
        token,
        expiresAt,
      },
    })

    // Get inviter details for email
    const inviter = await this.data.user.findUnique({ where: { id: userId } })

    if (!inviter) {
      throw new Error('Failed to fetch inviter details')
    }

    // Send invitation email
    const appName = this.config.get('app.name')
    const siteUrl = this.config.get('siteUrl')
    const invitationUrl = `${siteUrl}/accept-invitation?token=${token}`

    await this.emailService.sendTemplate(invite.email, {
      templateId: 'organization-invitation',
      variables: {
        organizationName: invite.organization.name,
        inviterName: inviter.firstName || inviter.displayName || 'A team member',
        invitationUrl,
        appName,
        expirationDays: 7,
      },
    })

    Logger.log(`User ${userId} resent invitation ${invite.id} to ${invite.email}`)

    return true
  }

  /**
   * Cancel a pending organization invitation (requires member:invite permission).
   */
  async cancelOrganizationInvitation(
    userId: string,
    input: CancelInvitationInput,
  ): Promise<boolean> {
    const invite = await this.data.invite.findUnique({
      where: { id: input.invitationId },
      include: { role: true },
    })

    if (!invite) {
      throw new NotFoundException('Invitation not found')
    }

    const canInvite = await this.hasPermission(userId, invite.organizationId, 'member', 'invite')
    if (!canInvite) {
      throw new ForbiddenException(
        'You do not have permission to cancel invitations for this organization',
      )
    }

    if (invite.role?.name === 'Owner') {
      const userIsOwner = await this.isOwner(userId, invite.organizationId)
      if (!userIsOwner) {
        throw new ForbiddenException('Only organization owners can cancel Owner invitations')
      }
    }

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Can only cancel pending invitations')
    }

    await this.data.invite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED' },
    })

    await this.recordAuditLog({
      actorUserId: userId,
      organizationId: invite.organizationId,
      entityId: invite.id,
      entityType: 'Invite',
      action: 'ORGANIZATION_INVITATION_CANCELLED',
      changes: {
        email: invite.email,
        roleId: invite.roleId ?? null,
        status: {
          before: invite.status,
          after: 'DECLINED',
        },
      },
    })

    Logger.log(`User ${userId} cancelled invitation ${invite.id} to ${invite.email}`)

    return true
  }

  /**
   * Accept organization invitation
   */
  async acceptOrganizationInvitation(
    userId: string,
    input: AcceptInvitationInput,
  ): Promise<Organization> {
    // Find the invitation
    const invite = await this.data.invite.findUnique({
      where: { token: input.token },
      include: { organization: true, role: true },
    })

    if (!invite) {
      throw new NotFoundException('Invitation not found')
    }

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('This invitation has already been used or expired')
    }

    if (invite.expiresAt < new Date()) {
      // Mark as expired
      await this.data.invite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      })
      throw new BadRequestException('This invitation has expired')
    }

    // Verify email matches (get user's email)
    const userEmail = await this.data.email.findFirst({
      where: { userId, primary: true },
    })

    if (userEmail?.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new BadRequestException('This invitation was sent to a different email address')
    }

    // Check if already a member
    const existingMember = await this.data.organizationMember.findFirst({
      where: {
        userId,
        organizationId: invite.organizationId,
      },
    })

    if (existingMember) {
      throw new BadRequestException('You are already a member of this organization')
    }

    // Add user to organization
    Logger.log(
      `Adding user ${userId} to organization ${invite.organizationId} with role ${invite.roleId} (${invite.role?.name})`,
    )
    const roleId = invite.roleId ?? invite.role?.id
    if (!roleId) {
      throw new BadRequestException('Invitation is missing a role')
    }

    await this.data.organizationMember.create({
      data: {
        userId,
        organizationId: invite.organizationId,
        roleId,
      },
    })

    // Mark invitation as accepted
    await this.data.invite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    })

    // Set as active organization if user doesn't have one
    const user = await this.data.user.findUnique({ where: { id: userId } })
    if (!user?.activeOrganizationId) {
      await this.data.user.update({
        where: { id: userId },
        data: { activeOrganizationId: invite.organizationId },
      })
    }

    Logger.log(`User ${userId} accepted invitation to organization ${invite.organizationId}`)

    return invite.organization
  }

  /**
   * Reject organization invitation
   */
  async rejectOrganizationInvitation(
    userId: string,
    input: RejectInvitationInput,
  ): Promise<boolean> {
    // Find the invitation
    const invite = await this.data.invite.findUnique({
      where: { token: input.token },
    })

    if (!invite) {
      throw new NotFoundException('Invitation not found')
    }

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('This invitation has already been used or expired')
    }

    // Verify email matches
    const userEmail = await this.data.email.findFirst({
      where: { userId, primary: true },
    })

    if (userEmail?.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new BadRequestException('This invitation was sent to a different email address')
    }

    // Mark invitation as declined
    await this.data.invite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED' },
    })

    Logger.log(`User ${userId} rejected invitation to organization ${invite.organizationId}`)

    return true
  }

  /**
   * Switch active organization
   */
  async switchActiveOrganization(userId: string, input: SwitchOrganizationInput): Promise<User> {
    // Verify user is a member of the organization
    const member = await this.data.organizationMember.findFirst({
      where: {
        userId,
        organizationId: input.organizationId,
      },
    })

    if (!member) {
      throw new ForbiddenException('You are not a member of this organization')
    }

    // Update active organization
    const user = await this.data.user.update({
      where: { id: userId },
      data: { activeOrganizationId: input.organizationId },
    })

    // Update cache with new active organization
    if (this.authCache?.isEnabled()) {
      await this.authCache.setUserActiveOrganization(userId, input.organizationId)
    }

    Logger.log(`User ${userId} switched to organization ${input.organizationId}`)

    return user
  }

  /**
   * Get user's organizations
   */
  async getUserOrganizations(userId: string): Promise<Organization[]> {
    const memberships = await this.data.organizationMember.findMany({
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

    return memberships.map(m => m.organization)
  }

  /**
   * Get organization members with roles
   */
  async getOrganizationMembers(userId: string, organizationId: string) {
    // Check if user is a super admin
    const user = await this.data.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    })

    // Super admins can view all organization members without membership check
    if (!user?.isSuperAdmin) {
      // Verify user is a member
      const member = await this.data.organizationMember.findFirst({
        where: { userId, organizationId },
      })

      if (!member) {
        throw new ForbiddenException('You are not a member of this organization')
      }
    }

    // Get all members
    const members = await this.data.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          include: {
            emails: { where: { primary: true } },
          },
        },
        role: {
          include: {
            permissions: true,
          },
        },
      },
    })

    return members
  }

  /**
   * Get pending invitations for organization
   */
  async getOrganizationInvitations(userId: string, organizationId: string) {
    // Check if user has permission to view invitations
    const canView = await this.hasPermission(userId, organizationId, 'member', 'read')

    if (!canView) {
      throw new ForbiddenException(
        'You do not have permission to view invitations for this organization',
      )
    }

    const invitations = await this.data.invite.findMany({
      where: {
        organizationId,
        status: 'PENDING',
      },
      include: {
        inviter: {
          include: {
            emails: { where: { primary: true } },
          },
        },
        role: true,
      },
    })

    return invitations
  }

  /**
   * Get organization roles
   */
  async getOrganizationRoles(userId: string, organizationId: string) {
    // Check if user is a super admin
    const user = await this.data.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    })

    // Super admins can view all organization roles without membership check
    if (!user?.isSuperAdmin) {
      // Verify user is a member
      const member = await this.data.organizationMember.findFirst({
        where: { userId, organizationId },
      })

      if (!member) {
        throw new ForbiddenException('You are not a member of this organization')
      }
    }

    const roles = await this.data.role.findMany({
      where: { organizationId },
      include: {
        permissions: true,
      },
    })

    return roles
  }

  async userCreateOrganizationRole(userId: string, input: CreateOrganizationRoleInput) {
    const name = await this.validateOrganizationRoleName(input.organizationId, input.name)
    const description = this.normalizeRoleDescription(input.description)
    const permissionKeys = this.uniquePermissionKeys(input.permissionKeys)
    const permissions = await this.resolveGrantableOrganizationPermissions(
      userId,
      input.organizationId,
      permissionKeys,
    )

    return this.data.$transaction(async transaction => {
      const role = await transaction.role.create({
        data: {
          name,
          description,
          organizationId: input.organizationId,
          permissions: { connect: permissions.map(permission => ({ id: permission.id })) },
        },
        include: { permissions: true },
      })
      await transaction.auditLog.create({
        data: {
          userId,
          organizationId: input.organizationId,
          entityId: role.id,
          entityType: 'Role',
          action: 'ORGANIZATION_ROLE_CREATED',
          changes: { name, permissionKeys },
        },
      })
      return role
    })
  }

  async userUpdateOrganizationRole(userId: string, input: UpdateOrganizationRoleInput) {
    const existing = await this.requireMutableOrganizationRole(input.organizationId, input.roleId)
    await this.assertOrganizationGrantCeiling(
      userId,
      input.organizationId,
      existing.permissions.map(permission => `${permission.subject}:${permission.action}`),
    )
    const name = await this.validateOrganizationRoleName(
      input.organizationId,
      input.name,
      input.roleId,
    )
    const description = this.normalizeRoleDescription(input.description)
    const permissionKeys = this.uniquePermissionKeys(input.permissionKeys)
    const permissions = await this.resolveGrantableOrganizationPermissions(
      userId,
      input.organizationId,
      permissionKeys,
    )

    const role = await this.data.$transaction(async transaction => {
      const updated = await transaction.role.update({
        where: { id: input.roleId },
        data: {
          name,
          description,
          permissions: { set: permissions.map(permission => ({ id: permission.id })) },
        },
        include: { permissions: true },
      })
      await transaction.auditLog.create({
        data: {
          userId,
          organizationId: input.organizationId,
          entityId: input.roleId,
          entityType: 'Role',
          action: 'ORGANIZATION_ROLE_UPDATED',
          changes: {
            name: { before: existing.name, after: name },
            permissionKeys: {
              before: existing.permissions.map(
                permission => `${permission.subject}:${permission.action}`,
              ),
              after: permissionKeys,
            },
          },
        },
      })
      return updated
    })

    const authCache = this.authCache
    if (authCache?.isEnabled()) {
      await Promise.all(
        existing.members.map(member =>
          authCache.invalidateMembership(member.userId, input.organizationId),
        ),
      )
    }
    return role
  }

  async userDeleteOrganizationRole(
    userId: string,
    input: DeleteOrganizationRoleInput,
  ): Promise<boolean> {
    const existing = await this.requireMutableOrganizationRole(input.organizationId, input.roleId)
    await this.assertOrganizationGrantCeiling(
      userId,
      input.organizationId,
      existing.permissions.map(permission => `${permission.subject}:${permission.action}`),
    )
    if (
      existing.members.length > 0 ||
      existing.teamMembers.length > 0 ||
      existing.invites.length > 0
    ) {
      throw new BadRequestException(
        'Move members, team members, and invitations to another role before deleting it',
      )
    }

    await this.data.$transaction(async transaction => {
      await transaction.role.delete({ where: { id: input.roleId } })
      await transaction.auditLog.create({
        data: {
          userId,
          organizationId: input.organizationId,
          entityId: input.roleId,
          entityType: 'Role',
          action: 'ORGANIZATION_ROLE_DELETED',
          changes: { name: existing.name },
        },
      })
    })
    return true
  }

  private uniquePermissionKeys(keys: readonly string[]): string[] {
    const normalized = [...new Set(keys.map(key => key.trim()).filter(Boolean))]
    if (normalized.length > 100 || normalized.some(key => key.length > 160)) {
      throw new BadRequestException('The role permission list is too large')
    }
    return normalized
  }

  private normalizeRoleDescription(description?: string): string | null {
    const normalized = description?.trim() || null
    if (normalized && normalized.length > 500) {
      throw new BadRequestException('Role description must be 500 characters or fewer')
    }
    return normalized
  }

  private async validateOrganizationRoleName(
    organizationId: string,
    value: string,
    excludeRoleId?: string,
  ): Promise<string> {
    const name = value.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException('Role name must be between 2 and 80 characters')
    }
    const duplicate = await this.data.role.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}),
      },
      select: { id: true },
    })
    if (duplicate) throw new BadRequestException('A role with this name already exists')
    return name
  }

  private async resolveGrantableOrganizationPermissions(
    userId: string,
    organizationId: string,
    permissionKeys: string[],
  ) {
    const requested = new Set(permissionKeys)
    const permissions = (await this.data.permission.findMany()).filter(permission =>
      requested.has(`${permission.subject}:${permission.action}`),
    )
    if (permissions.length !== requested.size) {
      throw new BadRequestException('One or more organization permissions are not in the catalog')
    }
    await this.assertOrganizationGrantCeiling(userId, organizationId, permissionKeys)
    return permissions
  }

  private async assertOrganizationGrantCeiling(
    userId: string,
    organizationId: string,
    permissionKeys: readonly string[],
  ): Promise<void> {
    const actor = await this.data.user.findUnique({
      where: { id: userId },
      select: {
        isSuperAdmin: true,
        organizations: {
          where: { organizationId },
          take: 1,
          select: {
            role: {
              select: {
                permissions: { select: { subject: true, action: true } },
              },
            },
          },
        },
      },
    })
    if (actor?.isSuperAdmin) return
    const grants =
      actor?.organizations[0]?.role.permissions.map(
        permission => `${permission.subject}:${permission.action}`,
      ) ?? []
    const hasUniversalGrant = grants.includes('all:manage')
    const exceedsCeiling = permissionKeys.some(key => !hasUniversalGrant && !grants.includes(key))
    if (exceedsCeiling) {
      throw new ForbiddenException('You cannot grant permissions above your own organization role')
    }
  }

  private async requireMutableOrganizationRole(organizationId: string, roleId: string) {
    const role = await this.data.role.findFirst({
      where: { id: roleId, organizationId },
      include: {
        permissions: true,
        members: { select: { userId: true } },
        teamMembers: { select: { id: true } },
        invites: { select: { id: true } },
      },
    })
    if (!role) throw new NotFoundException('Organization role not found')
    if (role.isSystem) throw new ForbiddenException('System organization roles cannot be changed')
    return role
  }

  /**
   * Transfer organization ownership (owner-only)
   */
  async transferOrganizationOwnership(
    userId: string,
    input: TransferOrganizationOwnershipInput,
  ): Promise<boolean> {
    // Verify current user is the owner
    const isCurrentOwner = await this.isOwner(userId, input.organizationId)
    if (!isCurrentOwner) {
      throw new ForbiddenException('Only the organization owner can transfer ownership')
    }

    // Verify target user is a member of the organization
    const targetMember = await this.data.organizationMember.findFirst({
      where: {
        userId: input.newOwnerUserId,
        organizationId: input.organizationId,
      },
      include: {
        role: true,
      },
    })

    if (!targetMember) {
      throw new BadRequestException('Target user is not a member of this organization')
    }

    // Get the owner role for this organization
    const ownerRole = await this.data.role.findFirst({
      where: {
        name: 'Owner',
        organizationId: input.organizationId,
      },
    })

    if (!ownerRole) {
      throw new Error('Owner role not found for this organization')
    }

    // Get current owner member record
    const currentOwnerMember = await this.data.organizationMember.findFirst({
      where: {
        userId,
        organizationId: input.organizationId,
      },
    })

    if (!currentOwnerMember) {
      throw new Error('Current owner member record not found')
    }

    // Transfer ownership: Update both members' roles
    await this.data.$transaction([
      // Update target user to Owner role
      this.data.organizationMember.update({
        where: { id: targetMember.id },
        data: { roleId: ownerRole.id },
      }),
      // Update current owner to their previous role (or default to Member role)
      this.data.organizationMember.update({
        where: { id: currentOwnerMember.id },
        data: { roleId: targetMember.roleId }, // Give current owner the new owner's previous role
      }),
    ])

    // Invalidate cached memberships for both users
    if (this.authCache?.isEnabled()) {
      await Promise.all([
        this.authCache.invalidateMembership(userId, input.organizationId),
        this.authCache.invalidateMembership(input.newOwnerUserId, input.organizationId),
      ])
    }

    Logger.log(
      `Organization ownership transferred from ${userId} to ${input.newOwnerUserId} for organization ${input.organizationId}`,
    )

    return true
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import { permissionGrantMatches, PlatformPermissionEvaluator } from '@nestled-template/api/utils'
import {
  CreatePlatformAccessRoleInput,
  PlatformAccessPrincipalPage,
  PlatformAccessRole,
  PlatformAccessSnapshot,
  UpdatePlatformAccessRoleInput,
} from './access-control.dto'

const MAX_PRINCIPAL_PAGE_SIZE = 50
const MAX_PRINCIPAL_SEARCH_LENGTH = 120
const MAX_ROLE_PERMISSIONS = 100
const MAX_PERMISSION_KEY_LENGTH = 160

type PermissionRecord = {
  id: string
  key: string
  namespace: string
  action: string
  description: string | null
}

type RoleRecord = {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: PermissionRecord[]
  assignments: Array<{
    id: string
    createdAt: Date
    user: {
      id: string
      displayName: string | null
      isSuperAdmin: boolean
      emails: Array<{ email: string }>
    }
  }>
}

function normalizeRoleName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (normalized.length < 2 || normalized.length > 80) {
    throw new BadRequestException('Role name must be between 2 and 80 characters')
  }
  return normalized
}

function normalizeDescription(description?: string): string | null {
  const normalized = description?.trim() || null
  if (normalized && normalized.length > 500) {
    throw new BadRequestException('Role description must be 500 characters or fewer')
  }
  return normalized
}

function uniquePermissionKeys(keys: readonly string[]): string[] {
  const normalized = [...new Set(keys.map(key => key.trim()).filter(Boolean))]
  if (
    normalized.length > MAX_ROLE_PERMISSIONS ||
    normalized.some(key => key.length > MAX_PERMISSION_KEY_LENGTH)
  ) {
    throw new BadRequestException('The role permission list is too large')
  }
  if (normalized.includes('platform.*')) {
    throw new BadRequestException('The root platform wildcard is reserved for the system role')
  }
  return normalized
}

function mapRole(role: RoleRecord): PlatformAccessRole {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions,
    assignments: role.assignments.map(assignment => ({
      id: assignment.id,
      createdAt: assignment.createdAt,
      principal: {
        id: assignment.user.id,
        displayName: assignment.user.displayName,
        email: assignment.user.emails[0]?.email ?? null,
        isSuperAdmin: assignment.user.isSuperAdmin,
      },
    })),
  }
}

@Injectable()
export class PlatformAccessControlService implements PlatformPermissionEvaluator {
  constructor(private readonly data: ApiCoreDataAccessService) {}

  async getUserPlatformPermissions(userId: string): Promise<readonly string[]> {
    const assignments = await this.data.platformRoleAssignment.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            permissions: { select: { key: true } },
          },
        },
      },
    })

    return [
      ...new Set(
        assignments.flatMap(assignment =>
          assignment.role.permissions.map(permission => permission.key),
        ),
      ),
    ]
  }

  /**
   * Keep delegated platform administrators below the privilege level of their target.
   *
   * A caller may manage a principal only when every capability held by the target is covered by
   * one of the caller's grants. Root administrators retain break-glass user management, but nobody
   * may emulate a root administrator.
   */
  async assertCanManagePrincipal(
    actorUserId: string,
    targetUserId: string,
    operation: 'manage' | 'emulate' = 'manage',
  ): Promise<void> {
    const [actor, target] = await Promise.all([
      this.data.user.findUnique({
        where: { id: actorUserId },
        select: { id: true, isSuperAdmin: true },
      }),
      this.data.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, isSuperAdmin: true },
      }),
    ])
    if (!actor) throw new NotFoundException('Acting user not found')
    if (!target) throw new NotFoundException('User not found')

    if (target.isSuperAdmin) {
      if (operation === 'emulate' || !actor.isSuperAdmin) {
        throw new ForbiddenException('You cannot act on a user with higher platform access')
      }
      return
    }
    if (actor.isSuperAdmin) return

    const [actorPermissions, targetPermissions] = await Promise.all([
      this.getUserPlatformPermissions(actor.id),
      this.getUserPlatformPermissions(target.id),
    ])
    const targetIsCovered = targetPermissions.every(required =>
      actorPermissions.some(grant => permissionGrantMatches(grant, required)),
    )
    const actorHasAdditionalCapability = actorPermissions.some(
      required => !targetPermissions.some(grant => permissionGrantMatches(grant, required)),
    )
    if (!targetIsCovered || !actorHasAdditionalCapability) {
      throw new ForbiddenException('You cannot act on a user with equal or higher platform access')
    }
  }

  async getSnapshot(): Promise<PlatformAccessSnapshot> {
    const [permissions, roles] = await Promise.all([
      this.data.platformPermission.findMany({ orderBy: [{ namespace: 'asc' }, { action: 'asc' }] }),
      this.data.platformRole.findMany({
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        include: {
          permissions: { orderBy: [{ namespace: 'asc' }, { action: 'asc' }] },
          assignments: {
            orderBy: { createdAt: 'asc' },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  isSuperAdmin: true,
                  emails: {
                    where: { primary: true },
                    take: 1,
                    select: { email: true },
                  },
                },
              },
            },
          },
        },
      }),
    ])

    return { permissions, roles: roles.map(role => mapRole(role as RoleRecord)) }
  }

  async searchPrincipals(search = '', skip = 0, take = 20): Promise<PlatformAccessPrincipalPage> {
    const normalizedSearch = search.trim()
    if (normalizedSearch.length > MAX_PRINCIPAL_SEARCH_LENGTH) {
      throw new BadRequestException('User search must be 120 characters or fewer')
    }
    const boundedSkip = Math.max(0, Math.trunc(skip))
    const boundedTake = Math.min(MAX_PRINCIPAL_PAGE_SIZE, Math.max(1, Math.trunc(take)))
    const where = normalizedSearch
      ? {
          OR: [
            { displayName: { contains: normalizedSearch, mode: 'insensitive' as const } },
            { firstName: { contains: normalizedSearch, mode: 'insensitive' as const } },
            { lastName: { contains: normalizedSearch, mode: 'insensitive' as const } },
            {
              emails: {
                some: { email: { contains: normalizedSearch, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : {}
    const [users, total] = await Promise.all([
      this.data.user.findMany({
        where,
        skip: boundedSkip,
        take: boundedTake,
        orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          displayName: true,
          isSuperAdmin: true,
          emails: { where: { primary: true }, take: 1, select: { email: true } },
        },
      }),
      this.data.user.count({ where }),
    ])

    return {
      principals: users.map(user => ({
        id: user.id,
        displayName: user.displayName,
        email: user.emails[0]?.email ?? null,
        isSuperAdmin: user.isSuperAdmin,
      })),
      total,
    }
  }

  async createRole(actor: User, input: CreatePlatformAccessRoleInput): Promise<PlatformAccessRole> {
    const name = await this.validateRoleName(input.name)
    const description = normalizeDescription(input.description)
    const permissionKeys = uniquePermissionKeys(input.permissionKeys)
    const permissions = await this.resolveGrantablePermissions(actor, permissionKeys)

    const role = await this.data.$transaction(async transaction => {
      const created = await transaction.platformRole.create({
        data: {
          key: `custom.${randomUUID()}`,
          name,
          description,
          permissions: { connect: permissions.map(permission => ({ id: permission.id })) },
        },
        include: {
          permissions: true,
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  isSuperAdmin: true,
                  emails: { where: { primary: true }, take: 1, select: { email: true } },
                },
              },
            },
          },
        },
      })
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          entityId: created.id,
          entityType: 'PlatformRole',
          action: 'PLATFORM_ROLE_CREATED',
          changes: { name, permissionKeys },
        },
      })
      return created
    })

    return mapRole(role as RoleRecord)
  }

  async updateRole(actor: User, input: UpdatePlatformAccessRoleInput): Promise<PlatformAccessRole> {
    const existing = await this.requireMutableRole(input.roleId)
    await this.assertGrantCeiling(
      actor,
      existing.permissions.map(permission => permission.key),
    )
    await this.assertCanManageAssignees(
      actor.id,
      existing.assignments.map(assignment => assignment.userId),
    )
    const name = await this.validateRoleName(input.name, existing.id)
    const description = normalizeDescription(input.description)
    const permissionKeys = uniquePermissionKeys(input.permissionKeys)
    const permissions = await this.resolveGrantablePermissions(actor, permissionKeys)

    const role = await this.data.$transaction(async transaction => {
      const updated = await transaction.platformRole.update({
        where: { id: existing.id },
        data: {
          name,
          description,
          permissions: { set: permissions.map(permission => ({ id: permission.id })) },
        },
        include: {
          permissions: true,
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  isSuperAdmin: true,
                  emails: { where: { primary: true }, take: 1, select: { email: true } },
                },
              },
            },
          },
        },
      })
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          entityId: existing.id,
          entityType: 'PlatformRole',
          action: 'PLATFORM_ROLE_UPDATED',
          changes: {
            name: { before: existing.name, after: name },
            permissionKeys: {
              before: existing.permissions.map(permission => permission.key),
              after: permissionKeys,
            },
          },
        },
      })
      return updated
    })

    return mapRole(role as RoleRecord)
  }

  async deleteRole(actor: User, roleId: string): Promise<boolean> {
    const existing = await this.requireMutableRole(roleId)
    await this.assertGrantCeiling(
      actor,
      existing.permissions.map(permission => permission.key),
    )
    if (existing.assignments.length > 0) {
      throw new BadRequestException('Remove every role assignment before deleting this role')
    }

    await this.data.$transaction(async transaction => {
      await transaction.platformRole.delete({ where: { id: existing.id } })
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          entityId: existing.id,
          entityType: 'PlatformRole',
          action: 'PLATFORM_ROLE_DELETED',
          changes: { name: existing.name },
        },
      })
    })
    return true
  }

  async assignRole(actor: User, roleId: string, userId: string): Promise<PlatformAccessRole> {
    const role = await this.requireMutableRole(roleId)
    await this.assertGrantCeiling(
      actor,
      role.permissions.map(permission => permission.key),
    )
    await this.requireActiveUser(userId)
    await this.assertCanManagePrincipal(actor.id, userId)

    await this.data.$transaction(async transaction => {
      await transaction.platformRoleAssignment.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: { assignedById: actor.id },
        create: { userId, roleId, assignedById: actor.id },
      })
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          entityId: roleId,
          entityType: 'PlatformRoleAssignment',
          action: 'PLATFORM_ROLE_ASSIGNED',
          changes: { targetUserId: userId, roleName: role.name },
        },
      })
    })

    return this.getRole(roleId)
  }

  async revokeRole(actor: User, roleId: string, userId: string): Promise<PlatformAccessRole> {
    const role = await this.requireMutableRole(roleId)
    await this.assertGrantCeiling(
      actor,
      role.permissions.map(permission => permission.key),
    )
    await this.assertCanManagePrincipal(actor.id, userId)
    const assignment = await this.data.platformRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId } },
      select: { id: true },
    })
    if (!assignment) throw new NotFoundException('Role assignment not found')

    await this.data.$transaction(async transaction => {
      await transaction.platformRoleAssignment.delete({ where: { id: assignment.id } })
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          entityId: roleId,
          entityType: 'PlatformRoleAssignment',
          action: 'PLATFORM_ROLE_REVOKED',
          changes: { targetUserId: userId, roleName: role.name },
        },
      })
    })

    return this.getRole(roleId)
  }

  private async getRole(roleId: string): Promise<PlatformAccessRole> {
    const role = await this.data.platformRole.findUnique({
      where: { id: roleId },
      include: {
        permissions: { orderBy: [{ namespace: 'asc' }, { action: 'asc' }] },
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                isSuperAdmin: true,
                emails: { where: { primary: true }, take: 1, select: { email: true } },
              },
            },
          },
        },
      },
    })
    if (!role) throw new NotFoundException('Platform role not found')
    return mapRole(role as RoleRecord)
  }

  private async requireMutableRole(roleId: string) {
    const role = await this.data.platformRole.findUnique({
      where: { id: roleId },
      include: { permissions: true, assignments: { select: { id: true, userId: true } } },
    })
    if (!role) throw new NotFoundException('Platform role not found')
    if (role.isSystem) throw new ForbiddenException('System roles cannot be changed')
    return role
  }

  private async requireActiveUser(userId: string): Promise<void> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    })
    if (!user) throw new NotFoundException('User not found')
    if (!user.isActive)
      throw new BadRequestException('Roles cannot be assigned to an inactive user')
  }

  private async validateRoleName(value: string, excludeRoleId?: string): Promise<string> {
    const name = normalizeRoleName(value)
    const duplicate = await this.data.platformRole.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}),
      },
      select: { id: true },
    })
    if (duplicate) throw new BadRequestException('A platform role with this name already exists')
    return name
  }

  private async resolveGrantablePermissions(actor: User, permissionKeys: string[]) {
    const permissions = await this.data.platformPermission.findMany({
      where: { key: { in: permissionKeys } },
    })
    if (permissions.length !== permissionKeys.length) {
      throw new BadRequestException('One or more platform permissions are not in the catalog')
    }
    await this.assertGrantCeiling(actor, permissionKeys)
    return permissions
  }

  private async assertGrantCeiling(actor: User, permissionKeys: readonly string[]): Promise<void> {
    if (actor.isSuperAdmin) return
    const actorPermissions = await this.getUserPlatformPermissions(actor.id)
    const exceedsCeiling = permissionKeys.some(
      required => !actorPermissions.some(grant => permissionGrantMatches(grant, required)),
    )
    if (exceedsCeiling) {
      throw new ForbiddenException('You cannot grant or manage permissions above your own access')
    }
  }

  private async assertCanManageAssignees(actorUserId: string, userIds: readonly string[]) {
    await Promise.all(
      userIds.map(userId => this.assertCanManagePrincipal(actorUserId, userId, 'manage')),
    )
  }
}

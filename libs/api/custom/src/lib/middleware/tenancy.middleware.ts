import { Injectable, NestMiddleware, Logger, ForbiddenException, Optional } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import { OrganizationContext, AuthCacheService } from '@nestled-template/api/utils'

@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenancyMiddleware.name)

  constructor(
    private readonly data: ApiCoreDataAccessService,
    @Optional() private readonly authCache?: AuthCacheService,
  ) {}

  private async resolveOrganizationId(req: Request & { user?: User }): Promise<string | undefined> {
    const rawHeader = req.headers['x-organization-id']
    const fromHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
    if (fromHeader) return fromHeader

    if (!req.user) return undefined

    if (req.user.activeOrganizationId) return req.user.activeOrganizationId

    if (this.authCache?.isEnabled()) {
      const cachedOrgId = await this.authCache.getUserActiveOrganization(req.user.id)
      if (cachedOrgId) return cachedOrgId
    }

    return undefined
  }

  async use(
    req: Request & { user?: User; organizationContext?: OrganizationContext },
    res: Response,
    next: NextFunction,
  ) {
    // Skip if no authenticated user
    if (!req.user) {
      return next()
    }

    try {
      const organizationId = await this.resolveOrganizationId(req)

      // If still no organization, skip (some endpoints don't require org context)
      if (!organizationId) {
        this.logger.debug(`No organization context for user ${req.user.id}`)
        return next()
      }

      // Check Redis cache for membership context
      const cachedContext = await this.getCachedMembership(req.user.id, organizationId)
      if (cachedContext) {
        req.organizationContext = this.applySuperAdminBoost(cachedContext, req.user)
        this.logger.debug(
          `Organization context from cache: User ${req.user.id} -> Org ${organizationId} (${cachedContext.roleName})`,
        )
        return next()
      }

      // Query database for membership
      const membership = await this.data.organizationMember.findFirst({
        where: {
          userId: req.user.id,
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

      if (!membership) {
        throw new ForbiddenException(
          `User ${req.user.id} is not a member of organization ${organizationId}`,
        )
      }

      // Build organization context with permissions
      const organizationContext: OrganizationContext = {
        organizationId,
        userId: req.user.id,
        roleId: membership.roleId,
        roleName: membership.role.name,
        permissions: membership.role.permissions.map(p => ({
          subject: p.subject,
          action: p.action,
        })),
      }

      // Cache the membership context in Redis
      if (this.authCache?.isEnabled()) {
        this.authCache
          .setMembership(req.user.id, organizationId, organizationContext)
          .catch(err => {
            this.logger.warn(`Failed to cache membership: ${err.message}`)
          })
      }

      // Apply super admin boost and attach to request
      req.organizationContext = this.applySuperAdminBoost(organizationContext, req.user)

      this.logger.debug(
        `Organization context set: User ${req.user.id} -> Org ${organizationId} (${membership.role.name})`,
      )

      next()
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      const err = error as Error
      this.logger.error(`Error in tenancy middleware: ${err.message}`, err.stack)
      next(error)
    }
  }

  private async getCachedMembership(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationContext | null> {
    if (!this.authCache?.isEnabled()) return null
    return (await this.authCache.getMembership(userId, organizationId)) ?? null
  }

  /**
   * Super admins get all:manage permission automatically.
   * This grants them full access to any organization without needing explicit role permissions.
   */
  private applySuperAdminBoost(context: OrganizationContext, user: User): OrganizationContext {
    if (!user.isSuperAdmin) {
      return context
    }

    // Check if already has all:manage
    const hasAllManage = context.permissions.some(p => p.subject === 'all' && p.action === 'manage')

    if (hasAllManage) {
      return context
    }

    // Add super admin permission
    return {
      ...context,
      permissions: [...context.permissions, { subject: 'all', action: 'manage' }],
    }
  }
}

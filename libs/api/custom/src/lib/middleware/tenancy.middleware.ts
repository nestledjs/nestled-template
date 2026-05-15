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
    @Optional() private readonly authCache?: AuthCacheService
  ) {}

  async use(req: Request & { user?: User; organizationContext?: OrganizationContext }, res: Response, next: NextFunction) {
    // Skip if no authenticated user
    if (!req.user) {
      return next()
    }

    try {
      // TIER 1: Try to get organization ID from header (explicit context)
      let organizationId = req.headers['x-organization-id'] as string

      // TIER 2: Fall back to user's active organization
      if (!organizationId && req.user.activeOrganizationId) {
        organizationId = req.user.activeOrganizationId
      }

      // TIER 3: Try Redis cache for active organization
      if (!organizationId && this.authCache?.isEnabled()) {
        const cachedOrgId = await this.authCache.getUserActiveOrganization(req.user.id)
        if (cachedOrgId) {
          organizationId = cachedOrgId
        }
      }

      // If still no organization, skip (some endpoints don't require org context)
      if (!organizationId) {
        this.logger.debug(`No organization context for user ${req.user.id}`)
        return next()
      }

      // Check Redis cache for membership context
      if (this.authCache?.isEnabled()) {
        const cachedContext = await this.authCache.getMembership(req.user.id, organizationId)
        if (cachedContext) {
          // Apply super admin boost if needed
          const finalContext = this.applySuperAdminBoost(cachedContext, req.user)
          req.organizationContext = finalContext
          this.logger.debug(
            `Organization context from cache: User ${req.user.id} -> Org ${organizationId} (${cachedContext.roleName})`
          )
          return next()
        }
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
          `User ${req.user.id} is not a member of organization ${organizationId}`
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
        this.authCache.setMembership(req.user.id, organizationId, organizationContext).catch(err => {
          this.logger.warn(`Failed to cache membership: ${err.message}`)
        })
      }

      // Apply super admin boost and attach to request
      req.organizationContext = this.applySuperAdminBoost(organizationContext, req.user)

      this.logger.debug(
        `Organization context set: User ${req.user.id} -> Org ${organizationId} (${membership.role.name})`
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

  /**
   * Super admins get all:manage permission automatically.
   * This grants them full access to any organization without needing explicit role permissions.
   */
  private applySuperAdminBoost(context: OrganizationContext, user: User): OrganizationContext {
    if (!user.isSuperAdmin) {
      return context
    }

    // Check if already has all:manage
    const hasAllManage = context.permissions.some(
      p => p.subject === 'all' && p.action === 'manage'
    )

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

import { Injectable, Logger, Optional } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import { OrganizationContext } from '../types/nest-context-type'
import { AuthCacheService } from './auth-cache.service'

type RequestWithOrganizationContext = {
  headers?: Record<string, string | string[] | undefined>
  user?: User
  organizationContext?: OrganizationContext
}

@Injectable()
export class OrganizationContextService {
  private readonly logger = new Logger(OrganizationContextService.name)

  constructor(
    private readonly data: ApiCoreDataAccessService,
    @Optional() private readonly authCache?: AuthCacheService,
  ) {}

  async attach(req: RequestWithOrganizationContext): Promise<OrganizationContext | undefined> {
    if (!req.user) return undefined
    if (req.organizationContext) return req.organizationContext

    const organizationId = await this.resolveOrganizationId(req)
    if (!organizationId) return undefined

    const cachedContext = await this.getCachedMembership(req.user.id, organizationId)
    if (cachedContext) {
      req.organizationContext = this.applySuperAdminBoost(cachedContext, req.user)
      return req.organizationContext
    }

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

    if (!membership) return undefined

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

    await this.cacheMembership(req.user.id, organizationId, organizationContext)
    req.organizationContext = this.applySuperAdminBoost(organizationContext, req.user)
    return req.organizationContext
  }

  private async resolveOrganizationId(
    req: RequestWithOrganizationContext,
  ): Promise<string | undefined> {
    const rawHeader = req.headers?.['x-organization-id']
    const fromHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
    if (fromHeader) return fromHeader

    if (req.user?.activeOrganizationId) return req.user.activeOrganizationId

    if (req.user && this.authCache?.isEnabled()) {
      return (await this.authCache.getUserActiveOrganization(req.user.id)) ?? undefined
    }

    return undefined
  }

  private async getCachedMembership(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationContext | null> {
    if (!this.authCache?.isEnabled()) return null
    return (await this.authCache.getMembership(userId, organizationId)) ?? null
  }

  private async cacheMembership(
    userId: string,
    organizationId: string,
    context: OrganizationContext,
  ): Promise<void> {
    if (!this.authCache?.isEnabled()) return
    try {
      await this.authCache.setMembership(userId, organizationId, context)
    } catch (error) {
      this.logger.warn(`Failed to cache membership: ${(error as Error).message}`)
    }
  }

  private applySuperAdminBoost(context: OrganizationContext, user: User): OrganizationContext {
    const hasAllManage = context.permissions.some(p => p.subject === 'all' && p.action === 'manage')
    if (!user.isSuperAdmin || hasAllManage) {
      return context
    }

    return {
      ...context,
      permissions: [...context.permissions, { subject: 'all', action: 'manage' }],
    }
  }
}

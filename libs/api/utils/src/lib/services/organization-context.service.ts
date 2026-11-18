import { Injectable, Logger, Optional } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import { OrganizationContext } from '../types/nest-context-type'
import { AuthCacheService } from './auth-cache.service'

type RequestWithOrganizationContext = {
  headers?: Record<string, string | string[] | undefined>
  user?: User
  apiTokenOrganizationId?: string | null
  organizationContext?: OrganizationContext
}

@Injectable()
export class OrganizationContextService {
  private readonly logger = new Logger(OrganizationContextService.name)

  constructor(
    private readonly data: ApiCoreDataAccessService,
    @Optional() private readonly authCache?: AuthCacheService,
  ) {}

  async attach(
    req: RequestWithOrganizationContext,
    requestedOrganizationId?: string,
  ): Promise<OrganizationContext | undefined> {
    if (!req.user) return undefined

    const organizationId = requestedOrganizationId ?? (await this.resolveOrganizationId(req))
    if (!organizationId) return undefined

    // A context already on the request is reused only when it was built for this user and this
    // organization. Anything else is recomputed from the membership, and cleared if there is none,
    // so a decorator reading req.organizationContext later never sees a context nobody checked.
    const existing = req.organizationContext
    if (existing?.userId === req.user.id && existing.organizationId === organizationId) {
      return existing
    }
    req.organizationContext = undefined

    // Cross-request permission snapshots cannot authorize this request. Membership and role
    // edits may originate in administrative CRUD or a transaction outside cache invalidation.
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
    if (req.apiTokenOrganizationId) return req.apiTokenOrganizationId

    const rawHeader = req.headers?.['x-organization-id']
    const fromHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
    if (fromHeader) return fromHeader

    if (req.user?.activeOrganizationId) return req.user.activeOrganizationId

    if (req.user && this.authCache?.isEnabled()) {
      const cached = await this.authCache.lookupUserActiveOrganization(req.user.id)
      if (cached.status === 'hit') return cached.value
      // Redis failed: that says nothing about the user's organization. The database holds the
      // same value (the organization switch writes it there first), so ask it rather than leave
      // the request without an organization, which sends the user to the picker over an outage.
      // A database failure here propagates (GqlAuthGuard answers it with a 503).
      if (cached.status === 'unavailable') return this.activeOrganizationFromDatabase(req.user.id)
    }

    return undefined
  }

  private async activeOrganizationFromDatabase(userId: string): Promise<string | undefined> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      select: { activeOrganizationId: true },
    })
    return user?.activeOrganizationId ?? undefined
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

import { ExecutionContext, Injectable, ForbiddenException, Optional } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { AuthGuard } from '@nestjs/passport'
import { OrganizationContextService } from '../services/organization-context.service'
import { OrganizationContext } from '../types/nest-context-type'

/**
 * Guard that requires both authentication AND organization context.
 * Use this guard for resolvers that operate on organization-scoped data.
 *
 * This guard extends JWT authentication and additionally checks that:
 * 1. The user is authenticated (via JWT)
 * 2. An organization context is set on the request
 *
 * Organization context is resolved after JWT auth from:
 * - X-Organization-ID header (explicit context switch)
 * - User's activeOrganizationId (default)
 * - Cached active organization, when Redis auth cache is enabled
 */
@Injectable()
export class GqlOrganizationScopedGuard extends AuthGuard('jwt') {
  constructor(
    @Optional() private readonly organizationContextService?: OrganizationContextService,
  ) {
    super()
  }

  override getRequest(context: ExecutionContext): any {
    const ctx = GqlExecutionContext.create(context)
    return ctx.getContext().req
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = await super.canActivate(context)
    if (!canActivate) {
      return false
    }

    const req = this.getRequest(context)
    const organizationContext = await this.organizationContextService?.attach(req)
    this.assertValidContext(organizationContext ?? req.organizationContext)

    return true
  }

  private assertValidContext(
    organizationContext: OrganizationContext | undefined,
  ): asserts organizationContext is OrganizationContext {
    if (!organizationContext) {
      throw new ForbiddenException(
        'Organization context is required for this operation. Please set an active organization.',
      )
    }

    if (!organizationContext.organizationId || !organizationContext.roleId) {
      throw new ForbiddenException(
        'Invalid organization context. Please ensure you have a valid membership in the organization.',
      )
    }
  }
}

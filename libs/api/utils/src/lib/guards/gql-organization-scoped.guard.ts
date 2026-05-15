import { ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { AuthGuard } from '@nestjs/passport'
import { OrganizationContext } from '../types/nest-context-type'

/**
 * Guard that requires both authentication AND organization context.
 * Use this guard for resolvers that operate on organization-scoped data.
 *
 * This guard extends JWT authentication and additionally checks that:
 * 1. The user is authenticated (via JWT)
 * 2. An organization context is set on the request
 *
 * The organization context is set by the TenancyMiddleware based on:
 * - X-Organization-ID header (explicit context switch)
 * - User's activeOrganizationId (default)
 *
 * Usage:
 * ```typescript
 * @Resolver()
 * export class MyResolver {
 *   @Query(() => MyType)
 *   @UseGuards(GqlOrganizationScopedGuard, PermissionsGuard)
 *   @RequirePermissions({ subject: 'myresource', action: 'read' })
 *   async myQuery(@CtxOrganization() orgContext: OrganizationContext) {
 *     // orgContext is guaranteed to be present
 *   }
 * }
 * ```
 */
@Injectable()
export class GqlOrganizationScopedGuard extends AuthGuard('jwt') {
  override getRequest(context: ExecutionContext): any {
    const ctx = GqlExecutionContext.create(context)
    return ctx.getContext().req
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, run the standard JWT authentication
    const canActivate = await super.canActivate(context)
    if (!canActivate) {
      return false
    }

    // Then check for organization context
    const req = this.getRequest(context)
    const organizationContext: OrganizationContext | undefined = req.organizationContext

    if (!organizationContext) {
      throw new ForbiddenException(
        'Organization context is required for this operation. Please set an active organization.'
      )
    }

    // Check if organization context is complete
    if (!organizationContext.organizationId || !organizationContext.roleId) {
      throw new ForbiddenException(
        'Invalid organization context. Please ensure you have a valid membership in the organization.'
      )
    }

    return true
  }
}

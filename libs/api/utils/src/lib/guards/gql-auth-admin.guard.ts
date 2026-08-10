import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { AuthGuard } from '@nestjs/passport'
import { User } from '@nestled-template/api/core/models'

@Injectable()
export class GqlAuthAdminGuard extends AuthGuard('jwt') {
  override getRequest(context: ExecutionContext) {
    if (context.getType<string>() === 'http') {
      return context.switchToHttp().getRequest()
    }

    const ctx = GqlExecutionContext.create(context)

    return ctx.getContext().req
  }

  constructor() {
    super()
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context)
    const req = this.getRequest(context)

    if (!req?.user) {
      return false
    }
    const hasAccess = this.hasAccess(req.user)

    if (!hasAccess) {
      throw new ForbiddenException(`You need to have Super Admin access`)
    }
    return !!(req?.user && this.hasAccess(req.user))
  }

  private hasAccess(user: User): boolean {
    // Only super admins can access admin-protected routes
    return !!user.isSuperAdmin
  }
}

import { ExecutionContext, Injectable, Logger, Optional } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { AuthGuard } from '@nestjs/passport'
import { OrganizationContextService } from '../services/organization-context.service'

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(GqlAuthGuard.name)

  constructor(
    @Optional() private readonly organizationContextService?: OrganizationContextService,
  ) {
    super()
  }

  override getRequest(context: ExecutionContext): Record<string, unknown> {
    if (context.getType<string>() === 'http') {
      return context.switchToHttp().getRequest<Record<string, unknown>>()
    }

    const ctx = GqlExecutionContext.create(context)
    return ctx.getContext().req
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = await super.canActivate(context)
    if (!canActivate) {
      return false
    }

    const req = this.getRequest(context)
    try {
      await this.organizationContextService?.attach(req)
    } catch (error) {
      // Plain authenticated operations should still work without org context.
      this.logger.debug(`Failed to preload organization context: ${(error as Error).message}`)
    }

    return true
  }
}

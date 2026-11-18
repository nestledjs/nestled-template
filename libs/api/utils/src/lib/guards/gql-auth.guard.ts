import {
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
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
      // A refusal (a 4xx) leaves the request without organization context: plain authenticated
      // operations still work, and organization-scoped ones refuse on their own. Not being a
      // member is not a throw at all (`attach` answers undefined).
      if (error instanceof HttpException && error.getStatus() < 500) {
        this.logger.debug(`Organization context not attached: ${error.message}`)
        return true
      }
      // A 5xx already says what it is.
      if (error instanceof HttpException) throw error
      // Anything else is a failed lookup (database or Redis down) or a bug. Swallowing it sent the
      // user to the organization picker instead of the outage screen. A 503 is outage evidence
      // to clients and keeps the session; never a 401.
      this.logger.error(
        `Organization context could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new ServiceUnavailableException('Organization context is temporarily unavailable')
    }

    return true
  }
}

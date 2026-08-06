import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_LEVEL_KEY, AuthLevel } from './auth-level.decorator'

/**
 * Fail-closed default for every operation.
 *
 * NestJS applies no guard unless one is asked for, so a resolver or route with no `@UseGuards` is
 * reachable anonymously. Doctor catches that in review, but nothing enforced it at runtime — a new
 * endpoint shipped open unless its author remembered otherwise.
 *
 * This guard inverts that. An operation must say what it is:
 *
 * - `@Public()` passes.
 * - `@Authenticated()` or `@AdminOnly()` pass here and defer to the guard that does the real check.
 *   Global guards run *before* method guards, so `req.user` is not populated yet and this guard
 *   cannot evaluate identity itself. Its job is to refuse the undeclared, not to authenticate.
 * - Anything else is refused.
 *
 * There is deliberately no fallback. An earlier version accepted an attached auth guard as a
 * declaration, so that generated CRUD kept working before `@nestledjs/generators` emitted the
 * decorators. That inferred intent from whichever guards happened to be present — the same
 * reasoning that let a throttler read as authentication — and nothing confined it to generated
 * code. Since 1.1.6 every generated operation declares its own level, so the fallback is gone and
 * declaration is the only way through.
 */
@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler()
    const controller = context.getClass()

    const level = this.reflector.getAllAndOverride<AuthLevel | undefined>(AUTH_LEVEL_KEY, [
      handler,
      controller,
    ])

    if (level) return true

    throw new ForbiddenException(
      `${controller.name}.${handler.name} declares no access level. Add @Public(), @Authenticated(), or @AdminOnly().`,
    )
  }
}

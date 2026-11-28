import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { ThrottlerException, ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler'

/**
 * ThrottlerGuard for GraphQL resolvers. The stock guard reads req/res off the HTTP context, which
 * is empty under Apollo — without this override the guard silently tracks nothing.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context).getContext()
    return { req: ctx.req, res: ctx.res }
  }

  /**
   * Tracks by `req.ip`, NOT by the `X-Forwarded-For` header directly.
   *
   * This distinction is the whole guard: XFF is attacker-controlled, so keying off it hands out a
   * fresh bucket per forged header and the limit becomes decorative. `req.ip` is what Express
   * derives from XFF according to the configured `trust proxy` hop count, which only counts hops it
   * actually trusts. That makes correct TRUST_PROXY_HOPS configuration load-bearing for this limit —
   * see the boot-time warning in main.ts.
   */
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return req['ip'] ?? req['socket']?.remoteAddress ?? 'unknown'
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException(
      'Too many attempts from this address. Please wait a while and try again.',
    )
  }
}

/**
 * The same guard, keyed by the authenticated user instead of the client address. Available as a
 * tool: no template resolver uses it.
 *
 * On an operation already behind `GqlAuthGuard`, the account is the meaningful subject. An address
 * key is too loose (one user rotating addresses gets a fresh bucket each time) and too tight (an
 * office behind one NAT address shares a single bucket). Use it on authenticated mutations that
 * cost something to serve, such as one that sends mail.
 *
 * ORDER MATTERS: declare it after the auth guard, `@UseGuards(GqlAuthGuard, GqlUserThrottlerGuard)`.
 * Nest runs guards in the order listed, so listing this one first runs it before `req.user` exists,
 * and every caller falls back to the address bucket. `assertUserKeyed` logs a warning when that
 * happens rather than degrading quietly.
 *
 * It reuses the `signup` throttler AuthModule registers rather than a second named one:
 * `ThrottlerGuard` evaluates every configured throttler, so a new one would also apply to
 * `register`, `forgotPassword` and `resendVerificationEmail`. Buckets stay separate anyway, because
 * the storage key includes the resolver class and handler name. Set a per-operation limit with
 * `@Throttle({ signup: { limit, ttl } })`.
 */
@Injectable()
export class GqlUserThrottlerGuard extends GqlThrottlerGuard {
  // Not `logger`: @nestjs/throttler 6.7 declares a protected `logger` on ThrottlerGuard, and a private
  // field of the same name no longer compiles against it.
  private readonly userKeyLogger = new Logger(GqlUserThrottlerGuard.name)

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = (req['user'] as { id?: string } | undefined)?.id
    if (userId) {
      return `user:${userId}`
    }
    this.assertUserKeyed()
    return `ip:${await super.getTracker(req)}`
  }

  /**
   * Reached only when the guard runs without an authenticated request: it was declared before the
   * auth guard, or used on a resolver without one. The limit still applies, keyed by address, so the
   * operation is never left unthrottled; the warning is there because the weaker key is a
   * misconfiguration, not a design choice.
   */
  private assertUserKeyed(): void {
    this.userKeyLogger.warn(
      'GqlUserThrottlerGuard ran with no authenticated user; falling back to IP keying. ' +
        'Declare it after GqlAuthGuard in @UseGuards to key by account.',
    )
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException(
      'Too many requests from this account. Please wait a while and try again.',
    )
  }
}

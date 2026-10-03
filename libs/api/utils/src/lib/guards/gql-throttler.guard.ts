import { ExecutionContext, Injectable } from '@nestjs/common'
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

import { Injectable } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'
import {
  defaultApiOrigin,
  isPublicApiOrigin,
  isReachableApiOrigin,
  normalizeApiOrigin,
} from './api-url'

/** The subset of an Express/GraphQL request this service reads. */
export interface ForwardedRequest {
  protocol?: string
  get(name: string): string | undefined
}

/**
 * Single source of truth for the PUBLIC origin of this API — the value used in URLs shown to users
 * or handed to third parties (CRM webhook URLs, OAuth redirect_uri, MCP base URL, upload URLs).
 *
 * Precedence, most trusted first:
 *   1. Configured API_URL, when it names a PUBLIC host. Explicit config always wins.
 *   2. The proxy-forwarded request origin (x-forwarded-proto / x-forwarded-host). Railway sets
 *      both; main.ts's .well-known handler already relies on this and returns the correct
 *      https://api.muzebook.com in production. Used ONLY as a fallback, so a forged Host header
 *      cannot override correct configuration — and with no public config it can only affect the
 *      response to the forger's own request.
 *   3. A loopback API_URL (http://localhost:<PORT>). Correct in local dev, where there is no proxy
 *      to ask, but useless in a member-facing URL — hence BELOW the request origin, not above it.
 *      An unset API_URL lands here too: Joi defaults it from HOST/PORT, and defaultOrigin rewrites
 *      a wildcard bind host to localhost. Ranking it above tier 2 would make the request fallback
 *      dead code in exactly the PIR-223 case it exists for.
 *   4. http://localhost:<PORT>. Never a bind address.
 */
@Injectable()
export class PublicUrlService {
  constructor(private readonly config: NestConfigService) {}

  origin(req?: ForwardedRequest): string {
    const configured = normalizeApiOrigin(this.config.get<string>('apiUrl'), {
      host: this.config.get<string>('host'),
      port: this.config.get<string | number>('port'),
    })
    if (isPublicApiOrigin(configured)) return configured

    const fromRequest = this.originFromRequest(req)
    if (fromRequest) return fromRequest

    if (isReachableApiOrigin(configured)) return configured

    return defaultApiOrigin('localhost', this.config.get<string | number>('port'))
  }

  /** Absolute URL for a path under the `/api` global prefix. `path` may omit the leading slash. */
  apiUrl(path: string, req?: ForwardedRequest): string {
    const suffix = path.startsWith('/') ? path : `/${path}`
    return `${this.origin(req)}/api${suffix}`
  }

  // `x-forwarded-*` can be a comma-separated chain when several proxies are in play — take the
  // first (client-facing) hop.
  private originFromRequest(req?: ForwardedRequest): string | null {
    if (!req) return null
    const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol
    const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host')
    if (!proto || !host) return null
    const candidate = normalizeApiOrigin(`${proto}://${host}`)
    return isReachableApiOrigin(candidate) ? candidate : null
  }
}

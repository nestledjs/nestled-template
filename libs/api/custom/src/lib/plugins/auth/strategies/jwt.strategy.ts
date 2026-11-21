import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtService } from '@nestjs/jwt'
import { User } from '@nestled-template/api/core/models'
import {
  API_ERROR_CODES,
  forbiddenWithCode,
  requestCookieValues,
  selectSessionToken,
} from '@nestled-template/api/utils'
import { AuthService } from '../auth.service'
import { ApiTokensService } from '../../api-tokens/api-tokens.service'
import type { AuthTokenClaims } from '../auth-token-claims'

const API_TOKEN_USER_KEY = '__apiTokenUser' as const

type ApiTokenRequest = Request & {
  [API_TOKEN_USER_KEY]?: User
  apiTokenId?: string
  apiTokenOrganizationId?: string | null
}

type TokenExtractor = (req: Request) => string | null

type ValidatedApiToken = NonNullable<Awaited<ReturnType<ApiTokensService['validateApiToken']>>>

/**
 * A refusal. `rejected`: the credential is no good (unknown, revoked, expired, its owner gone or
 * disabled), a 401 through passport's `fail`. `forbidden`: the credential is valid but not allowed
 * here, a 403 the client must not read as "drop the token". It goes through passport's `error`,
 * because AuthGuard turns every `fail` into an UnauthorizedException whatever status it carries.
 */
type ApiTokenRefusal = { rejected: string } | { forbidden: ForbiddenException }

type ApiTokenVerdict = ApiTokenRefusal | { user: User; result: ValidatedApiToken }

const API_TOKEN_PATTERN = /^[a-f0-9]{64}$/i

function sessionCookieName(): string {
  return process.env['VITE_COOKIE_NAME'] || process.env['API_COOKIE_NAME'] || '__session'
}

/**
 * The bearer header, else the session cookie. With several same-name session cookies the newest
 * one whose signature verifies is used (see selectSessionToken), so neither a stale cookie that
 * happens to come first nor a forged one with a far-future `iat` can shadow the valid session.
 */
function createHeaderAndCookieExtractor(jwtSecret: string): TokenExtractor {
  const verifier = new JwtService({ secret: jwtSecret })
  const verify = (token: string): object | null => {
    try {
      return verifier.verify<object>(token)
    } catch {
      return null
    }
  }

  return (req: Request) => {
    const authHeaderToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req)
    if (authHeaderToken) {
      return authHeaderToken
    }
    return selectSessionToken(requestCookieValues(req, sessionCookieName()), verify) ?? null
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name)
  private readonly extractToken: TokenExtractor

  constructor(
    private readonly auth: AuthService,
    private readonly apiTokensService: ApiTokensService,
  ) {
    const jwtSecret = process.env['JWT_SECRET']
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set')
    }

    const extractToken = createHeaderAndCookieExtractor(jwtSecret)
    super({
      jwtFromRequest: extractToken,
      secretOrKey: jwtSecret,
      ignoreExpiration: false,
      passReqToCallback: true,
    })
    this.extractToken = extractToken
  }

  async validate(req: Request, payload: AuthTokenClaims): Promise<User> {
    const apiTokenUser = (req as ApiTokenRequest)[API_TOKEN_USER_KEY]
    if (apiTokenUser) {
      return apiTokenUser
    }

    if (!payload?.userId) {
      throw new UnauthorizedException('Invalid JWT payload.')
    }
    const user = await this.auth.validateUser(payload.userId)
    if (!user || user.isActive === false) {
      throw new UnauthorizedException('User from token not found or invalid.')
    }

    // The token's auth generation, its session (if any) and, for emulation, the admin's
    // generation must all still be current.
    if (!(await this.auth.isTokenCurrent(payload, user))) {
      throw new UnauthorizedException('Session has been invalidated.')
    }

    // Attach emulation metadata to user object if present in JWT
    if (payload.isEmulating && payload.originalAdminId) {
      return {
        ...user,
        isEmulating: true,
        originalAdminId: payload.originalAdminId,
      } as User
    }

    return user
  }

  /**
   * Passport calls this and ignores its return value, so it stays a void method: a promise it
   * returned would be dropped, and a rejection in it would leave the request with no answer.
   * Anything that escapes `authenticateAsync` is passed to `this.error` instead.
   */
  override authenticate(req: Request, options?: object): void {
    this.authenticateAsync(req, options).catch((error: unknown) => this.error(error as Error))
  }

  /**
   * API tokens are opaque 64-character hex strings, not JWTs. Check them before
   * passport-jwt attempts to parse the bearer value as a JWT.
   */
  async authenticateAsync(req: Request, options?: object): Promise<void> {
    const token = this.extractToken(req)

    if (token && API_TOKEN_PATTERN.test(token)) {
      return this.authenticateApiToken(req as ApiTokenRequest, token)
    }

    return super.authenticate(req, options)
  }

  /**
   * The API-token path: turns `checkApiToken`'s verdict into passport's success, fail or error.
   */
  private async authenticateApiToken(req: ApiTokenRequest, token: string): Promise<void> {
    let verdict: ApiTokenVerdict
    try {
      verdict = await this.checkApiToken(req, token)
    } catch (error) {
      // Every "this token is not good" answer in checkApiToken is a returned verdict, not a throw.
      // Reaching here means the lookup itself failed (the database is down, say), which says
      // nothing about the token: a 401 would make the client discard a good token. A 503 is what
      // clients treat as outage evidence, so they keep the token and retry. Over GraphQL it
      // arrives as INTERNAL_SERVER_ERROR with status 503, never UNAUTHENTICATED.
      this.logger.error(
        `API token validation could not complete: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      )
      return this.error(
        new ServiceUnavailableException('API token validation is temporarily unavailable'),
      )
    }

    if ('rejected' in verdict) {
      return this.fail({ message: verdict.rejected }, 401)
    }
    if ('forbidden' in verdict) {
      return this.error(verdict.forbidden)
    }

    const { user, result } = verdict
    req[API_TOKEN_USER_KEY] = user
    req.apiTokenId = result.tokenId
    req.apiTokenOrganizationId = result.organizationId
    this.apiTokensService.recordTokenUse(result.tokenId)

    return this.success(user)
  }

  /**
   * Validates an API token and loads its user. Every refusal is a returned verdict; a throw means
   * a lookup failed (see authenticateApiToken).
   */
  private async checkApiToken(req: ApiTokenRequest, token: string): Promise<ApiTokenVerdict> {
    const result = await this.apiTokensService.validateApiToken(token)
    if (!result) {
      return { rejected: 'Invalid or expired API token' }
    }

    // A token bound to a resource (RFC 8707) — the MCP endpoint, for tokens MCP OAuth issues —
    // is accepted only there (ApiTokenAuthMiddleware), never by the rest of the API. The token
    // itself is valid, so this is a 403: a 401 would tell the client to throw away a token that
    // still works at the MCP endpoint.
    if (result.resource) {
      this.logger.warn(`API token ${result.tokenId} is bound to ${result.resource}; refused here`)
      return {
        forbidden: forbiddenWithCode(
          API_ERROR_CODES.API_TOKEN_RESOURCE_MISMATCH,
          'API token is not valid for this resource',
        ),
      }
    }

    const scopeRefusal = this.bindOrganizationScope(req, result)
    if (scopeRefusal) {
      return scopeRefusal
    }

    const user = await this.auth.validateUser(result.userId)
    if (!user || user.isActive === false) {
      return { rejected: 'User not found for API token' }
    }

    return { user, result }
  }

  /**
   * An organization-scoped token is a RESTRICTION below the user's own access, not a hint.
   * Without this, a user who belongs to both A and B, holding a token scoped only to A, can act in
   * B just by sending x-organization-id: B — every membership check downstream still passes,
   * because the user really is a member of B. Binds the header to the token's scope before the
   * user lookup, so a mismatched request costs nothing and cannot proceed. Returns the refusal, or
   * null when the request may go on.
   */
  private bindOrganizationScope(
    req: ApiTokenRequest,
    result: ValidatedApiToken,
  ): ApiTokenRefusal | null {
    if (!result.organizationId) {
      return null
    }

    const rawHeader = req.headers['x-organization-id']
    const requestedOrganizationId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader

    if (requestedOrganizationId && requestedOrganizationId !== result.organizationId) {
      this.logger.warn(
        `API token ${result.tokenId} is scoped to organization ${result.organizationId} but the request asked for ${requestedOrganizationId}`,
      )
      // A 403 with a code, not a 401: the token is valid for its own organization, and an
      // API-token client (MCP, scripts) must not drop it.
      return {
        forbidden: forbiddenWithCode(
          API_ERROR_CODES.API_TOKEN_ORGANIZATION_MISMATCH,
          'API token is not scoped to the requested organization',
        ),
      }
    }

    // Assigned unconditionally, and that is deliberate — it does two jobs. When the header was
    // absent it states the token's organization, rather than letting resolution fall through to
    // the user's active organization, which is not what the token authorizes. When the header was
    // present it has already been proven equal above, and writing the scalar collapses a repeated
    // header (`['org-1', 'org-1']`) to a single value, so a downstream consumer reading it
    // naively cannot receive an array.
    req.headers['x-organization-id'] = result.organizationId
    return null
  }
}

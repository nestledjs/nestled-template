import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtService } from '@nestjs/jwt'
import { User } from '@nestled-template/api/core/models'
import { requestCookieValues, selectSessionToken } from '@nestled-template/api/utils'
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
   * API tokens are opaque 64-character hex strings, not JWTs. Check them before
   * passport-jwt attempts to parse the bearer value as a JWT.
   */
  override async authenticate(req: Request, options?: object): Promise<void> {
    const token = this.extractToken(req)

    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      try {
        const result = await this.apiTokensService.validateApiToken(token)
        if (!result) {
          return this.fail({ message: 'Invalid or expired API token' }, 401)
        }

        // A token bound to a resource (RFC 8707) — the MCP endpoint, for tokens MCP OAuth issues —
        // is accepted only there (ApiTokenAuthMiddleware), never by the rest of the API.
        if (result.resource) {
          this.logger.warn(
            `API token ${result.tokenId} is bound to ${result.resource}; refused here`,
          )
          return this.fail({ message: 'API token is not valid for this resource' }, 401)
        }

        // An organization-scoped token is a RESTRICTION below the user's own access, not a hint.
        // Without this, a user who belongs to both A and B, holding a token scoped only to A, can
        // act in B just by sending x-organization-id: B — every membership check downstream still
        // passes, because the user really is a member of B. Bind the header to the token's scope
        // before the user lookup, so a mismatched request costs nothing and cannot proceed.
        if (result.organizationId) {
          const rawHeader = req.headers['x-organization-id']
          const requestedOrganizationId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader

          if (requestedOrganizationId && requestedOrganizationId !== result.organizationId) {
            this.logger.warn(
              `API token ${result.tokenId} is scoped to organization ${result.organizationId} but the request asked for ${requestedOrganizationId}`,
            )
            return this.fail(
              { message: 'API token is not scoped to the requested organization' },
              403,
            )
          }

          // Assigned unconditionally, and that is deliberate — it does two jobs. When the header
          // was absent it states the token's organization, rather than letting resolution fall
          // through to the user's active organization, which is not what the token authorizes.
          // When the header was present it has already been proven equal above, and writing the
          // scalar collapses a repeated header (`['org-1', 'org-1']`) to a single value, so a
          // downstream consumer reading it naively cannot receive an array.
          req.headers['x-organization-id'] = result.organizationId
        }

        const user = await this.auth.validateUser(result.userId)
        if (!user || user.isActive === false) {
          return this.fail({ message: 'User not found for API token' }, 401)
        }

        const apiTokenReq = req as ApiTokenRequest
        apiTokenReq[API_TOKEN_USER_KEY] = user
        apiTokenReq.apiTokenId = result.tokenId
        apiTokenReq.apiTokenOrganizationId = result.organizationId
        this.apiTokensService.recordTokenUse(result.tokenId)

        return this.success(user)
      } catch (error) {
        this.logger.warn(`API token validation failed: ${(error as Error).message}`)
        return this.fail({ message: 'API token validation failed' }, 401)
      }
    }

    return super.authenticate(req, options)
  }
}

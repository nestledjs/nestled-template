import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { User } from '@nestled-template/api/core/models'
import { AuthService } from '../auth.service'
import { ApiTokensService } from '../../api-tokens/api-tokens.service'

const API_TOKEN_USER_KEY = '__apiTokenUser' as const

type ApiTokenRequest = Request & {
  [API_TOKEN_USER_KEY]?: User
  apiTokenId?: string
  apiTokenOrganizationId?: string | null
}

function headerAndCookieExtractor(req: Request): string | null {
  const authHeaderToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req)
  if (authHeaderToken) {
    return authHeaderToken
  }
  const cookieToken = cookieExtractor(req)
  if (cookieToken) {
    return cookieToken
  }
  return null
}

function cookieExtractor(req: Request): string | undefined {
  const name = process.env['VITE_COOKIE_NAME'] || process.env['API_COOKIE_NAME'] || '__session'
  if (req?.cookies?.[name]) {
    return req.cookies[name]
  }

  const rawCookie = (req?.headers as Record<string, string> | undefined)?.['cookie']
  if (!rawCookie) {
    return undefined
  }

  const match = rawCookie
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${name}=`))

  return match ? match.slice(name.length + 1) : undefined
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name)

  constructor(
    private readonly auth: AuthService,
    private readonly apiTokensService: ApiTokensService,
  ) {
    const jwtSecret = process.env['JWT_SECRET']
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set')
    }

    super({
      jwtFromRequest: headerAndCookieExtractor,
      secretOrKey: jwtSecret,
      ignoreExpiration: false,
      passReqToCallback: true,
    })
  }

  async validate(
    req: Request,
    payload: {
      userId: string
      sessionId?: string
      isEmulating?: boolean
      originalAdminId?: string
    },
  ): Promise<User> {
    const apiTokenUser = (req as ApiTokenRequest)[API_TOKEN_USER_KEY]
    if (apiTokenUser) {
      return apiTokenUser
    }

    if (!payload?.userId) {
      throw new UnauthorizedException('Invalid JWT payload.')
    }
    const user = await this.auth.validateUser(payload.userId)
    if (!user) {
      throw new UnauthorizedException('User from token not found or invalid.')
    }

    // Validate session if sessionId is present in the token
    if (payload.sessionId) {
      const isSessionValid = await this.auth.isSessionValid(payload.sessionId)
      if (!isSessionValid) {
        throw new UnauthorizedException('Session has been invalidated.')
      }
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
    const token = headerAndCookieExtractor(req)

    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      try {
        const result = await this.apiTokensService.validateApiToken(token)
        if (!result) {
          return this.fail({ message: 'Invalid or expired API token' }, 401)
        }

        const user = await this.auth.validateUser(result.userId)
        if (!user) {
          return this.fail({ message: 'User not found for API token' }, 401)
        }

        const apiTokenReq = req as ApiTokenRequest
        apiTokenReq[API_TOKEN_USER_KEY] = user
        apiTokenReq.apiTokenId = result.tokenId
        apiTokenReq.apiTokenOrganizationId = result.organizationId

        return this.success(user)
      } catch (error) {
        this.logger.warn(`API token validation failed: ${(error as Error).message}`)
        return this.fail({ message: 'API token validation failed' }, 401)
      }
    }

    return super.authenticate(req, options)
  }
}

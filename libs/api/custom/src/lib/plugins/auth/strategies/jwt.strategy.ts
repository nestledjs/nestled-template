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

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function jwtTimestamp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      iat?: unknown
      exp?: unknown
    }
    if (typeof payload.iat === 'number') return payload.iat
    if (typeof payload.exp === 'number') return payload.exp
    return 0
  } catch {
    return null
  }
}

function pickNewestJwt(values: string[]): string {
  let newest: { token: string; timestamp: number } | null = null
  for (const token of values) {
    const timestamp = jwtTimestamp(token)
    if (timestamp !== null && (!newest || timestamp >= newest.timestamp)) {
      newest = { token, timestamp }
    }
  }

  return newest?.token ?? values[values.length - 1]
}

function cookieValues(cookieHeader: string, name: string): string[] {
  const values: string[] = []
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue
    values.push(decodeCookieValue(pair.slice(separator + 1)))
  }
  return values
}

function cookieExtractor(req: Request): string | undefined {
  const name = process.env['VITE_COOKIE_NAME'] || process.env['API_COOKIE_NAME'] || '__session'
  const rawCookie = (req?.headers as Record<string, string> | undefined)?.['cookie']
  if (rawCookie) {
    const values = cookieValues(rawCookie, name)
    if (values.length > 0) return pickNewestJwt(values)
  }

  return req?.cookies?.[name]
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

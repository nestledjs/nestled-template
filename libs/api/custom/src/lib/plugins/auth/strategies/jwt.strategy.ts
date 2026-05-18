import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { User } from '@nestled-template/api/core/models'
import { AuthService } from '../auth.service'

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
  const name = process.env['VITE_COOKIE_NAME'] || '__session'
  return req?.cookies?.[name] ? req.cookies[name] : undefined
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    const jwtSecret = process.env['JWT_SECRET']
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set')
    }

    super({
      jwtFromRequest: headerAndCookieExtractor,
      secretOrKey: jwtSecret,
      ignoreExpiration: false,
    })
  }

  async validate(payload: {
    userId: string
    sessionId?: string
    isEmulating?: boolean
    originalAdminId?: string
  }): Promise<User> {
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
}

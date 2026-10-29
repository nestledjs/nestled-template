import { JwtService } from '@nestjs/jwt'
import { rawHeaderCookieValues, selectSessionToken } from '@nestled-template/api/utils'

type WsContextExtra = {
  request?: {
    rawHeaders?: string[]
  }
}

/** The JWT_SECRET signature check, or null when the token (or the configuration) does not verify. */
function verifyWithJwtSecret(token: string): object | null {
  const secret = process.env['JWT_SECRET']
  if (!secret) return null
  try {
    return new JwtService({ secret }).verify<object>(token)
  } catch {
    return null
  }
}

/**
 * The session token on a WebSocket upgrade request, or '' when there is none. With several
 * same-name session cookies the newest one that verifies is chosen (see selectSessionToken), as
 * JwtStrategy does for HTTP requests.
 */
export function extractTokenFromWsContext(extra: unknown): string {
  if (
    extra &&
    typeof extra === 'object' &&
    'request' in extra &&
    extra.request &&
    typeof extra.request === 'object' &&
    'rawHeaders' in extra.request
  ) {
    const rawHeaders = (extra as WsContextExtra).request?.rawHeaders
    const cookieName = process.env['VITE_COOKIE_NAME'] || '__session'
    if (!rawHeaders) return ''
    return (
      selectSessionToken(rawHeaderCookieValues(rawHeaders, cookieName), verifyWithJwtSecret) ?? ''
    )
  }
  return ''
}

import { Logger } from '@nestjs/common'
import { JsonWebTokenError, JwtService } from '@nestjs/jwt'
import { sessionCookieName } from '@nestled-template/api/config'
import { rawHeaderCookieValues, selectSessionToken } from '@nestled-template/api/utils'

type WsContextExtra = {
  request?: {
    rawHeaders?: string[]
  }
}

/**
 * The JWT_SECRET signature check, or null when the token (or the configuration) does not verify.
 * Only a credential failure (`JsonWebTokenError`, which covers a bad signature, a malformed token,
 * `TokenExpiredError` and `NotBeforeError`) is null; anything else is a server failure and is
 * rethrown, so authorizeWsConnection answers it with 1013, not 4401.
 */
function verifyWithJwtSecret(token: string): object | null {
  const secret = process.env['JWT_SECRET']
  if (!secret) return null
  try {
    return new JwtService({ secret }).verify<object>(token)
  } catch (error) {
    if (error instanceof JsonWebTokenError) return null
    throw error
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
    const cookieName = sessionCookieName()
    if (!rawHeaders) return ''
    return (
      selectSessionToken(rawHeaderCookieValues(rawHeaders, cookieName), verifyWithJwtSecret) ?? ''
    )
  }
  return ''
}

/**
 * graphql-ws close codes for a refused connection. 4401 is graphql-ws's own "Unauthorized": the
 * session is missing or does not verify, and the client does not retry it. 1013 is the WebSocket
 * "Try Again Later": the server could not check the session (a configuration or internal failure),
 * which says nothing about it, so the client keeps it and reconnects.
 */
export const WS_CLOSE_UNAUTHORIZED = 4401
export const WS_CLOSE_TRY_AGAIN_LATER = 1013

type ClosableSocket = { close: (code: number, reason: string) => void }

function socketOf(extra: unknown): ClosableSocket | undefined {
  const socket =
    extra && typeof extra === 'object' && 'socket' in extra ? (extra.socket as unknown) : undefined
  return socket && typeof (socket as ClosableSocket).close === 'function'
    ? (socket as ClosableSocket)
    : undefined
}

const wsLogger = new Logger('GraphqlWsConnection')

/**
 * The graphql-ws `onConnect`: true admits the connection. A missing session, or one whose
 * signature or expiry does not verify, closes it with 4401 Unauthorized; an internal failure with
 * 1013 Try Again Later. Revocation is not checked here: every operation still goes through the
 * guards, which check the session against the database.
 *
 * It closes the socket itself (graphql-ws's recipe for a custom close code) and answers false.
 * Throwing, as before, made graphql-ws close with 4500 Internal Server Error and the error's
 * message: a missing token looked like a server bug, and a server bug looked like a fatal error the
 * client does not retry. Without a socket in `extra` (another transport), false still refuses the
 * connection, as 4403 Forbidden.
 */
export function authorizeWsConnection(extra: unknown): boolean {
  let verdict: 'ok' | 'unauthorized' | 'unavailable'
  try {
    // Without the secret no session can verify. That is a server misconfiguration, not the
    // client's session.
    if (!process.env['JWT_SECRET']) throw new Error('JWT_SECRET is not set')
    // extractTokenFromWsContext returns a lone cookie unverified, so verify it here: a session
    // with a bad signature or past its expiry is refused now, not admitted until its first
    // operation.
    const token = extractTokenFromWsContext(extra)
    verdict = token !== '' && verifyWithJwtSecret(token) ? 'ok' : 'unauthorized'
  } catch (error) {
    wsLogger.error(
      `WebSocket session check could not complete: ${error instanceof Error ? error.message : String(error)}`,
    )
    verdict = 'unavailable'
  }

  if (verdict === 'ok') return true
  if (verdict === 'unauthorized') {
    socketOf(extra)?.close(WS_CLOSE_UNAUTHORIZED, 'Unauthorized')
  } else {
    socketOf(extra)?.close(WS_CLOSE_TRY_AGAIN_LATER, 'Service unavailable')
  }
  return false
}

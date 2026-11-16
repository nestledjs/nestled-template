import { ServerError } from '@apollo/client'

/**
 * How the API really answers a request whose session it rejects: HTTP 200 with a GraphQL error
 * whose `extensions.code` is `UNAUTHENTICATED` (Nest maps every `UnauthorizedException` to it, and
 * keeps the 401 in `originalError.statusCode`). Specs that end in a logout use this, not an HTTP
 * 401: every app's error link signs out on UNAUTHENTICATED, but several never do on an HTTP 401.
 */
export const UNAUTHENTICATED_RESULT = {
  data: null,
  errors: [
    {
      message: 'Unauthorized',
      extensions: {
        code: 'UNAUTHENTICATED',
        originalError: { statusCode: 401, message: 'Unauthorized' },
      },
    },
  ],
}

/** `UNAUTHENTICATED_RESULT` as the API's HTTP response, for a spec that stubs `fetch`. */
export function unauthenticatedResponse(): Response {
  return new Response(JSON.stringify(UNAUTHENTICATED_RESULT), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * The error Apollo raises for an HTTP error status, built from a real `Response` (never a
 * hand-set `statusCode`), for a spec about a real HTTP 401, 502 or 503.
 */
export function httpError(status: number): ServerError {
  return new ServerError('Response not successful', {
    response: new Response(null, { status }),
    bodyText: '',
  })
}

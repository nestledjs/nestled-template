/**
 * By default, React Router will handle generating the HTTP Response for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://reactrouter.com/explanation/special-files#entryservertsx
 */

import { PassThrough } from 'node:stream'

import type { AppLoadContext, EntryContext } from 'react-router'
import { ServerRouter } from 'react-router'
import { createReadableStreamFromReadable } from '@react-router/node'
import { isbot } from 'isbot'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import { renderToPipeableStream } from 'react-dom/server'
import {
  classifyApiFailure,
  makeClient,
  mergeApiFailureCauses,
  ssrApiFailureCause,
  type ApiFailureCause,
} from '@nestled-template/shared/apollo'
import { ApolloProvider } from '@apollo/client/react'
import { ApolloSearchProvider } from '@nestledjs/forms/apollo'
import { disableFragmentWarnings } from 'graphql-tag'

disableFragmentWarnings()

export const streamTimeout = 5_000

/** Apollo's streamed query ref replaces a failed preload's error with this redacted one. */
function isRedactedApolloStreamError(error: unknown): boolean {
  const message = (error as Error)?.message ?? ''
  return message.includes('event stream') || message.includes('Redacted for security concerns')
}

/**
 * What to do when the shell render fails. `cause` is the real reason a loader's preloaded query
 * failed, recorded by its Apollo client (`ssrApiFailureCause`), since the error that reaches the
 * render is redacted and cannot tell a rejected session from an unreachable API.
 *
 * The rule: log out only on an unambiguous 401. Any outage evidence in the request (the shell
 * error's own, or any recorded) keeps the session and serves the recovering 503; a 401 logs out
 * only when nothing in the request points to an outage.
 *
 * The recorded cause covers EVERY loader's queries in the request, so it may belong to a preload
 * whose failure a Suspense boundary contained and that never reached the shell. It is therefore
 * applied only when the shell error is itself an API failure: Apollo's redacted stream error, or
 * an error `classifyApiFailure` recognises. Any other shell error (an ordinary render bug) is
 * `error`, whatever was recorded: serving it as the recovering screen would hide it, and treating
 * it as a 401 would sign the user out. For an API failure, the shell error's own cause and the
 * recorded one are combined (`mergeApiFailureCauses`), neither replacing the other.
 *
 * - `force-logout`: the API rejected the session (401 or UNAUTHENTICATED) and nothing in the
 *   request says the API was unreachable. Clear the cookie and redirect.
 * - `unavailable`: any outage evidence (unreachable, 502/503/504), even alongside a 401, or a
 *   redacted Apollo error with no recorded cause. Keep the cookie and serve the 503 recovering
 *   screen: if the session really has expired, the first load after recovery gets a clean 401.
 * - `error`: anything else (an ordinary render error, or an API that answered with some other
 *   error) is left to React Router's error handling, as before.
 */
export function shellErrorOutcome(
  error: unknown,
  cause: ApiFailureCause | undefined,
): 'force-logout' | 'unavailable' | 'error' {
  // Apollo's redacted stream error says nothing about the cause by itself.
  let ownCause: ApiFailureCause | undefined
  if (!isRedactedApolloStreamError(error)) {
    ownCause = classifyApiFailure(error)
    if (ownCause === 'other') return 'error'
  }
  // Nothing known at all (a redacted error, nothing recorded): fail safe, keep the session.
  const effectiveCause = mergeApiFailureCauses(ownCause, cause) ?? 'unavailable'
  if (effectiveCause === 'unavailable') return 'unavailable'
  if (effectiveCause === 'unauthenticated') return 'force-logout'
  return 'error'
}

function forceLogoutResponse(request: Request): Response {
  const cookieName = process.env.VITE_COOKIE_NAME || '__session'
  const cookieDomain = process.env.VITE_COOKIE_DOMAIN
  const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  const base = `${cookieName}=; Path=/; ${expired}; HttpOnly; SameSite=Lax`
  const url = new URL(request.url)
  const returnParam = url.pathname === '/' ? '' : `?return_url=${encodeURIComponent(url.pathname)}`
  const headers = new Headers({ Location: `/force-logout${returnParam}` })
  headers.append(
    'Set-Cookie',
    cookieDomain && cookieDomain !== 'localhost' ? `${base}; Domain=${cookieDomain}` : base,
  )
  return new Response(null, { status: 302, headers })
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const userAgent = request.headers.get('user-agent')

  // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
  // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
  const readyOption: keyof RenderToPipeableStreamOptions =
    (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

  const client = makeClient(request, {
    apiUrl: `${process.env.VITE_API_URL || 'http://localhost:3000'}/graphql`,
  })

  return new Promise((resolve, reject) => {
    let shellRendered = false

    const { pipe, abort } = renderToPipeableStream(
      <ApolloProvider client={client}>
        <ApolloSearchProvider>
          <ServerRouter context={routerContext} url={request.url} />
        </ApolloSearchProvider>
      </ApolloProvider>,
      {
        [readyOption]() {
          shellRendered = true
          const body = new PassThrough()
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set('Content-Type', 'text/html')

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )

          pipe(body)
        },
        onShellError(error: unknown) {
          console.error('[SSR] Shell render error:', error)
          const outcome = shellErrorOutcome(
            error,
            ssrApiFailureCause(routerContext.staticHandlerContext?.loaderData),
          )
          if (outcome === 'force-logout') {
            // The API rejected the session, with no sign of an outage: clear the stale cookie
            // instead of serving 500.
            console.error('[SSR] The API rejected the session — redirecting to force-logout')
            resolve(forceLogoutResponse(request))
          } else if (outcome === 'unavailable') {
            // The API could not be reached (even if a 401 came back too), or the cause is unknown.
            // Keep the session: React
            // Router renders the root ErrorBoundary for this 503, which shows the self-recovering
            // screen and reloads once the API answers. A real 401 comes back on the client and
            // goes through the normal 401 handling there.
            console.error('[SSR] API unavailable during the shell render — serving 503')
            // A `Response`, not an Error, on purpose (Sonar S6671): React Router turns a rejected
            // `Response` into that status and renders the ErrorBoundary for it; an Error is a 500.
            reject(new Response(null, { status: 503, statusText: 'Service Unavailable' })) // NOSONAR
          } else {
            reject(error)
          }
        },
        onError(error: unknown) {
          responseStatusCode = 500
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error)
          }
        },
      },
    )

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    setTimeout(abort, streamTimeout + 1000)
  })
}

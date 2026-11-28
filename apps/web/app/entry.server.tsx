/**
 * By default, React Router will handle generating the HTTP Response for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://reactrouter.com/explanation/special-files#entryservertsx
 */

import { PassThrough } from 'node:stream'

import type { EntryContext, RouterContextProvider } from 'react-router'
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
  ssrOrganizationRequired,
  type ApiFailureCause,
} from '@nestled-template/shared/apollo'
import { ApolloProvider } from '@apollo/client/react'
import { ApolloSearchProvider } from '@nestledjs/forms/apollo'
import { disableFragmentWarnings } from 'graphql-tag'
import {
  isOrganizationContextRequired,
  organizationRequiredResponse,
} from './organization-required'
import {
  refusedCallResponse,
  withRequestSessionCacheControl,
} from './session/session-middleware.server'

disableFragmentWarnings()

export const streamTimeout = 5_000

/** Apollo's streamed query ref replaces a failed preload's error with this redacted one. */
function isRedactedApolloStreamError(error: unknown): boolean {
  const message = (error as Error)?.message ?? ''
  return message.includes('event stream') || message.includes('Redacted for security concerns')
}

/**
 * Which screen a failed shell render gets. The session was judged before any loader ran (the
 * session middleware), so nothing here signs anyone out: this only picks the screen. `cause` is the
 * real reason a loader's preloaded query failed, recorded by its Apollo client
 * (`ssrApiFailureCause`), since the error that reaches the render is redacted.
 *
 * The recorded cause covers every loader's queries in the request, so it may belong to a preload
 * whose failure a Suspense boundary contained. It is applied only when the shell error is itself an
 * API failure: Apollo's redacted stream error, or an error `classifyApiFailure` recognises. Any
 * other shell error (an ordinary render bug) is `error`, whatever was recorded.
 *
 * - `unavailable`: any outage evidence (unreachable, 502/503/504), or a redacted error with no
 *   recorded cause. The recovering 503 screen; the session is kept.
 * - `unauthenticated`: a preloaded query was refused with a 401 after the request was judged signed
 *   in, and nothing points to an outage. A 401 route error: the browser's root ErrorBoundary asks
 *   the server to judge the session again (one revalidation), and only the middleware decides.
 * - `organization-required`: the API refused a query with `ORGANIZATION_CONTEXT_REQUIRED`; the
 *   organization picker, session kept.
 * - `error`: anything else, left to React Router's error handling.
 */
export function shellErrorOutcome(
  error: unknown,
  cause: ApiFailureCause | undefined,
  organizationRequired = false,
): 'unavailable' | 'unauthenticated' | 'organization-required' | 'error' {
  let ownCause: ApiFailureCause | undefined
  let refusedForOrganization = organizationRequired
  if (!isRedactedApolloStreamError(error)) {
    ownCause = classifyApiFailure(error)
    if (isOrganizationContextRequired(error)) refusedForOrganization = true
    else if (ownCause === 'other') return 'error'
  }
  // Nothing known at all (a redacted error, nothing recorded): fail safe, keep the session.
  const effectiveCause = mergeApiFailureCauses(ownCause, cause) ?? 'unavailable'
  if (effectiveCause === 'unavailable') return 'unavailable'
  if (effectiveCause === 'unauthenticated') return 'unauthenticated'
  return refusedForOrganization ? 'organization-required' : 'error'
}

/**
 * React Router's server error hook: logs the error as React Router's default one does, except for
 * a request the browser already abandoned.
 */
export function handleError(error: unknown, { request }: { request: Request }): void {
  if (!request.signal.aborted) console.error(error)
}

/**
 * The recovering screen's response: `handleRequest` rejects with it, and React Router renders the
 * root ErrorBoundary for that status. A `Response`, not an Error, on purpose (Sonar S6671): React
 * Router turns a rejected `Response` into that status; an Error is a 500.
 */
function unavailableResponse(): Response {
  return new Response(null, { status: 503, statusText: 'Service Unavailable' })
}

// Requests whose first render was already decided and rejected. React Router renders the
// ErrorBoundary for the rejection by calling `handleRequest` again with it as the route error; that
// second render must render rather than decide again (rejecting a second time is React Router's
// bare last-resort 500).
const servedErrorResponse = new WeakSet<Request>()

function rejectWith(request: Request, message: string, response: Response): Promise<never> {
  console.error(message)
  servedErrorResponse.add(request)
  return Promise.reject(response) // NOSONAR: a Response on purpose, see unavailableResponse
}

/**
 * React Router's hook for every `.data` response. A `.data` request for a URL that matches no route
 * runs no middleware, so its 404 gets the session Cache-Control here (`withRequestSessionCacheControl`).
 */
export function handleDataRequest(response: Response, { request }: { request: Request }): Response {
  return withRequestSessionCacheControl(request, response)
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
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

          // A URL that matches no route runs no middleware: its 404 gets the session
          // Cache-Control here.
          resolve(
            withRequestSessionCacheControl(
              request,
              new Response(stream, {
                headers: responseHeaders,
                status: responseStatusCode,
              }),
            ),
          )

          pipe(body)
        },
        onShellError(error: unknown) {
          console.error('[SSR] Shell render error:', error)
          const loaderData = routerContext.staticHandlerContext?.loaderData
          const decideForShell = () =>
            shellErrorOutcome(
              error,
              ssrApiFailureCause(loaderData),
              ssrOrganizationRequired(loaderData),
            )
          const outcome = decideForShell()
          if (servedErrorResponse.has(request)) {
            reject(error)
          } else if (outcome === 'unavailable') {
            // The API could not be reached (even if a 401 came back too), or the cause is unknown.
            // Keep the session: the root ErrorBoundary shows the self-recovering screen.
            rejectWith(
              request,
              '[SSR] API unavailable during the shell render — serving 503',
              unavailableResponse(),
            ).catch(reject)
          } else if (outcome === 'unauthenticated') {
            // A preload was refused after the request was judged signed in. Not a sign-out: the
            // browser revalidates once and the session middleware decides.
            rejectWith(
              request,
              '[SSR] A preloaded query was refused with a 401 — serving the route error',
              refusedCallResponse(),
            ).catch(reject)
          } else if (outcome === 'organization-required') {
            // A preloaded query was refused for want of an active organization: keep the session
            // and serve the organization picker.
            rejectWith(
              request,
              '[SSR] A query needs an active organization — serving the picker',
              organizationRequiredResponse(),
            ).catch(reject)
          } else {
            servedErrorResponse.add(request)
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

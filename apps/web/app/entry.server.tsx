/**
 * By default, React Router will handle generating the HTTP Response for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://reactrouter.com/explanation/special-files#entryservertsx
 */

import { PassThrough } from 'node:stream'

import type { AppLoadContext, EntryContext } from 'react-router'
import { isRouteErrorResponse, ServerRouter } from 'react-router'
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
  waitForSsrApiCalls,
  type ApiFailureCause,
} from '@nestled-template/shared/apollo'
import { ApolloProvider } from '@apollo/client/react'
import { ApolloSearchProvider } from '@nestledjs/forms/apollo'
import { disableFragmentWarnings } from 'graphql-tag'
import {
  isOrganizationContextRequired,
  organizationRequiredResponse,
} from './organization-required'
import { loaderReportsOutage } from './loader-outage'

disableFragmentWarnings()

export const streamTimeout = 5_000

/**
 * How long a sign-out decided during the server render waits for the request's other API calls
 * still in flight (`waitForSsrApiCalls`) before it may clear the cookie. A loader returns its
 * preloaded queries unawaited (the root loader's Me among them), so a fast 401 can arrive before a
 * slower call reports a 503. A call still out after this long is no proof the session is bad: the
 * session is kept and the recovering 503 served.
 */
export const SSR_API_SETTLE_MS = 3_000

/**
 * The request's recorded outage evidence and API failures from its loaders' data: the cause its
 * preloads failed with (`ssrApiFailureCause`), plus `unavailable` when a loader's data carries the
 * outage flag (`loaderReportsOutage`: the root loader's `serviceUnavailable`, returned when it could
 * not even start the Me preload, so nothing went through the Apollo client to record it). The flag
 * can only keep a session: it makes the request `unavailable`, which outranks any 401.
 */
export function recordedLoaderCause(
  loaderData: Record<string, unknown> | null | undefined,
): ApiFailureCause | undefined {
  const flagged = Object.values(loaderData ?? {}).some(loaderReportsOutage)
  return mergeApiFailureCauses(ssrApiFailureCause(loaderData), flagged ? 'unavailable' : undefined)
}

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
 * - `organization-required`: neither of those, and the API refused a query with
 *   `ORGANIZATION_CONTEXT_REQUIRED` (the shell error itself, or `organizationRequired`, recorded for
 *   a preloaded query whose refusal reached the render redacted). Keep the cookie and serve the
 *   organization picker, as `routeErrorOutcome` does for a loader.
 * - `error`: anything else (an ordinary render error, or an API that answered with some other
 *   error) is left to React Router's error handling, as before.
 *
 * `force-logout` is provisional: `handleRequest` first waits for the request's API calls still in
 * flight (`SSR_API_SETTLE_MS`) and decides again with what they reported.
 */
export function shellErrorOutcome(
  error: unknown,
  cause: ApiFailureCause | undefined,
  organizationRequired = false,
): 'force-logout' | 'unavailable' | 'organization-required' | 'error' {
  // Apollo's redacted stream error says nothing about the cause by itself.
  let ownCause: ApiFailureCause | undefined
  let refusedForOrganization = organizationRequired
  if (!isRedactedApolloStreamError(error)) {
    ownCause = classifyApiFailure(error)
    // The organization refusal is an API failure like the others: it goes through the same
    // precedence below (an outage, or a clean 401, recorded in the request still outranks it).
    if (isOrganizationContextRequired(error)) refusedForOrganization = true
    else if (ownCause === 'other') return 'error'
  }
  // Nothing known at all (a redacted error, nothing recorded): fail safe, keep the session.
  const effectiveCause = mergeApiFailureCauses(ownCause, cause) ?? 'unavailable'
  if (effectiveCause === 'unavailable') return 'unavailable'
  if (effectiveCause === 'unauthenticated') return 'force-logout'
  return refusedForOrganization ? 'organization-required' : 'error'
}

/**
 * The error the error page is rendered for after a shell error that is not an API failure. A
 * component that throws a `Response` would otherwise reach the error page as a route error response
 * with that status, and a 401 there reads, in the browser's root error boundary, as the API
 * rejecting the session. A render's own 401 says nothing about the session, so it is passed on as a
 * plain error (the generic error page, a 500); any other status is kept.
 */
export function shellErrorForErrorPage(error: unknown): unknown {
  const status = error instanceof Response || isRouteErrorResponse(error) ? error.status : undefined
  return status === 401 ? new Error('A render threw a 401 response') : error
}

const GATEWAY_UNAVAILABLE_STATUSES = new Set([502, 503, 504])

function routeErrorCause(error: unknown): ApiFailureCause {
  if (isRouteErrorResponse(error)) {
    if (error.status === 401) return 'unauthenticated'
    return GATEWAY_UNAVAILABLE_STATUSES.has(error.status) ? 'unavailable' : 'other'
  }
  return classifyApiFailure(error)
}

// Request -> what the errors its loaders threw were, as React Router hands them to `handleError`
// below. That is the only place the server sees them raw: in production the errors in the router
// context are sanitized ("Unexpected Server Error") before `handleRequest` runs, status and all.
const loaderErrorCauses = new WeakMap<Request, ApiFailureCause>()

// Requests whose loaders threw an `ORGANIZATION_CONTEXT_REQUIRED` refusal, recorded by `handleError`
// for the same reason: the sanitized error has lost its code. Only that fact is kept, never the
// error itself or its message.
const loaderOrganizationRequired = new WeakSet<Request>()

/**
 * React Router's server error hook. It logs the error as React Router's default one does, and
 * records what it was (`routeErrorOutcome`) for the request's `handleRequest`, which runs after it.
 */
export function handleError(error: unknown, { request }: { request: Request }): void {
  if (!request.signal.aborted) console.error(error)
  loaderErrorCauses.set(
    request,
    mergeApiFailureCauses(loaderErrorCauses.get(request), routeErrorCause(error)) ?? 'other',
  )
  if (isOrganizationContextRequired(error)) loaderOrganizationRequired.add(request)
}

/**
 * What to do when a loader threw during a document request, before anything renders. `errors` is
 * the router context's `staticHandlerContext.errors`; `thrownCause` is what those errors were before
 * React Router sanitized them (recorded by `handleError`); `recordedCause` the request's recorded
 * outage evidence and preload failures (`recordedLoaderCause`), as for `shellErrorOutcome`.
 *
 * A loader that awaited Me (or any query) and got a 401 used to reach the root ErrorBoundary
 * during the server render, which cannot redirect there, so the browser got a 500 "Something went
 * wrong" page and kept the stale cookie; the error the page then hydrated with had lost its
 * status, so the browser did not log out either. Now:
 * - `force-logout`: a loader's error carries the API's rejection (an HTTP 401, an UNAUTHENTICATED
 *   GraphQL error, or a route response with status 401) and nothing in the request, another
 *   loader's error or a recorded preload failure, points to an outage. Clear the cookie and
 *   redirect, as the browser does.
 * - `unavailable`: a loader's error is an API failure (a 401 or an outage) and the request holds
 *   outage evidence (unreachable, 502/503/504: the loader's own, another loader's, or a recorded
 *   preload failure). Keep the cookie and serve the 503 recovering screen, as `shellErrorOutcome`
 *   does: outage outranks a 401, and the generic error screen would lose that evidence and never
 *   recover by itself.
 * - `organization-required`: neither of those, and a loader's error was the API's 403
 *   `ORGANIZATION_CONTEXT_REQUIRED` (`thrownOrganizationRequired`, recorded by `handleError`, or the
 *   error itself when it is not sanitized). The user is signed in with no active organization: keep
 *   the cookie and serve the organization picker (a 403 carrying only the code), not the generic
 *   error page the sanitized error would get.
 * - `render`: anything else (no loader error, or one that is not an API failure) is rendered by
 *   the root ErrorBoundary as before.
 *
 * `force-logout` is provisional: `handleRequest` first waits for the request's API calls still in
 * flight (`SSR_API_SETTLE_MS`) and decides again with what they reported.
 */
export function routeErrorOutcome(
  errors: Record<string, unknown> | null | undefined,
  thrownCause: ApiFailureCause | undefined,
  recordedCause?: ApiFailureCause,
  thrownOrganizationRequired = false,
): 'force-logout' | 'unavailable' | 'organization-required' | 'render' {
  const thrown = Object.values(errors ?? {})
  if (thrown.length === 0) return 'render'
  let ownCause = thrownCause
  for (const error of thrown) ownCause = mergeApiFailureCauses(ownCause, routeErrorCause(error))
  if (ownCause === 'unauthenticated' || ownCause === 'unavailable') {
    const effective = mergeApiFailureCauses(ownCause, recordedCause)
    if (effective === 'unavailable') return 'unavailable'
    if (effective === 'unauthenticated') return 'force-logout'
  }
  const organizationRequired =
    thrownOrganizationRequired || thrown.some(error => isOrganizationContextRequired(error))
  return organizationRequired ? 'organization-required' : 'render'
}

/**
 * The recovering screen's response: `handleRequest` rejects with it, and React Router renders the
 * root ErrorBoundary for that status (the self-recovering screen, which reloads once the API
 * answers). A `Response`, not an Error, on purpose (Sonar S6671): React Router turns a rejected
 * `Response` into that status; an Error is a 500.
 */
function unavailableResponse(): Response {
  return new Response(null, { status: 503, statusText: 'Service Unavailable' })
}

// Requests whose first render was already decided and rejected: with a `Response` (the recovering
// 503, or the organization picker's 403), or with the shell error itself. React Router renders the
// ErrorBoundary for it by calling `handleRequest` again with that rejection as the route error; this
// marks that second render, which must go ahead and render rather than decide again. Rejecting a
// second time is React Router's bare last-resort 500; and deciding again would judge the rejection
// as if a loader had thrown it, without the evidence the first decision had (a shell error that
// carries a 401 status would sign the user out of a page that only failed to render).
const servedErrorResponse = new WeakSet<Request>()

function rejectUnavailable(request: Request, message: string): Promise<never> {
  console.error(message)
  servedErrorResponse.add(request)
  return Promise.reject(unavailableResponse()) // NOSONAR: a Response on purpose, see unavailableResponse
}

/**
 * Signs out only once the request's API calls still in flight have settled
 * (`waitForSsrApiCalls`, bounded by `SSR_API_SETTLE_MS`) and `decide`, asked again with what they
 * reported, still says `force-logout`. Waiting can only keep the session: a call that reported an
 * outage meanwhile, or one still out when the bound passes, serves the recovering 503 instead.
 */
async function signOutOnceSettled(
  request: Request,
  loaderData: Record<string, unknown> | null | undefined,
  decide: () => ReturnType<typeof routeErrorOutcome> | ReturnType<typeof shellErrorOutcome>,
): Promise<Response> {
  const settled = await waitForSsrApiCalls(loaderData, SSR_API_SETTLE_MS)
  if (settled && decide() === 'force-logout') {
    console.error('[SSR] The API rejected the session — redirecting to force-logout')
    return forceLogoutResponse(request)
  }
  return rejectUnavailable(
    request,
    settled
      ? '[SSR] A 401 came with outage evidence once the API calls settled — serving 503'
      : '[SSR] API calls still in flight after a 401 — keeping the session, serving 503',
  )
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

  const handlerContext = routerContext.staticHandlerContext
  const decideForLoaders = () =>
    routeErrorOutcome(
      handlerContext?.errors,
      loaderErrorCauses.get(request),
      recordedLoaderCause(handlerContext?.loaderData),
      loaderOrganizationRequired.has(request),
    )
  const loaderOutcome = servedErrorResponse.has(request) ? 'render' : decideForLoaders()
  if (loaderOutcome === 'force-logout') {
    // A loader got a 401 and nothing yet points to an outage; a slower call may still report one.
    console.error('[SSR] A loader got a 401 from the API — waiting for the other API calls')
    return signOutOnceSettled(request, handlerContext?.loaderData, decideForLoaders)
  }
  if (loaderOutcome === 'unavailable') {
    // A loader failed and the API showed signs of an outage (even if a 401 came back too). Keep
    // the session and serve the same recovering 503 as an unavailable shell render.
    return rejectUnavailable(
      request,
      '[SSR] A loader failed while the API was unavailable — serving 503',
    )
  }
  if (loaderOutcome === 'organization-required') {
    // Signed in, no active organization. Keep the session: React Router renders the root
    // ErrorBoundary for this 403, which recognises the code and shows the organization picker.
    console.error('[SSR] A loader needs an active organization — serving the organization picker')
    servedErrorResponse.add(request)
    return Promise.reject(organizationRequiredResponse()) // NOSONAR: a Response on purpose, as above
  }

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
          const loaderData = routerContext.staticHandlerContext?.loaderData
          const decideForShell = () =>
            shellErrorOutcome(
              error,
              recordedLoaderCause(loaderData),
              ssrOrganizationRequired(loaderData),
            )
          const outcome = decideForShell()
          if (outcome === 'force-logout') {
            // The API rejected the session, with no sign of an outage so far: once the request's
            // other API calls have settled (a slower one may yet report an outage), clear the
            // stale cookie instead of serving 500.
            signOutOnceSettled(request, loaderData, decideForShell).then(resolve, reject)
          } else if (outcome === 'unavailable') {
            // The API could not be reached (even if a 401 came back too), or the cause is unknown.
            // Keep the session: React Router renders the root ErrorBoundary for this 503, which
            // shows the self-recovering screen and reloads once the API answers. A real 401 comes
            // back on the client and goes through the normal 401 handling there.
            rejectUnavailable(
              request,
              '[SSR] API unavailable during the shell render — serving 503',
            ).catch(reject)
          } else if (outcome === 'organization-required') {
            // A preloaded query was refused for want of an active organization: keep the session
            // and serve the organization picker, as for a loader's refusal.
            console.error('[SSR] A query needs an active organization — serving the picker')
            servedErrorResponse.add(request)
            reject(organizationRequiredResponse()) // NOSONAR: a Response on purpose, as above
          } else {
            // React Router renders the error page for this by calling `handleRequest` again with
            // the shell error as the route error. That render must not decide again, and the page
            // must not carry a render's 401 to the browser as the API's (shellErrorForErrorPage).
            servedErrorResponse.add(request)
            reject(shellErrorForErrorPage(error))
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

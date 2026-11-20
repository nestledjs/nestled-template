import {
  data,
  redirect,
  redirectDocument,
  type MiddlewareFunction,
  type RouterContextProvider,
} from 'react-router'
import {
  API_UNAUTHENTICATED_CODE,
  apiOutageSeenMsAgo,
  judgeSession,
  makeClient,
  meOutcomeFromError,
  meOutcomeFromResult,
  needsConfirmation,
  SESSION_TIMEOUT_MS,
  SKIP_AUTH_ERROR_REPORT_CONTEXT,
  type MeOutcome,
  type SessionEvidence,
} from '@nestled-template/shared/apollo'
import { Me, type MeQuery } from '@nestled-template/shared/sdk'
import { getCookie, getSessionCookieName, isJwtExpired } from '@nestled-template/shared/utils'
import { expiredSessionCookies } from './session-cookie'
import {
  getSession,
  SESSION_UNKNOWN_CODE,
  sessionContext,
  type AppSessionVerdict,
  type SessionUser,
} from './session-context'

// The code of the 503 `requireSession` throws while the verdict is `unknown`. It lives beside the
// context because the root ErrorBoundary (client code) reads it.
export { SESSION_UNKNOWN_CODE } from './session-context'

/**
 * Route patterns the session is never judged for: resource routes that must answer without
 * calling the API (the web health check), or that have no use for a user.
 */
export const SESSIONLESS_PATTERNS: ReadonlySet<string> = new Set(['/healthz', '/sitemap.xml'])

/**
 * Where a rejected session on a private route is sent (owner decision D3): `/force-logout` by
 * default, which expires both cookie scopes and goes on to `/login?expired=1`. An app with its own
 * "session expired" route sets `SESSION_REJECTED_PATH` to it; that route must expire the cookie the
 * same way (`expiredSessionCookies`) and forget the stored organization. It is still the
 * middleware, never the browser, that sends anyone there. Only a same-site absolute path is
 * accepted; anything else falls back to the default.
 */
export function sessionRejectedPath(value = process.env['SESSION_REJECTED_PATH']): string {
  const path = value?.trim()
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/force-logout'
  }
  return path
}

/** What the middleware calls to ask the API for Me. Replaced in specs. */
export type FetchMe = (request: Request, signal: AbortSignal) => Promise<MeOutcome<SessionUser>>

function apiUrl(): string {
  return `${process.env['VITE_API_URL'] || 'http://localhost:3000'}/graphql`
}

/**
 * One Me call through the app's Apollo client. `errorPolicy: 'none'`, so an error is never hidden
 * behind `data.me === null` (the client's query default is `'all'`); `no-cache`, so the answer is
 * fresh; and the error link takes no action on it (`SKIP_AUTH_ERROR_REPORT_CONTEXT`): only the
 * judge decides. Its error link still records an unreachable API in the outage memory.
 */
export const fetchMeWithApollo: FetchMe = async (request, signal) => {
  const client = makeClient(request, { apiUrl: apiUrl() })
  try {
    const result = await client.query<MeQuery>({
      query: Me,
      fetchPolicy: 'no-cache',
      errorPolicy: 'none',
      context: { ...SKIP_AUTH_ERROR_REPORT_CONTEXT, fetchOptions: { signal } },
    })
    return meOutcomeFromResult<SessionUser>(result)
  } catch (error) {
    if (signal.aborted) return { kind: 'timeout' }
    return meOutcomeFromError(error)
  }
}

/** Runs one Me call, judged `timeout` if it has not answered within `timeoutMs`. */
async function boundedMe(
  fetchMe: FetchMe,
  request: Request,
  timeoutMs: number,
): Promise<MeOutcome<SessionUser>> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<MeOutcome<SessionUser>>(resolve => {
    timer = setTimeout(() => {
      controller.abort()
      resolve({ kind: 'timeout' })
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      fetchMe(request, controller.signal).catch(error => meOutcomeFromError(error)),
      timedOut,
    ])
  } finally {
    clearTimeout(timer)
  }
}

export interface ResolveSessionOptions {
  fetchMe?: FetchMe
  timeoutMs?: number
  now?: () => number
}

/**
 * Gathers the evidence for one request and judges it (`judgeSession`): the cookie, one Me call
 * (none without a live cookie), a one-shot confirmation only after a clean 401, and this
 * instance's outage memory, read last so an outage another request saw meanwhile counts.
 */
export async function resolveSession(
  request: Request,
  options: ResolveSessionOptions = {},
): Promise<{ verdict: AppSessionVerdict; evidence: SessionEvidence<SessionUser> }> {
  const fetchMe = options.fetchMe ?? fetchMeWithApollo
  const timeoutMs = options.timeoutMs ?? SESSION_TIMEOUT_MS
  const now = options.now ?? Date.now

  const token = getCookie(request.headers, getSessionCookieName())
  let evidence: SessionEvidence<SessionUser>
  if (!token) evidence = { cookie: 'absent' }
  else if (isJwtExpired(token)) evidence = { cookie: 'expired' }
  else {
    const me = await boundedMe(fetchMe, request, timeoutMs)
    const confirm = needsConfirmation(me) ? await boundedMe(fetchMe, request, timeoutMs) : undefined
    evidence = { cookie: 'present', me, confirm, outageSeenMsAgo: apiOutageSeenMsAgo(now()) }
  }
  return { verdict: judgeSession(evidence), evidence }
}

function describe(verdict: AppSessionVerdict): string {
  return verdict.kind === 'signed-in' ? 'signed-in' : `${verdict.kind}/${verdict.reason}`
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400
}

/**
 * The root route's middleware: judges the session once per request (document loads, client
 * navigations and revalidations alike, before any loader runs) and stores the verdict in
 * `sessionContext`. On a `signed-out/rejected` verdict it also expires both session cookie scopes
 * on the response (a public page then renders signed out with the dead cookie gone); a redirect is
 * left alone, since `/force-logout` expires them itself.
 */
export function createSessionMiddleware(
  options: ResolveSessionOptions = {},
): MiddlewareFunction<Response> {
  return async ({ request, context, pattern }, next) => {
    if (SESSIONLESS_PATTERNS.has(pattern)) return next()
    const { verdict, evidence } = await resolveSession(request, options)
    context.set(sessionContext, verdict)
    if (verdict.kind === 'unknown' || (evidence.me && evidence.confirm)) {
      // The rare paths, logged with the evidence's kinds only (never a token, a user or a message).
      console.warn('[session]', describe(verdict), {
        me: evidence.me?.kind === 'error' ? evidence.me.cause : evidence.me?.kind,
        confirm:
          evidence.confirm?.kind === 'error' ? evidence.confirm.cause : evidence.confirm?.kind,
        outageSeenMsAgo: evidence.outageSeenMsAgo,
      })
    }
    const response = await next()
    if (verdict.kind === 'signed-out' && verdict.reason === 'rejected' && !isRedirect(response)) {
      for (const cookie of expiredSessionCookies(getSessionCookieName())) {
        response.headers.append('Set-Cookie', cookie)
      }
    }
    return response
  }
}

export const sessionMiddleware = createSessionMiddleware()

/** The path to come back to: the URL without React Router's own `.data`, `_routes` and `index`. */
export function returnPath(url: URL): string {
  const params = new URLSearchParams(url.search)
  params.delete('_routes')
  params.delete('index')
  const pathname = url.pathname.replace(/\.data$/, '').replace(/^\/_root$/, '/')
  const search = params.toString()
  return `${pathname}${search ? `?${search}` : ''}`
}

function withReturnUrl(target: string, path: string): string {
  if (!path || path === '/') return target
  const separator = target.includes('?') ? '&' : '?'
  return `${target}${separator}return_url=${encodeURIComponent(path)}`
}

/**
 * The middleware of every layout whose pages need a user (the signed-in layout, and any private
 * layout an app adds). It acts on the verdict before `next()`, so no private loader runs for a
 * request that is not signed in:
 * - `signed-in`: carry on;
 * - `signed-out/rejected`: a full document load of `sessionRejectedPath()` (a 302 on a document
 *   request, a single-fetch redirect with `reload: true` on a `.data` one), which drops the
 *   browser's in-memory state and expires both cookie scopes;
 * - `signed-out/no-session`: `/login?return_url=...`;
 * - `unknown`: a 503 `SESSION_UNKNOWN` route error, shown by the root ErrorBoundary as the
 *   self-recovering screen. The session is kept.
 */
export const requireSession: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const verdict = getSession(context as Readonly<RouterContextProvider>)
  if (verdict.kind === 'signed-in') return next()
  const path = returnPath(new URL(request.url))
  if (verdict.kind === 'signed-out' && verdict.reason === 'rejected') {
    throw redirectDocument(withReturnUrl(sessionRejectedPath(), path))
  }
  if (verdict.kind === 'signed-out') throw redirect(withReturnUrl('/login', path))
  throw data(
    { code: SESSION_UNKNOWN_CODE, reason: verdict.reason },
    { status: 503, statusText: 'Service Unavailable' },
  )
}

/**
 * The session cookie to forward to the API from a server loader or action that calls a REST
 * endpoint itself (the MCP consent page). Reading the cookie is the session module's job.
 */
export function forwardedSessionCookie(request: Request): string | null {
  const name = getSessionCookieName()
  const token = getCookie(request.headers, name)
  return token ? `${name}=${token}` : null
}

/**
 * The 401 route error for a call refused after the request was judged signed in, as a `Response`
 * (`narrowApiError`'s shape), for the server render to reject with when a preloaded query met it.
 * Not a sign-out: the browser's root ErrorBoundary revalidates once and this middleware decides.
 */
export function refusedCallResponse(): Response {
  return Response.json(
    { code: API_UNAUTHENTICATED_CODE },
    { status: 401, statusText: 'Unauthorized' },
  )
}

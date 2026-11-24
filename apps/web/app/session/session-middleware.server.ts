import {
  data,
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
import { Me } from '@nestled-template/shared/sdk'
import {
  cookieCandidates,
  cookiePairs,
  decodeCookieValue,
  getCookie,
  getSessionCookieName,
  isJwtExpired,
} from '@nestled-template/shared/utils'
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
    const result = await client.query({
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

/** Every session cookie the request carries (several when the browser holds duplicates). */
function sessionCookies(request: Request): string[] {
  return cookieCandidates(request.headers.get('cookie'), getSessionCookieName())
}

/**
 * The request's session cookie as evidence. With duplicates it is `expired` only if every one of
 * them is, and `absent` only with none: which one counts is the API's choice (`makeClient` forwards
 * them all), so one live candidate is enough to ask.
 */
function cookieEvidence(request: Request): 'absent' | 'expired' | 'present' {
  const candidates = sessionCookies(request)
  if (candidates.length === 0) return 'absent'
  return candidates.every(value => isJwtExpired(decodeCookieValue(value))) ? 'expired' : 'present'
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

  const cookie = cookieEvidence(request)
  let evidence: SessionEvidence<SessionUser>
  if (cookie !== 'present') evidence = { cookie }
  else {
    const me = await boundedMe(fetchMe, request, timeoutMs)
    const confirm = needsConfirmation(me) ? await boundedMe(fetchMe, request, timeoutMs) : undefined
    evidence = { cookie, me, confirm, outageSeenMsAgo: apiOutageSeenMsAgo(now()) }
  }
  return { verdict: judgeSession(evidence), evidence }
}

function describe(verdict: AppSessionVerdict): string {
  return verdict.kind === 'signed-in' ? 'signed-in' : `${verdict.kind}/${verdict.reason}`
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400
}

/** For every response to a request that carries a session: no cache may keep it. */
export const SESSION_CACHE_CONTROL = 'private, no-store'

/**
 * A route's own Cache-Control stays, except one that lets a shared cache keep a page: every page
 * (HTML, or React Router's `.data` answer) holds the verdict in its root loader data, so a public
 * page's signed-in variant must never be served to anyone else.
 */
function keepsOwnCacheControl(headers: Headers): boolean {
  const own = headers.get('Cache-Control')
  if (!own) return false
  const isPage =
    headers.has('X-Remix-Response') || headers.get('Content-Type')?.startsWith('text/html') === true
  return !isPage || /\b(?:private|no-store)\b/i.test(own)
}

function withSessionCacheControl(response: Response): Response {
  if (keepsOwnCacheControl(response.headers)) return response
  try {
    response.headers.set('Cache-Control', SESSION_CACHE_CONTROL)
    return response
  } catch {
    // A loader that returns `fetch()`'s or `Response.redirect()`'s own response: immutable headers.
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', SESSION_CACHE_CONTROL)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

/**
 * The root route's middleware: judges the session once per request (document loads, client
 * navigations and revalidations alike, before any loader runs) and stores the verdict in
 * `sessionContext`. On a `signed-out/rejected` verdict it also expires both session cookie scopes
 * on the response (a public page then renders signed out with the dead cookie gone); a redirect is
 * left alone, since `/force-logout` expires them itself.
 *
 * Every response to a request that carries a session cookie (a document, a `.data` answer, a
 * redirect or an error) is `SESSION_CACHE_CONTROL`, so neither the browser's history nor a shared
 * cache can bring one user's page back for another. Anonymous responses are unchanged.
 */
export function createSessionMiddleware(
  options: ResolveSessionOptions = {},
): MiddlewareFunction<Response> {
  return async ({ request, context, pattern }, next) => {
    const carriesSession = sessionCookies(request).length > 0
    if (SESSIONLESS_PATTERNS.has(pattern)) {
      const sessionless = await next()
      return carriesSession ? withSessionCacheControl(sessionless) : sessionless
    }
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
    const answer = await next()
    const response = carriesSession ? withSessionCacheControl(answer) : answer
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
  const query = search ? `?${search}` : ''
  return `${pathname}${query}`
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
 * - `signed-out/no-session`: a full document load of `/login?return_url=...` (the same two forms),
 *   so a tab whose session ended keeps nothing of it in memory;
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
  if (verdict.kind === 'signed-out') throw redirectDocument(withReturnUrl('/login', path))
  throw data(
    { code: SESSION_UNKNOWN_CODE, reason: verdict.reason },
    { status: 503, statusText: 'Service Unavailable' },
  )
}

/**
 * The Cookie header to forward to the API from a server loader or action that calls a REST endpoint
 * itself (the MCP consent page): the session cookie and no other, every candidate of it when the
 * browser holds duplicates, so the API can pick the one that verifies. Null with none. Reading the
 * cookie is the session module's job.
 */
export function forwardedSessionCookie(request: Request): string | null {
  const candidates = sessionCookies(request)
  return candidates.length > 0 ? cookiePairs(getSessionCookieName(), candidates) : null
}

/**
 * The raw session token, for a loader that must hand one bearer token to something that cannot be
 * given a Cookie header (an upload widget, say). Prefer `forwardedSessionCookie`. Null with none.
 *
 * With duplicate session cookies it is the newest unexpired one by its unverified claims
 * (`pickNewestJwt`), because a bearer token is a single value and this server cannot verify one. The
 * API may be using another candidate, so a call refused with this token is never evidence that the
 * session is dead, and the token never decides a session.
 */
export function sessionToken(request: Request): string | null {
  return getCookie(request.headers, getSessionCookieName()) || null
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

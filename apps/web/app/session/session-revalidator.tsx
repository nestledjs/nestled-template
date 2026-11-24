import { type ReactNode, useCallback, useContext, useEffect, useRef } from 'react'
import {
  isRouteErrorResponse,
  type RouterState,
  UNSAFE_DataRouterContext as DataRouterContext,
} from 'react-router'
import type { ApolloClient } from '@apollo/client'
import { getApolloContext } from '@apollo/client/react'
import {
  APOLLO_SESSION_SUSPECT_EVENT,
  classifyApiFailure,
  SESSION_REVALIDATE_COOLDOWN_MS,
} from '@nestled-template/shared/apollo'
import { useBoundaryRecoveringRevalidate } from './boundary-recovery'

// When the browser last asked the server to judge the session again. Module-level, so the App's
// listener and the root ErrorBoundary (which renders with App unmounted) share one cooldown.
let lastRequestedAt = Number.NEGATIVE_INFINITY
// A suspicion that arrived during the cooldown or while offline. It is kept, not dropped: one
// coalesced revalidation runs when the cooldown ends or the browser comes back online, so a
// session revoked seconds after a transient 401 is still judged.
let pendingRevalidate: (() => unknown) | undefined
let pendingTimer: ReturnType<typeof setTimeout> | undefined
let waitingForOnline = false
// Armed by a browser 401 (SessionRevalidator) and run once, after the next revalidation that
// starts completes: it retries the queries that failed with that 401 if the server judged the
// session signed in.
let afterNextRevalidation: (() => void) | undefined
// Each query retried after a confirmed session, while its retry is in flight, and then the error
// the retry ended with. A query whose current error is the one its own retry produced is not
// retried again (a 401 on the retry asks for one more revalidation, never a loop); a failure that
// came later, on that query or any other, is a new 401 and gets its one retry.
let retrying = new WeakSet<object>()
let retryEndedWith = new WeakMap<object, unknown>()
// When a refused render last asked (RevalidateSessionOnRefusedRender).
let lastRefusedRenderAt = Number.NEGATIVE_INFINITY

/** How long a refused render waits before it may ask the server to judge the session again. */
export const REFUSED_RENDER_INTERVAL_MS = 60_000

function clearPending(): void {
  pendingRevalidate = undefined
  if (pendingTimer !== undefined) clearTimeout(pendingTimer)
  pendingTimer = undefined
  if (waitingForOnline) globalThis.removeEventListener('online', flushPending)
  waitingForOnline = false
}

function flushPending(): void {
  const revalidate = pendingRevalidate
  clearPending()
  if (revalidate) requestSessionRevalidation(revalidate)
}

/** Keep the suspicion and run it once, after `delayMs` or (offline) when the browser reconnects. */
function holdPending(revalidate: () => unknown, delayMs: number | 'online'): void {
  pendingRevalidate = revalidate
  if (delayMs === 'online') {
    if (pendingTimer !== undefined) clearTimeout(pendingTimer)
    pendingTimer = undefined
    if (!waitingForOnline) globalThis.addEventListener('online', flushPending)
    waitingForOnline = true
    return
  }
  if (waitingForOnline) globalThis.removeEventListener('online', flushPending)
  waitingForOnline = false
  pendingTimer ??= setTimeout(flushPending, delayMs)
}

/** For specs: forget the last request and any held suspicion, so the cooldown starts afresh. */
export function __resetSessionRevalidation(): void {
  clearPending()
  lastRequestedAt = Number.NEGATIVE_INFINITY
  afterNextRevalidation = undefined
  retrying = new WeakSet<object>()
  retryEndedWith = new WeakMap<object, unknown>()
  lastRefusedRenderAt = Number.NEGATIVE_INFINITY
}

function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * The browser's only response to a 401: ask the server to judge the session again by revalidating,
 * at most once per `SESSION_REVALIDATE_COOLDOWN_MS` and only while the browser is online. The
 * revalidation request runs the session middleware, which decides: a rejected session comes back
 * as a full document load of the sign-out route; any other verdict re-renders the page. The
 * browser never navigates to a sign-out by itself.
 *
 * A suspicion that arrives during the cooldown, or while offline, is held: one coalesced
 * revalidation runs when the cooldown ends, or when the browser reconnects. Nothing is sent while
 * offline. Returns whether a revalidation was started now.
 */
export function requestSessionRevalidation(
  revalidate: () => unknown,
  now: number = Date.now(),
): boolean {
  if (browserIsOffline()) {
    holdPending(revalidate, 'online')
    return false
  }
  const remaining = SESSION_REVALIDATE_COOLDOWN_MS - (now - lastRequestedAt)
  if (remaining > 0) {
    holdPending(revalidate, remaining)
    return false
  }
  clearPending()
  lastRequestedAt = now
  const after = afterNextRevalidation
  afterNextRevalidation = undefined
  const revalidation = revalidate()
  if (after) Promise.resolve(revalidation).then(after, () => undefined)
  return true
}

/**
 * Refetch, once, every active query whose last result is a clean 401 (`classifyApiFailure`:
 * an HTTP 401 or a GraphQL `UNAUTHENTICATED`, never with outage evidence beside it). Called only
 * after the server has judged the session signed in, so the 401 was transient. Only queries are
 * refetched: `getObservableQueries` holds no mutation, so a mutation is never replayed. A 403 or
 * any other error is left alone, and so is a query whose retry is still in flight or whose
 * current error is the one its own retry ended with. Returns how many queries were refetched.
 */
export function retryUnauthenticatedQueries(
  client: Pick<ApolloClient, 'getObservableQueries'>,
): number {
  let retried = 0
  for (const query of client.getObservableQueries('active')) {
    const { error } = query.getCurrentResult()
    if (classifyApiFailure(error) !== 'unauthenticated') continue
    if (retrying.has(query)) continue
    if (retryEndedWith.has(query) && retryEndedWith.get(query) === error) continue
    retrying.add(query)
    retried += 1
    const settle = retrySettled(query)
    Promise.resolve(query.refetch()).then(settle, settle)
  }
  return retried
}

/** Records how a query's retry ended, so the error it produced is not retried again. */
function retrySettled(query: { getCurrentResult: () => { error?: unknown } }): () => void {
  return () => {
    retrying.delete(query)
    retryEndedWith.set(query, query.getCurrentResult().error)
  }
}

/** Whether the root route's loader data, after a revalidation, holds a signed-in verdict. */
function rootVerdictIsSignedIn(state: RouterState): boolean {
  const rootId = state.matches[0]?.route.id
  if (rootId === undefined || state.errors?.[rootId] !== undefined) return false
  const data = state.loaderData[rootId] as { session?: { kind?: unknown } } | undefined
  return data?.session?.kind === 'signed-in'
}

/**
 * A hook form of `requestSessionRevalidation`. Inside a route ErrorBoundary it also clears the
 * boundary once the route recovers (`useBoundaryRecoveringRevalidate`); anywhere else it is a plain
 * revalidation.
 */
export function useSessionRevalidation(): () => boolean {
  const revalidate = useBoundaryRecoveringRevalidate()
  // Stable across renders, so a listener bound to it is added once.
  return useCallback(() => requestSessionRevalidation(revalidate), [revalidate])
}

/**
 * Mounted once in App. Answers the error link's `APOLLO_SESSION_SUSPECT_EVENT` (a browser query got
 * a clean 401) with `requestSessionRevalidation`.
 *
 * When that revalidation completes and the root loader's verdict is signed in, the 401 was
 * transient: the active queries that failed with it are refetched once
 * (`retryUnauthenticatedQueries`), so a list rendered from a client query does not stay empty
 * until the next navigation. Any other verdict retries nothing; a rejected session has already
 * been sent to the sign-out route by the server. The router state is read from
 * `UNSAFE_DataRouterContext` because it is current as soon as the revalidation resolves, before
 * React has rendered the new loader data.
 */
export function SessionRevalidator() {
  const request = useSessionRevalidation()
  const client = useContext(getApolloContext()).client
  const router = useContext(DataRouterContext)?.router
  const latest = useRef({ client, router })
  useEffect(() => {
    latest.current = { client, router }
  })
  useEffect(() => {
    const retryIfSignedIn = () => {
      const { client: current, router: data } = latest.current
      if (current && data && rootVerdictIsSignedIn(data.state)) {
        retryUnauthenticatedQueries(current)
      }
    }
    const onSuspect = () => {
      afterNextRevalidation = retryIfSignedIn
      request()
    }
    globalThis.addEventListener(APOLLO_SESSION_SUSPECT_EVENT, onSuspect)
    return () => {
      globalThis.removeEventListener(APOLLO_SESSION_SUSPECT_EVENT, onSuspect)
      if (afterNextRevalidation === retryIfSignedIn) afterNextRevalidation = undefined
    }
  }, [request])
  return null
}

/**
 * Whether a route error is a 401: a call refused after the session middleware judged the request
 * signed in (`narrowApiError`'s `API_UNAUTHENTICATED`, or any loader's 401). Never a sign-out.
 */
export function isUnauthenticatedRouteError(error: unknown): boolean {
  return isRouteErrorResponse(error) && error.status === 401
}

/**
 * Renders `children` (the route's error screen) and asks the server once to judge the session
 * again (`requestSessionRevalidation`, under the shared cooldown). If the session is rejected the
 * middleware answers with a full document load of the sign-out route; otherwise the screen stays.
 */
export function RevalidateSessionOnMount({ children }: Readonly<{ children: ReactNode }>) {
  const request = useSessionRevalidation()
  useEffect(() => {
    request()
  }, [request])
  return children
}

/**
 * Whether an error thrown while rendering is an API call's clean 401, by code and status only: what
 * `useReadQuery` throws for a preload the API refused after the request was judged signed in. The
 * answer reached the browser in the loader data stream, not through its error link, so no
 * `APOLLO_SESSION_SUSPECT_EVENT` was dispatched for it. (An HTTP failure does not travel that way: the
 * browser's client sends that query again itself, and its own error is what is thrown.) Outage
 * evidence beside the 401 outranks it
 * (`classifyApiFailure`). Never a sign-out.
 */
export function isRefusedRenderError(error: unknown): boolean {
  return classifyApiFailure(error) === 'unauthenticated'
}

/**
 * `RevalidateSessionOnMount` for a refused render (`isRefusedRenderError`). The revalidation loads
 * the page's data again, so a transient 401 recovers by itself. If the API refuses it again although
 * the server judges the session signed in, the page throws again and this mounts again: it asks at
 * most once per `REFUSED_RENDER_INTERVAL_MS`, so that never becomes a request loop.
 */
export function RevalidateSessionOnRefusedRender({ children }: Readonly<{ children: ReactNode }>) {
  const request = useSessionRevalidation()
  useEffect(() => {
    const now = Date.now()
    if (now - lastRefusedRenderAt < REFUSED_RENDER_INTERVAL_MS) return
    lastRefusedRenderAt = now
    request()
  }, [request])
  return children
}

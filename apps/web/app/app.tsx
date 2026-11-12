import { Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router'
import { GlobalContextProvider } from '@nestled-template/web'
import { CombinedGraphQLErrors, NetworkStatus, ServerError, ServerParseError } from '@apollo/client'
import { useReadQuery, type QueryRef } from '@apollo/client/react'
import type { MeQuery } from '@nestled-template/shared/sdk'
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { isViteCacheError, isNetworkError } from '@nestled-template/shared/utils'
import { ViteCacheError } from '@nestledjs/shared-components'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_DEFERRED_AUTH_FAILURE_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  classifyApiFailure,
  isApiOutageSignalled,
  isRetryableConnectivityError,
  takeDeferredAuthFailure,
} from '@nestled-template/shared/apollo'
import { AccessDenied } from './access-denied'
import { retryDelayMs, useApiAvailability, useRefetchFailedQueries } from './api-availability'
import { ApiUnavailableScreen } from './api-unavailable'
import { AppCodeErrorMarker, isAppCodeError, markAppCodeError } from './app-code-error-marker'

type MeQueryErrorBoundaryProps = {
  children: ReactNode
  resetKey?: unknown
  /**
   * Told what the Me query failed with, and whether it waits for the API to recover (see
   * `meFailureAwaitsRecovery`), so that failure can be retried on recovery.
   */
  onError?: (error: unknown, awaitsRecovery: boolean) => void
  /**
   * Rendered while a Me query that failed for want of a connection, with an answered error other
   * than a 401, or with a 401 during an outage (see `meFailureAwaitsRecovery`) waits to be retried.
   * It must not be the signed-out outlet: a signed-in layout reads `user: null` as "not
   * authenticated" and sends the browser to /force-logout, which clears the session cookie before
   * the retry can sign the user back in.
   */
  recoveringFallback?: ReactNode
}

type MeQueryErrorBoundaryState = {
  hasError: boolean
  awaitsRecovery: boolean
  resetKey?: unknown
  /** An error that is not a Me/session failure, passed on to the app's error screen. */
  appError?: { error: unknown }
}

/**
 * The API answered the request with an error that says nothing about the session: a 500 (or any
 * status but 401 and a proxy's 502/503/504), an unparsable response, or a GraphQL error that is
 * not UNAUTHENTICATED. The API is reachable, so Me is retried straight away (with backoff) rather
 * than after a connectivity probe.
 */
function isAnsweredApiFailure(error: unknown): boolean {
  const fromApi =
    CombinedGraphQLErrors.is(error) || ServerError.is(error) || ServerParseError.is(error)
  return fromApi && classifyApiFailure(error) === 'other'
}

/**
 * A Me failure that must not sign the user out, and is retried instead: a connectivity failure, an
 * answered error other than a 401 (`isAnsweredApiFailure`), or a 401 while the app has outage
 * evidence (`isApiOutageSignalled`). Log out only on an unambiguous 401; if the session really has
 * expired, the retry gets a 401 with no outage and logs out then.
 */
function meFailureAwaitsRecovery(error: unknown): boolean {
  return (
    isRetryableConnectivityError(error) ||
    isAnsweredApiFailure(error) ||
    (classifyApiFailure(error) === 'unauthenticated' && isApiOutageSignalled())
  )
}

/**
 * A failure of the Me query itself, and so the only thing the Me boundary may treat as a session
 * matter. The routes render inside an `AppCodeErrorMarker`, so anything they throw (a render or
 * effect bug, or a failure of a route's own API query) arrives marked (`isAppCodeError`) and is
 * passed on to the route's or the root error boundary with the session kept: it says nothing about
 * the session, and treating a route query's 500 as a Me failure put up the recovering screen and
 * retried Me instead of showing the route's error. What is left is what the Me read threw; of that,
 * only an answer from the API (an HTTP error, an unparsable response, a GraphQL error) or a request
 * that never got one is a session failure. Anything else is a bug, passed on too.
 */
function isMeSessionFailure(error: unknown): boolean {
  if (isAppCodeError(error)) return false
  return (
    CombinedGraphQLErrors.is(error) ||
    ServerError.is(error) ||
    ServerParseError.is(error) ||
    isRetryableConnectivityError(error)
  )
}

export { AppCodeErrorMarker, isAppCodeError }

// Me query refs whose failure was judged to wait for recovery. The decision sticks to the ref: once
// the outage clears, App mounts the boundary again with the same failed ref until the retry brings
// a new one, and by then nothing signals an outage, so judging its 401 afresh would sign the user
// out without a new answer from the API.
const meRefsAwaitingRecovery = new WeakSet<object>()

class MeQueryErrorBoundary extends Component<MeQueryErrorBoundaryProps, MeQueryErrorBoundaryState> {
  constructor(props: MeQueryErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, awaitsRecovery: false, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error: unknown): Partial<MeQueryErrorBoundaryState> {
    if (!isMeSessionFailure(error)) {
      markAppCodeError(error)
      return { appError: { error } }
    }
    return { hasError: true, awaitsRecovery: meFailureAwaitsRecovery(error), appError: undefined }
  }

  // A new Me query (the root loader ran again) gets a fresh chance. Without this, one failed Me
  // preload left the whole session rendering as signed out until a full page load. Reset while
  // rendering the new ref, not after: resetting in componentDidUpdate rendered the old failure
  // against the new ref first, for one frame, as signed out.
  static getDerivedStateFromProps(
    props: MeQueryErrorBoundaryProps,
    state: MeQueryErrorBoundaryState,
  ): Partial<MeQueryErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { hasError: false, awaitsRecovery: false, resetKey: props.resetKey, appError: undefined }
  }

  componentDidCatch(error: unknown) {
    // Not a session failure: render() passes it on, and nothing about the session is retried.
    if (!isMeSessionFailure(error)) return
    const awaitsRecovery = this.awaitsRecovery()
    const { resetKey } = this.props
    if (awaitsRecovery && typeof resetKey === 'object' && resetKey !== null) {
      meRefsAwaitingRecovery.add(resetKey)
    }
    this.props.onError?.(error, awaitsRecovery)
  }

  private awaitsRecovery(): boolean {
    const { resetKey } = this.props
    return (
      this.state.awaitsRecovery ||
      (typeof resetKey === 'object' && resetKey !== null && meRefsAwaitingRecovery.has(resetKey))
    )
  }

  render() {
    // An error from the app's own code goes on to the next error boundary up (the root
    // ErrorBoundary's error screen), with the session untouched. Rendering it as signed out sent a
    // signed-in route through /force-logout, which cleared the session cookie over a render bug.
    if (this.state.appError) throw this.state.appError.error
    if (this.state.hasError && this.awaitsRecovery() && this.props.recoveringFallback) {
      return this.props.recoveringFallback
    }
    // Any other Me/session failure (a 401 with no outage among them) renders as signed out: the
    // error link and the signed-in layout's redirect take it through logout.
    if (this.state.hasError) {
      return (
        <GlobalContextProvider user={null}>
          <AppCodeErrorMarker>
            <Outlet />
          </AppCodeErrorMarker>
        </GlobalContextProvider>
      )
    }
    return this.props.children
  }
}

export function loader({ context }: { context: { meQueryRef?: QueryRef<MeQuery> } }) {
  const { meQueryRef } = context
  return { meQueryRef }
}

export function App() {
  const location = useLocation()
  const data = useLoaderData() as {
    meQueryRef?: QueryRef<MeQuery>
    serviceUnavailable?: boolean
  }
  const { meQueryRef, serviceUnavailable: loaderServiceUnavailable } = data
  const revalidator = useRevalidator()
  const [viteCacheError, setViteCacheError] = useState(false)
  const [accessForbidden, setAccessForbidden] = useState(false)
  // Keyed on the whole navigation, not the pathname. A route that changes only its query string
  // -- switching the active organization, say -- is a new request that may well be permitted, and
  // keying on pathname alone leaves the access-denied screen up over it with no way to clear it.
  // location.key changes on every navigation, including same-path ones. Cleared while rendering
  // the new location (React's "adjust state when a prop changes"), so it is never shown over it.
  const [accessForbiddenKey, setAccessForbiddenKey] = useState(location.key)
  if (accessForbiddenKey !== location.key) {
    setAccessForbiddenKey(location.key)
    setAccessForbidden(false)
  }

  // The root loader says "unavailable" when the server could not reach the API. Once the browser
  // can, revalidate rather than reload: the loader runs again without a full page load, and if the
  // server still cannot reach the API the effect below puts the screen back and the probe carries
  // on at a widening interval, so a server-only failure cannot turn into a reload loop.
  const loaderUnavailableRef = useRef(loaderServiceUnavailable)
  // Written after commit, before any effect or handler reads it.
  useLayoutEffect(() => {
    loaderUnavailableRef.current = loaderServiceUnavailable
  }, [loaderServiceUnavailable])
  // Queries that failed during an outage, or during a blip too short to show the screen, refetch
  // once the API answers, the browser comes back online or the tab is shown again.
  const refetchFailedQueries = useRefetchFailedQueries()

  // The signed-in user's Me query failed for want of a connection, and the session is rendering as
  // signed out because of it. The query ref cannot be read again (it holds the error), so once the
  // API answers the root loader runs again for a fresh one, and the boundary resets on the new ref.
  // Without this a short blip left a signed-in user looking signed out until they navigated.
  // Connectivity failures, answered errors other than a 401 (a 500, a GraphQL error that is not
  // UNAUTHENTICATED), and a 401 during an outage are retried: any other 401 still goes through the
  // error link's logout.
  // Retries back off like the refetches, so a /graphql that keeps failing while the liveness route
  // answers cannot turn this into a revalidation loop.
  const meFailedOfflineRef = useRef(false)
  // `delay` is the queued retry's delay, kept until it runs or is dropped, so an effect replay that
  // cancelled its timer can queue it again.
  const meRetry = useRef<{
    attempt: number
    timer?: ReturnType<typeof setTimeout>
    delay?: number
  }>({ attempt: 0 })
  const runMeRetry = () => {
    meRetry.current.timer = undefined
    meRetry.current.delay = undefined
    meFailedOfflineRef.current = false
    void revalidator.revalidate()
  }
  // Read when the timer fires, so it always revalidates through this render's revalidator.
  const runMeRetryRef = useRef(runMeRetry)
  useLayoutEffect(() => {
    runMeRetryRef.current = runMeRetry
  })
  const queueMeRetry = (delay: number) => {
    meRetry.current.delay = delay
    meRetry.current.timer = setTimeout(() => runMeRetryRef.current(), delay)
  }
  const retryMeQuery = () => {
    if (!meFailedOfflineRef.current || meRetry.current.timer !== undefined) return
    const delay = meRetry.current.attempt === 0 ? 0 : retryDelayMs(meRetry.current.attempt - 1)
    meRetry.current.attempt += 1
    queueMeRetry(delay)
  }
  // The recovering screen's button: retry the Me query now instead of waiting out the backoff.
  // While the failure is still being confirmed there is no timer yet and the probe decides.
  const retryMeQueryNow = () => {
    if (!meFailedOfflineRef.current || meRetry.current.timer === undefined) return
    clearTimeout(meRetry.current.timer)
    runMeRetry()
  }
  const queueMeRetryRef = useRef(queueMeRetry)
  useEffect(() => {
    const retry = meRetry.current
    // Queue again a retry that the cleanup below cancelled. React StrictMode (development) replays
    // effects on mount: when Me failed on the first render, the boundary queued its retry while
    // mounting, the replayed cleanup cancelled the timer and left it recorded as pending, and every
    // later retry saw it pending and gave up, so the recovering screen stayed up for good.
    if (retry.timer === undefined && retry.delay !== undefined) queueMeRetryRef.current(retry.delay)
    return () => {
      clearTimeout(retry.timer)
      retry.timer = undefined
    }
  }, [])
  // For the Me boundary's error callback, which keeps one identity across renders.
  const retryMeQueryRef = useRef(retryMeQuery)
  useLayoutEffect(() => {
    retryMeQueryRef.current = retryMeQuery
  })
  // Me has been answered by the network (AppWithUser only calls this then, never for a cached
  // result that a still-pending request may yet turn into a failure). The outage is over: reset the
  // backoff, and drop a retry still queued from it, which would otherwise revalidate every loader
  // once more after the recovery already happened.
  const handleMeLoaded = useCallback(() => {
    meRetry.current.attempt = 0
    if (meRetry.current.timer !== undefined) {
      clearTimeout(meRetry.current.timer)
      meRetry.current.timer = undefined
    }
    meRetry.current.delay = undefined
    meFailedOfflineRef.current = false
  }, [])

  const api = useApiAvailability({
    onRecover: () => {
      if (loaderUnavailableRef.current) {
        // Revalidating also brings a fresh Me query, so a pending Me retry is covered.
        meFailedOfflineRef.current = false
        void revalidator.revalidate()
      } else {
        retryMeQuery()
      }
      // Queries left holding a 401 the error link let pass during the outage get a fresh answer.
      refetchFailedQueries({ includeAuthFailures: takeDeferredAuthFailure() })
    },
    onBlipCleared: () => {
      retryMeQuery()
      refetchFailedQueries({ includeAuthFailures: takeDeferredAuthFailure() })
    },
  })
  const { reportConnectivityError, markUnavailable } = api

  const handleMeQueryError = useCallback(
    (error: unknown, awaitsRecovery: boolean) => {
      if (!awaitsRecovery) return
      meFailedOfflineRef.current = true
      // The API answered (a 500, say): there is no outage to confirm, so retry Me at once, backing
      // off while it keeps failing. The recovering screen stays up meanwhile, and the session too.
      if (isAnsweredApiFailure(error)) {
        retryMeQueryRef.current()
        return
      }
      // Confirm the failure with the probe; whichever way it clears (a blip, or the outage screen
      // coming down) calls back above. During SSR the error link reports nothing, so this is the
      // only report a Me query that failed on the server gets.
      reportConnectivityError()
    },
    [reportConnectivityError],
  )

  useEffect(() => {
    if (loaderServiceUnavailable) markUnavailable()
  }, [data, loaderServiceUnavailable, markUnavailable])

  // A runtime outage clears as soon as the probe gets an answer; the app tree mounts again and its
  // queries refetch. A loader outage clears when the revalidated loader stops reporting one.
  const serviceUnavailable = loaderServiceUnavailable || api.unavailable

  useEffect(() => {
    const handleServiceUnavailable = () => reportConnectivityError()
    const handleAccessForbidden = () => setAccessForbidden(true)
    // An in-flight retry's outage evidence ended with no outage on screen, and a 401 was let pass
    // meanwhile: refetch the queries holding it, as recovering from an outage does.
    const handleDeferredAuthFailure = () =>
      refetchFailedQueries({ includeAuthFailures: takeDeferredAuthFailure() })

    const handleGlobalError = (event: ErrorEvent) => {
      const error = event.error

      if (error) {
        // Use utility functions to detect error types
        if (isViteCacheError(error)) {
          // noisy during normal usage
          setViteCacheError(true)
          return
        }

        if (isNetworkError(error)) {
          reportConnectivityError()
        }
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason

      if (reason) {
        // Use utility functions to detect error types
        if (isViteCacheError(reason)) {
          // noisy during normal usage
          setViteCacheError(true)
          event.preventDefault()
          return
        }

        if (isNetworkError(reason)) {
          reportConnectivityError()
          event.preventDefault() // Prevent default error handling
        }
      }
    }

    // noisy during normal usage

    // Listen for Apollo service unavailable events
    globalThis.addEventListener(APOLLO_SERVICE_UNAVAILABLE_EVENT, handleServiceUnavailable)
    globalThis.addEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, handleAccessForbidden)
    globalThis.addEventListener(APOLLO_DEFERRED_AUTH_FAILURE_EVENT, handleDeferredAuthFailure)

    // Fallback: Listen for global errors
    globalThis.addEventListener('error', handleGlobalError)
    globalThis.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      // noisy during normal usage
      globalThis.removeEventListener(APOLLO_SERVICE_UNAVAILABLE_EVENT, handleServiceUnavailable)
      globalThis.removeEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, handleAccessForbidden)
      globalThis.removeEventListener(APOLLO_DEFERRED_AUTH_FAILURE_EVENT, handleDeferredAuthFailure)
      globalThis.removeEventListener('error', handleGlobalError)
      globalThis.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [reportConnectivityError, refetchFailedQueries])

  // Show Vite cache error UI if detected
  if (viteCacheError) {
    return <ViteCacheError autoRefresh={true} autoRefreshDelay={3000} />
  }

  // Shown only for a confirmed outage, and cleared by itself when the API answers again
  if (serviceUnavailable) {
    return <ApiUnavailableScreen reason={api.reason} onRetry={api.retryNow} />
  }

  if (accessForbidden) {
    return <AccessDenied />
  }

  if (!meQueryRef) {
    // Always provide the context, user is null. No Me boundary here, so the marker is what keeps a
    // route's error from reaching the root ErrorBoundary looking like a rejected session.
    return (
      <GlobalContextProvider user={null}>
        <AppCodeErrorMarker>
          <Outlet />
        </AppCodeErrorMarker>
      </GlobalContextProvider>
    )
  }
  // Only call useReadQuery if meQueryRef is present
  return (
    <MeQueryErrorBoundary
      resetKey={meQueryRef}
      onError={handleMeQueryError}
      recoveringFallback={
        <ApiUnavailableScreen
          reason={api.reason}
          onRetry={() => {
            api.retryNow()
            retryMeQueryNow()
          }}
        />
      }
    >
      <AppWithUser meQueryRef={meQueryRef} onLoaded={handleMeLoaded} />
    </MeQueryErrorBoundary>
  )
}

function AppWithUser({
  meQueryRef,
  onLoaded,
}: Readonly<{ meQueryRef: QueryRef<MeQuery>; onLoaded?: () => void }>) {
  const { data, networkStatus } = useReadQuery(meQueryRef)
  const user = data?.me ?? null
  // Only once the network has answered. Under the default `cache-and-network` policy a cached Me
  // renders first, with the request still in flight; treating that as loaded reset the retry
  // backoff before the request had a chance to fail again.
  const answered = networkStatus === NetworkStatus.ready
  useEffect(() => {
    if (answered) onLoaded?.()
  }, [meQueryRef, answered, onLoaded])
  return (
    <GlobalContextProvider key={user?.id ?? 'nouser'} user={user}>
      {/* Below the Me read: what the routes throw is theirs, not a failure of the session query. */}
      <AppCodeErrorMarker>
        <Outlet />
      </AppCodeErrorMarker>
    </GlobalContextProvider>
  )
}

export default App

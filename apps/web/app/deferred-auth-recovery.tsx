import { useCallback, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { UNSAFE_DataRouterContext as DataRouterContext } from 'react-router'
import {
  APOLLO_DEFERRED_AUTH_FAILURE_EVENT,
  isApiOutageSignalled,
  takeDeferredAuthFailure,
} from '@nestled-template/shared/apollo'
import {
  reloadForRecovery,
  useApiAvailability,
  type ApiAvailabilityOptions,
} from './api-availability'
import { ApiUnavailableScreen, type ApiUnavailableCopy } from './api-unavailable'

/** How often a recovered screen checks again for outage evidence still held elsewhere. */
export const OUTAGE_EVIDENCE_RECHECK_MS = 1000

/**
 * The root error boundary's screen for a 401 that cannot be judged yet: one that came back while
 * the app had outage evidence (a confirmed outage, a failure being confirmed, or an in-flight retry
 * of an unreachable call), so the error link let it pass and the session was kept.
 *
 * It lives in the root error boundary, so it survives what the error did: the route that threw has
 * unmounted App, and with it App's listener for `APOLLO_DEFERRED_AUTH_FAILURE_EVENT` and its
 * refetch of failed queries. Without this the user stayed on the error screen after the API
 * recovered (or, if the session really was dead, was not logged out until the next navigation).
 *
 * While it is up it holds outage evidence of its own (so nothing logs the user out meanwhile) and
 * probes the API with backoff. Once the API answers and no other outage evidence is left (an
 * in-flight retry still holding some is waited for: its end is announced by
 * `APOLLO_DEFERRED_AUTH_FAILURE_EVENT`), it revalidates the route with a navigation to the same
 * URL: every active loader runs again, the error boundary resets on the new location, and the
 * route renders again with fresh queries. A URL with a `#fragment` is revalidated first, since a
 * same-URL navigation there is a hash-only change that runs no loader. A fresh answer is data (the route recovers, with no reload) or a 401
 * with no outage, which the error link and this boundary log out as usual.
 *
 * Rendered outside a data router (tests that render the boundary bare), it reloads the page
 * instead, at most once a minute (`reloadForRecovery`).
 */
export function DeferredAuthRecovery({
  probe,
  initialReason = 'server',
  copy,
  revalidate,
}: Readonly<
  Pick<ApiAvailabilityOptions, 'probe' | 'initialReason'> & {
    copy?: Partial<ApiUnavailableCopy>
    /** Replaces the route revalidation (tests). */
    revalidate?: () => void
  }
>) {
  const dataRouter = useContext(DataRouterContext)
  const revalidatedRef = useRef(false)

  const revalidateRoute = useCallback(() => {
    if (revalidatedRef.current) return
    revalidatedRef.current = true
    // The 401 that was let pass gets its fresh answer from the revalidation.
    takeDeferredAuthFailure()
    if (revalidate) {
      revalidate()
    } else if (dataRouter) {
      // A navigation to the same URL, not `router.revalidate()`: it runs every loader again just
      // the same, and the new location is what resets the error boundary. React Router resets it
      // after a revalidation only if it rendered the revalidation's loading state, which a fast
      // answer can skip, leaving the error screen up over a route that would now render.
      const { router } = dataRouter
      const { pathname, search, hash, key } = router.state.location
      const resetToSameUrl = () =>
        router.navigate({ pathname, search, hash }, { replace: true, preventScrollReset: true })
      if (hash) {
        // With a fragment, React Router takes a navigation to the same URL for a hash-only change
        // and runs no loader, so the failed query would never get a fresh answer. Run the loaders
        // first; the navigation after it still resets the boundary, onto the fresh data. Only if
        // the user is still there: a navigation away (or a loader's redirect) meanwhile wins.
        void router.revalidate().then(() => {
          const { location, navigation } = router.state
          if (location.key === key && navigation.state === 'idle') void resetToSameUrl()
        })
      } else {
        void resetToSameUrl()
      }
    } else {
      reloadForRecovery()
    }
  }, [dataRouter, revalidate])

  // The button, once the API answers: revalidate now, again if an earlier one did not help.
  const revalidateNow = useCallback(() => {
    revalidatedRef.current = false
    revalidateRoute()
  }, [revalidateRoute])

  // Set the moment this screen's own probe gets an answer (in `onRecover`, before any render), so
  // the event handler below never sees a stale "still unavailable".
  const recoveredRef = useRef(false)
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The queued re-check calls the current callback through this.
  const revalidateWhenClearRef = useRef<() => void>(() => undefined)

  // Revalidate only once nothing signals an outage any more: a revalidation while an in-flight
  // retry still holds evidence would only have its 401 let pass again. While other evidence is
  // left, check again every `OUTAGE_EVIDENCE_RECHECK_MS`: the retry link announces the end of its
  // evidence only when it let a 401 pass, and other sources (another mounted availability check)
  // announce nothing, so waiting on the event alone could leave the screen up for good.
  const revalidateWhenClear = useCallback(() => {
    clearTimeout(waitTimerRef.current)
    waitTimerRef.current = undefined
    if (!isApiOutageSignalled()) {
      revalidateRoute()
      return
    }
    waitTimerRef.current = setTimeout(
      () => revalidateWhenClearRef.current(),
      OUTAGE_EVIDENCE_RECHECK_MS,
    )
  }, [revalidateRoute])
  useLayoutEffect(() => {
    revalidateWhenClearRef.current = revalidateWhenClear
  }, [revalidateWhenClear])

  const { unavailable, reason, retryNow } = useApiAvailability({
    initiallyUnavailable: true,
    initialReason,
    probe,
    onRecover: () => {
      recoveredRef.current = true
      revalidateWhenClear()
    },
  })

  useEffect(() => {
    // The last evidence an in-flight retry held is gone, with a 401 let pass meanwhile. While this
    // screen's own probe has not got an answer yet, its recovery decides instead.
    const handleDeferredAuthFailure = () => {
      if (recoveredRef.current) revalidateWhenClear()
    }
    globalThis.addEventListener(APOLLO_DEFERRED_AUTH_FAILURE_EVENT, handleDeferredAuthFailure)
    return () => {
      globalThis.removeEventListener(APOLLO_DEFERRED_AUTH_FAILURE_EVENT, handleDeferredAuthFailure)
    }
  }, [revalidateWhenClear])

  useEffect(
    () => () => {
      clearTimeout(waitTimerRef.current)
      waitTimerRef.current = undefined
    },
    [],
  )

  // The button probes while the API looks unreachable; once it answers, it revalidates at once.
  const onRetry = unavailable ? retryNow : revalidateNow
  return <ApiUnavailableScreen reason={reason} onRetry={onRetry} copy={copy} />
}

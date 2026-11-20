import { useCallback, useContext, useEffect, useRef } from 'react'
import {
  UNSAFE_DataRouterContext as DataRouterContext,
  UNSAFE_RouteContext as RouteContext,
  useNavigate,
  useRevalidator,
  useRouteError,
} from 'react-router'

/**
 * A retry for a screen rendered by a route ErrorBoundary: it runs the route's middleware and
 * loaders again, exactly once, and makes sure the boundary clears once the route recovers.
 *
 * React Router's boundary keeps showing its error until it sees the location change, or until it
 * has rendered a revalidation going from `loading` back to `idle`. When a revalidation settles
 * quickly, React can batch both updates into one render: the router's state has no error any more,
 * and the boundary still shows the error screen (with its retry timers still running). So:
 * - on a URL with no fragment, the retry is a replace navigation to the same URL (search and
 *   history state kept, scroll kept): one load, and its location change always resets the boundary;
 * - on a URL with a fragment, where a same-URL navigation is a hash-only change that loads nothing,
 *   the retry is a revalidation; if the route recovered and this screen is still mounted, that
 *   load-free navigation then resets the boundary.
 * It does nothing while another navigation is running, and never navigates after the user moved
 * on. Outside an error boundary (the App's 401 listener) it is a plain revalidation. The live
 * router state is read from `UNSAFE_DataRouterContext` because no public hook exposes it.
 */
export function useBoundaryRecoveringRevalidate(): () => Promise<void> {
  const revalidator = useRevalidator()
  const navigate = useNavigate()
  const router = useContext(DataRouterContext)?.router
  const { matches } = useContext(RouteContext)
  const routeId = matches[matches.length - 1]?.route.id
  // Outside an error boundary useRouteError() is null (its context default), not undefined.
  const inErrorBoundary = useRouteError() != null

  const latest = useRef({
    revalidate: revalidator.revalidate,
    navigate,
    router,
    routeId,
    inErrorBoundary,
  })
  const mounted = useRef(true)
  useEffect(() => {
    latest.current = {
      revalidate: revalidator.revalidate,
      navigate,
      router,
      routeId,
      inErrorBoundary,
    }
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return useCallback(async () => {
    const { router: current, inErrorBoundary: inBoundary } = latest.current
    // Outside an error boundary, or after the screen that asked has unmounted (a 401 retry held
    // through the cooldown or an offline spell can run once the user has moved on): a plain
    // revalidation, never a navigation of whatever page is showing now.
    if (!inBoundary || !current || !mounted.current) {
      await latest.current.revalidate()
      return
    }
    const startedAt = current.state.location
    // A navigation the user (or anything else) started is already reloading the route, and its
    // location change will reset the boundary: nothing to add.
    if (current.state.navigation.state !== 'idle') return

    if (startedAt.hash === '') {
      // No fragment: retry as a replace navigation to the same URL. It loads once, like a
      // revalidation, and its location change resets the boundary whether the route recovers or
      // fails again, so no second load is ever needed.
      const { pathname, search, state } = startedAt
      await latest.current.navigate(
        { pathname, search },
        { replace: true, preventScrollReset: true, state },
      )
      return
    }

    // With a fragment a same-URL navigation is a hash-only change, which loads nothing: retry with
    // a revalidation, then, only if the boundary is stale (the route recovered but the boundary did
    // not see it), reset it with that load-free navigation.
    await latest.current.revalidate()
    const { routeId: id, navigate: go } = latest.current
    if (!mounted.current || id === undefined) return
    const { location, navigation, errors } = current.state
    if (location.key !== startedAt.key || navigation.state !== 'idle') return
    if (errors?.[id] !== undefined) return
    const { pathname, search, hash, state } = location
    void go({ pathname, search, hash }, { replace: true, preventScrollReset: true, state })
  }, [])
}

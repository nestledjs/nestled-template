import { Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router'
import { GlobalContextProvider } from '@nestled-template/web'
import { useReadQuery, type QueryRef } from '@apollo/client/react'
import type { MeQuery } from '@nestled-template/shared/sdk'
import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { isViteCacheError, isNetworkError } from '@nestled-template/shared/utils'
import { ViteCacheError } from '@nestledjs/shared-components'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  isRetryableConnectivityError,
} from '@nestled-template/shared/apollo'
import { AccessDenied } from './access-denied'
import { retryDelayMs, useApiAvailability, useRefetchFailedQueries } from './api-availability'
import { ApiUnavailableScreen } from './api-unavailable'

type MeQueryErrorBoundaryProps = {
  children: ReactNode
  resetKey?: unknown
  /** Told what the Me query failed with, so a connectivity failure can be retried on recovery. */
  onError?: (error: unknown) => void
  /**
   * Rendered while a Me query that failed for want of a connection waits to be retried. It must
   * not be the signed-out outlet: a signed-in layout reads `user: null` as "not authenticated" and
   * sends the browser to /force-logout, which clears the session cookie before the retry can sign
   * the user back in.
   */
  recoveringFallback?: ReactNode
}

type MeQueryErrorBoundaryState = { hasError: boolean; connectivityFailure: boolean }

class MeQueryErrorBoundary extends Component<MeQueryErrorBoundaryProps, MeQueryErrorBoundaryState> {
  constructor(props: MeQueryErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, connectivityFailure: false }
  }

  static getDerivedStateFromError(error: unknown): MeQueryErrorBoundaryState {
    return { hasError: true, connectivityFailure: isRetryableConnectivityError(error) }
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error)
  }

  // A new Me query (the root loader ran again) gets a fresh chance. Without this, one failed Me
  // preload left the whole session rendering as signed out until a full page load.
  componentDidUpdate(prevProps: MeQueryErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, connectivityFailure: false })
    }
  }

  render() {
    if (this.state.hasError && this.state.connectivityFailure && this.props.recoveringFallback) {
      return this.props.recoveringFallback
    }
    // Any other failure (a 401 among them) renders as signed out, as before: the error link and the
    // signed-in layout's redirect take it through logout.
    if (this.state.hasError) {
      return (
        <GlobalContextProvider user={null}>
          <Outlet />
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

  // The root loader says "unavailable" when the server could not reach the API. Once the browser
  // can, revalidate rather than reload: the loader runs again without a full page load, and if the
  // server still cannot reach the API the effect below puts the screen back and the probe carries
  // on at a widening interval, so a server-only failure cannot turn into a reload loop.
  const loaderUnavailableRef = useRef(loaderServiceUnavailable)
  loaderUnavailableRef.current = loaderServiceUnavailable
  // Queries that failed during an outage, or during a blip too short to show the screen, refetch
  // once the API answers, the browser comes back online or the tab is shown again.
  const refetchFailedQueries = useRefetchFailedQueries()

  // The signed-in user's Me query failed for want of a connection, and the session is rendering as
  // signed out because of it. The query ref cannot be read again (it holds the error), so once the
  // API answers the root loader runs again for a fresh one, and the boundary resets on the new ref.
  // Without this a short blip left a signed-in user looking signed out until they navigated.
  // Only connectivity failures are retried: a 401 still goes through the error link's logout.
  // Retries back off like the refetches, so a /graphql that keeps failing while the liveness route
  // answers cannot turn this into a revalidation loop.
  const meFailedOfflineRef = useRef(false)
  const meRetry = useRef<{ attempt: number; timer?: ReturnType<typeof setTimeout> }>({ attempt: 0 })
  const retryMeQuery = () => {
    if (!meFailedOfflineRef.current || meRetry.current.timer !== undefined) return
    const delay = meRetry.current.attempt === 0 ? 0 : retryDelayMs(meRetry.current.attempt - 1)
    meRetry.current.attempt += 1
    meRetry.current.timer = setTimeout(() => {
      meRetry.current.timer = undefined
      meFailedOfflineRef.current = false
      void revalidator.revalidate()
    }, delay)
  }
  // The recovering screen's button: retry the Me query now instead of waiting out the backoff.
  // While the failure is still being confirmed there is no timer yet and the probe decides.
  const retryMeQueryNow = () => {
    if (!meFailedOfflineRef.current || meRetry.current.timer === undefined) return
    clearTimeout(meRetry.current.timer)
    meRetry.current.timer = undefined
    meFailedOfflineRef.current = false
    void revalidator.revalidate()
  }
  useEffect(() => {
    const retry = meRetry.current
    return () => clearTimeout(retry.timer)
  }, [])
  const handleMeLoaded = useCallback(() => {
    meRetry.current.attempt = 0
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
      refetchFailedQueries()
    },
    onBlipCleared: () => {
      retryMeQuery()
      refetchFailedQueries()
    },
  })
  const { reportConnectivityError, markUnavailable } = api

  const handleMeQueryError = useCallback(
    (error: unknown) => {
      if (!isRetryableConnectivityError(error)) return
      meFailedOfflineRef.current = true
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

    // Fallback: Listen for global errors
    globalThis.addEventListener('error', handleGlobalError)
    globalThis.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      // noisy during normal usage
      globalThis.removeEventListener(APOLLO_SERVICE_UNAVAILABLE_EVENT, handleServiceUnavailable)
      globalThis.removeEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, handleAccessForbidden)
      globalThis.removeEventListener('error', handleGlobalError)
      globalThis.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [reportConnectivityError])

  // Keyed on the whole navigation, not the pathname. A route that changes only its query string
  // -- switching the active organization, say -- is a new request that may well be permitted, and
  // keying on pathname alone leaves the access-denied screen up over it with no way to clear it.
  // location.key changes on every navigation, including same-path ones.
  useEffect(() => {
    setAccessForbidden(false)
  }, [location.key])

  // Show Vite cache error UI if detected
  if (viteCacheError) {
    return <ViteCacheError autoRefresh={true} autoRefreshDelay={3000} />
  }

  // Shown only for a confirmed outage, and cleared by itself when the API answers again
  if (serviceUnavailable) {
    return <ApiUnavailableScreen offline={api.offline} onRetry={api.retryNow} />
  }

  if (accessForbidden) {
    return <AccessDenied />
  }

  if (!meQueryRef) {
    // Always provide the context, user is null
    return (
      <GlobalContextProvider user={null}>
        <Outlet />
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
          offline={api.offline}
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
  const { data } = useReadQuery(meQueryRef)
  const user = data?.me ?? null
  useEffect(() => {
    onLoaded?.()
  }, [meQueryRef, onLoaded])
  return (
    <GlobalContextProvider key={user?.id ?? 'nouser'} user={user}>
      <Outlet />
    </GlobalContextProvider>
  )
}

export default App

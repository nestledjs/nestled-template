import { Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router'
import { GlobalContextProvider } from '@nestled-template/web'
import { useReadQuery, type QueryRef } from '@apollo/client/react'
import type { MeQuery } from '@nestled-template/shared/sdk'
import { Component, type ReactNode, useEffect, useRef, useState } from 'react'
import { isViteCacheError, isNetworkError } from '@nestled-template/shared/utils'
import { ViteCacheError } from '@nestledjs/shared-components'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
} from '@nestled-template/shared/apollo'
import { AccessDenied } from './access-denied'
import { useApiAvailability } from './api-availability'
import { ApiUnavailableScreen } from './api-unavailable'

type MeQueryErrorBoundaryProps = { children: ReactNode; resetKey?: unknown }

class MeQueryErrorBoundary extends Component<MeQueryErrorBoundaryProps, { hasError: boolean }> {
  constructor(props: MeQueryErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  // A new Me query (the root loader ran again) gets a fresh chance. Without this, one failed Me
  // preload left the whole session rendering as signed out until a full page load.
  componentDidUpdate(prevProps: MeQueryErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
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
  const api = useApiAvailability({
    onRecover: () => {
      if (loaderUnavailableRef.current) void revalidator.revalidate()
    },
  })
  const { reportConnectivityError, markUnavailable } = api

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
    <MeQueryErrorBoundary resetKey={meQueryRef}>
      <AppWithUser meQueryRef={meQueryRef} />
    </MeQueryErrorBoundary>
  )
}

function AppWithUser({ meQueryRef }: Readonly<{ meQueryRef: QueryRef<MeQuery> }>) {
  const { data } = useReadQuery(meQueryRef)
  const user = data?.me ?? null
  return (
    <GlobalContextProvider key={user?.id ?? 'nouser'} user={user}>
      <Outlet />
    </GlobalContextProvider>
  )
}

export default App

import { Outlet, useLoaderData, useLocation } from 'react-router'
import { GlobalContextProvider } from '@nestled-template/web'
import { useReadQuery, type QueryRef } from '@apollo/client/react'
import type { MeQuery } from '@nestled-template/shared/sdk'
import { Component, type ReactNode, useEffect, useState } from 'react'
import { isViteCacheError, isNetworkError } from '@nestled-template/shared/utils'
import { ServiceUnavailable, ViteCacheError } from '@nestledjs/shared-components'
import { APOLLO_ACCESS_FORBIDDEN_EVENT } from '@nestled-template/shared/apollo'
import { AccessDenied } from './access-denied'

class MeQueryErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
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
  const [runtimeServiceUnavailable, setRuntimeServiceUnavailable] = useState(false)
  const [viteCacheError, setViteCacheError] = useState(false)
  const [accessForbidden, setAccessForbidden] = useState(false)

  // Service unavailable can come from either the root loader or runtime Apollo errors
  const serviceUnavailable = loaderServiceUnavailable || runtimeServiceUnavailable

  useEffect(() => {
    const handleServiceUnavailable = () => setRuntimeServiceUnavailable(true)
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
          // noisy during normal usage
          setRuntimeServiceUnavailable(true)
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
          // noisy during normal usage
          setRuntimeServiceUnavailable(true)
          event.preventDefault() // Prevent default error handling
        }
      }
    }

    // noisy during normal usage

    // Listen for Apollo service unavailable events
    globalThis.addEventListener('apollo-service-unavailable', handleServiceUnavailable)
    globalThis.addEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, handleAccessForbidden)

    // Fallback: Listen for global errors
    globalThis.addEventListener('error', handleGlobalError)
    globalThis.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      // noisy during normal usage
      globalThis.removeEventListener('apollo-service-unavailable', handleServiceUnavailable)
      globalThis.removeEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, handleAccessForbidden)
      globalThis.removeEventListener('error', handleGlobalError)
      globalThis.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

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

  // Show service unavailable UI if Apollo detected network issues
  if (serviceUnavailable) {
    return (
      <ServiceUnavailable
        title="API Unavailable"
        message="Our servers are currently unreachable. Please check your internet connection or refresh the page to try again."
      />
    )
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
    <MeQueryErrorBoundary>
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

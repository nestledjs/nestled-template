import React from 'react'
import { isViteCacheError, isNetworkError } from '@nestled-template/shared/utils'
import { WebUiViteCacheError } from './web-ui-vite-cache-error'
import { WebUiServiceUnavailable } from './web-ui-service-unavailable'
import { WebErrorBoundaryUi } from './error-boundary'

export interface WebUiErrorBoundaryProps {
  error: Error
  autoRefresh?: boolean
  autoRefreshDelay?: number
  header?: React.ReactNode
}

/**
 * Comprehensive error boundary component that handles all error types:
 * - Vite cache errors (shows refresh UI)
 * - Network/API errors (shows service unavailable)
 * - Other errors (shows generic error boundary)
 */
export function WebUiErrorBoundary({
  error,
  autoRefresh = true,
  autoRefreshDelay = 3000,
  header
}: Readonly<WebUiErrorBoundaryProps>) {
  console.error('[WebUiErrorBoundary] Caught error:', error)

  // Use utility functions to detect error types
  const viteCacheError = isViteCacheError(error)
  const networkError = isNetworkError(error)

  console.log('[WebUiErrorBoundary] Error classification:', {
    viteCacheError,
    networkError,
    errorName: error?.name,
    errorMessage: error?.message,
  })

  if (viteCacheError) {
    return (
      <WebUiViteCacheError
        autoRefresh={autoRefresh}
        autoRefreshDelay={autoRefreshDelay}
        header={header}
      />
    )
  }

  if (networkError) {
    return (
      <WebUiServiceUnavailable
        title="Service Unavailable"
        message="Our servers are currently unreachable. Please check your internet connection or try again in a few minutes."
        header={header}
      />
    )
  }

  // For other errors, show the generic error boundary UI
  return <WebErrorBoundaryUi error={error} />
}

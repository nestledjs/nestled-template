/**
 * Detects if an error is caused by Vite development cache issues
 * This typically happens when the browser cache gets out of sync with the Vite dev server
 */
export function isViteCacheError(error: Error | unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const errorObj = error as Error
  const errorMessage = errorObj.message || ''
  const errorStack = errorObj.stack || ''

  // Explicitly exclude common React runtime/render errors that are NOT Vite cache issues
  const nonViteRenderErrors = [
    'Objects are not valid as a React child',
    'Cannot read properties of undefined (reading \u0027map\u0027)',
    'Cannot read properties of undefined (reading \u0027id\u0027)',
    'Cannot read properties of null',
    'Invariant failed',
    'License expired',
    '.split is not a function', // Form library errors with invalid data types
  ]
  if (nonViteRenderErrors.some((msg) => errorMessage.includes(msg))) {
    return false
  }

  // Check for specific patterns that indicate Vite cache issues
  return (
    // React context errors from cached modules
    (errorMessage.includes('Cannot read properties of null') && errorMessage.includes('useContext')) ||
    (errorMessage.includes('Cannot read properties of undefined') && errorMessage.includes('useContext')) ||
    (errorMessage.includes('reading \'useContext\'') && errorStack.includes('@fs/')) ||
    
    // Vite dev server specific patterns
    (errorStack.includes('useContext') && errorStack.includes('node_modules/.vite/')) ||
    (errorStack.includes('useFrameworkContext') && errorStack.includes('vite/')) ||
    (errorMessage.includes('useContext') && errorStack.includes('chunk-')) ||
    
    // Other common Vite cache error patterns
    (errorMessage.includes('useFrameworkContext') && errorStack.includes('deps/')) ||
    (errorStack.includes('/@fs/') && errorStack.includes('node_modules/.vite/')) ||
    (errorMessage.includes('Module externalized for browser compatibility') && errorStack.includes('vite'))
  )
}

/**
 * Detects if an error is network-related (for API/Apollo errors)
 */
export function isNetworkError(error: Error | unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const errorObj = error as Error
  const errorMessage = errorObj.message || ''
  const errorName = errorObj.name || ''
  const errorStack = errorObj.stack || ''
  const anyErr = error as any

  // Exclude Vite cache errors from network errors
  if (isViteCacheError(error)) {
    return false
  }

  // If this looks like an ApolloError, prefer structured fields when available
  // Treat explicit Unauthorized/UNAUTHENTICATED as NOT network errors
  if (anyErr && (anyErr.graphQLErrors || anyErr.networkError)) {
    if (anyErr.networkError) {
      return true
    }
    if (Array.isArray(anyErr.graphQLErrors) && anyErr.graphQLErrors.length > 0) {
      const hasAuthError = anyErr.graphQLErrors.some((g: any) => {
        const msg = (g?.message || '').toString()
        const code = g?.extensions?.code || ''
        return msg.includes('Unauthorized') || msg.includes('UNAUTHORIZED') || code === 'UNAUTHENTICATED'
      })
      if (hasAuthError) return false
    }
  }

  return (
    // Network errors
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('Connection refused') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('ENOTFOUND') ||
    errorName === 'TypeError' ||
    errorName === 'NetworkError' ||
    // GraphQL/API explicit service down wording
    errorMessage.includes('service unavailable') ||
    errorMessage.includes('Service Unavailable') ||
    // General connectivity issues
    errorMessage.includes('ERR_NETWORK') ||
    errorMessage.includes('ERR_CONNECTION') ||
    errorMessage.includes('NETWORK_ERROR')
  )
}

/**
 * Handles Vite cache errors by forcing a page reload
 * @param error - The error to check and handle
 * @param autoReload - Whether to automatically reload the page (default: true)
 * @param delay - Delay in milliseconds before reloading (default: 0)
 */
export function handleViteCacheError(
  error: Error | unknown, 
  autoReload = true, 
  delay = 0
): boolean {
  if (isViteCacheError(error)) {
    console.log('[Error Handler] Vite cache error detected:', error)
    
    if (autoReload && typeof window !== 'undefined') {
      if (delay > 0) {
        setTimeout(() => {
          window.location.reload()
        }, delay)
      } else {
        window.location.reload()
      }
    }
    return true
  }
  return false
} 
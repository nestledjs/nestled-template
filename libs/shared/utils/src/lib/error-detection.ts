/**
 * Detects if an error is caused by Vite development cache issues
 * This typically happens when the browser cache gets out of sync with the Vite dev server
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringProperty(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function graphQLErrorHasAuthCode(error: unknown): boolean {
  if (!isRecord(error)) {
    return false
  }

  const msg = stringProperty(error, 'message')
  const extensions = isRecord(error.extensions) ? error.extensions : {}
  const code = stringProperty(extensions, 'code')

  return msg.includes('Unauthorized') || msg.includes('UNAUTHORIZED') || code === 'UNAUTHENTICATED'
}

export function isViteCacheError(error: unknown): boolean {
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
  if (nonViteRenderErrors.some(msg => errorMessage.includes(msg))) {
    return false
  }

  // Check for specific patterns that indicate Vite cache issues
  return (
    // React context errors from cached modules
    (errorMessage.includes('Cannot read properties of null') &&
      errorMessage.includes('useContext')) ||
    (errorMessage.includes('Cannot read properties of undefined') &&
      errorMessage.includes('useContext')) ||
    (errorMessage.includes("reading 'useContext'") && errorStack.includes('@fs/')) ||
    // Vite dev server specific patterns
    (errorStack.includes('useContext') && errorStack.includes('node_modules/.vite/')) ||
    (errorStack.includes('useFrameworkContext') && errorStack.includes('vite/')) ||
    (errorMessage.includes('useContext') && errorStack.includes('chunk-')) ||
    // Other common Vite cache error patterns
    (errorMessage.includes('useFrameworkContext') && errorStack.includes('deps/')) ||
    (errorStack.includes('/@fs/') && errorStack.includes('node_modules/.vite/')) ||
    (errorMessage.includes('Module externalized for browser compatibility') &&
      errorStack.includes('vite'))
  )
}

/**
 * Detects if an error is network-related (for API/Apollo errors)
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const errorObj = error as Error
  const errorMessage = errorObj.message || ''
  const errorName = errorObj.name || ''
  const errorRecord = isRecord(error) ? error : {}

  // Exclude Vite cache errors from network errors
  if (isViteCacheError(error)) {
    return false
  }

  // If this looks like an ApolloError, prefer structured fields when available
  // Treat explicit Unauthorized/UNAUTHENTICATED as NOT network errors
  if (errorRecord.graphQLErrors || errorRecord.networkError) {
    if (errorRecord.networkError) {
      return true
    }
    if (Array.isArray(errorRecord.graphQLErrors) && errorRecord.graphQLErrors.length > 0) {
      const hasAuthError = errorRecord.graphQLErrors.some(graphQLErrorHasAuthCode)
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
export function handleViteCacheError(error: unknown, autoReload = true, delay = 0): boolean {
  if (isViteCacheError(error)) {
    console.log('[Error Handler] Vite cache error detected:', error)

    if (autoReload && globalThis.window !== undefined) {
      if (delay > 0) {
        setTimeout(() => {
          globalThis.location.reload()
        }, delay)
      } else {
        globalThis.location.reload()
      }
    }
    return true
  }
  return false
}

/**
 * Authentication error details returned by isAuthError
 */
export interface AuthErrorInfo {
  isAuth: boolean
  // 'unauthenticated' = no valid session (401-shaped); 'forbidden' = valid session, no permission
  // (403-shaped). The ambiguous UNAUTHORIZED family never becomes a third member: it classifies as
  // unauthenticated when the message suggests re-login ("please log in", …) and forbidden
  // otherwise — the same rule on every path, GraphQL or raw message.
  type: 'unauthenticated' | 'forbidden' | null
  message: string | null
}

const NO_AUTH: AuthErrorInfo = { isAuth: false, type: null, message: null }

/** Check if message indicates unauthenticated state */
function isUnauthenticatedMessage(msg: string): boolean {
  return msg.includes('unauthenticated') || msg.includes('not authenticated')
}

/** Check if message indicates forbidden state */
function isForbiddenMessage(msg: string): boolean {
  return msg.includes('forbidden') || msg.includes('access denied')
}

/** Check if unauthorized message suggests login needed */
function suggestsLoginNeeded(msg: string): boolean {
  return (
    msg.includes('not logged in') ||
    msg.includes('please log in') ||
    msg.includes('must be logged in')
  )
}

/** Check a single GraphQL error for auth issues */
function checkGraphQLError(graphQLError: {
  message?: string
  extensions?: { code?: string }
}): AuthErrorInfo | null {
  const msg = (graphQLError?.message || '').toLowerCase()
  const code = (graphQLError?.extensions?.code || '').toUpperCase()
  const originalMessage = graphQLError?.message || ''

  if (code === 'UNAUTHENTICATED' || isUnauthenticatedMessage(msg)) {
    return { isAuth: true, type: 'unauthenticated', message: originalMessage }
  }

  if (code === 'FORBIDDEN' || isForbiddenMessage(msg)) {
    return { isAuth: true, type: 'forbidden', message: originalMessage }
  }

  if (code === 'UNAUTHORIZED' || msg.includes('unauthorized')) {
    const type = suggestsLoginNeeded(msg) ? 'unauthenticated' : 'forbidden'
    return { isAuth: true, type, message: originalMessage }
  }

  return null
}

/** Check raw error message for auth keywords */
function checkErrorMessage(
  errorMessage: string,
  originalMessage: string | null,
): AuthErrorInfo | null {
  if (isUnauthenticatedMessage(errorMessage)) {
    return { isAuth: true, type: 'unauthenticated', message: originalMessage }
  }

  if (isForbiddenMessage(errorMessage)) {
    return { isAuth: true, type: 'forbidden', message: originalMessage }
  }

  if (errorMessage.includes('unauthorized')) {
    // Same rule as the GraphQL path: "unauthorized" is ambiguous, so let the message decide.
    // Classifying it unconditionally here while the GraphQL path used the heuristic meant the
    // same error text could route to logout or to the access-denied panel depending on which
    // shape it arrived in.
    const type = suggestsLoginNeeded(errorMessage) ? 'unauthenticated' : 'forbidden'
    return { isAuth: true, type, message: originalMessage }
  }

  return null
}

/**
 * Detects if an error is an authentication or authorization error from GraphQL/API
 * Returns detailed information about the type of auth error
 */
export function isAuthError(error: unknown): AuthErrorInfo {
  if (!error || typeof error !== 'object') {
    return NO_AUTH
  }

  const errorObj = error as Error
  const anyErr = error as Record<string, unknown>

  // Check for Apollo GraphQL errors structure
  if (anyErr.graphQLErrors && Array.isArray(anyErr.graphQLErrors)) {
    for (const graphQLError of anyErr.graphQLErrors) {
      const result = checkGraphQLError(graphQLError)
      if (result) return result
    }
  }

  // Check raw error message
  const errorMessage = (errorObj.message || '').toLowerCase()
  const messageResult = checkErrorMessage(errorMessage, errorObj.message ?? null)
  if (messageResult) return messageResult

  // Check for HTTP status codes
  const statusCode = (anyErr.statusCode ?? anyErr.status) as number | undefined
  if (statusCode === 401) {
    return { isAuth: true, type: 'unauthenticated', message: errorObj.message ?? null }
  }
  if (statusCode === 403) {
    return { isAuth: true, type: 'forbidden', message: errorObj.message ?? null }
  }

  return NO_AUTH
}

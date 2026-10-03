// Crypto polyfill for older Node.js environments (like Railway)
// Note: Using require() instead of import for synchronous polyfill initialization
if (globalThis !== undefined && globalThis.crypto === undefined) {
  let cryptoModule: typeof import('node:crypto')
  try {
    // Try to load Node.js crypto module
    cryptoModule = require('node:crypto')
  } catch (e) {
    // Final fallback: fail explicitly rather than provide insecure crypto
    const error = e as Error
    console.error('[Apollo] CRITICAL: Failed to load Node.js crypto module:', error.message)
    console.error(
      '[Apollo] This environment lacks both globalThis.crypto and Node.js crypto module',
    )
    throw new Error(
      'Cryptographically secure random number generation is not available in this environment. Please use a newer Node.js version or ensure crypto APIs are available.',
    )
  }

  if (cryptoModule) {
    // First preference: Use webcrypto if available (Node.js 16+)
    if (cryptoModule.webcrypto) {
      console.log('[Apollo] Using Node.js webcrypto for crypto polyfill (Node.js 16+)')
      Object.defineProperty(globalThis, 'crypto', {
        value: cryptoModule.webcrypto,
        configurable: true,
      })
    } else {
      // Fallback: Create Web Crypto API interface using crypto.randomBytes (Node.js 12+)
      console.log('[Apollo] Using crypto.randomBytes() polyfill for Web Crypto API (Node.js 12-15)')
      const cryptoPolyfill = {
        randomUUID: () => {
          // Generate cryptographically secure UUID v4 using Node.js crypto
          const bytes = cryptoModule.randomBytes(16)
          bytes[6] = (bytes[6] & 0x0f) | 0x40 // Version 4
          bytes[8] = (bytes[8] & 0x3f) | 0x80 // Variant bits
          const hex = bytes.toString('hex')
          return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20, 32),
          ].join('-') as `${string}-${string}-${string}-${string}-${string}`
        },
        getRandomValues: <T extends ArrayBufferView>(array: T): T => {
          // Generate cryptographically secure random values using Node.js crypto
          const byteLength = array.byteLength
          const bytes = cryptoModule.randomBytes(byteLength)
          const uint8Array = new Uint8Array(array.buffer, array.byteOffset, byteLength)
          for (let i = 0; i < uint8Array.length; i++) {
            uint8Array[i] = bytes[i]
          }
          return array
        },
      } as Crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: cryptoPolyfill,
        configurable: true,
      })
    }
  }
}

import { ApolloLink, CombinedGraphQLErrors, Observable } from '@apollo/client'
import { ApolloClient } from '@apollo/client-integration-react-router'
import { SetContextLink } from '@apollo/client/link/context'
import { ErrorLink } from '@apollo/client/link/error'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'
import UploadHttpLink from 'apollo-upload-client/UploadHttpLink.mjs'
import { createCache } from './cache-config'

export type ClientOptions = {
  token?: string
  webToken?: string
  apiUrl?: string
  platform?: 'web' | 'native'
  environment?: 'development' | 'staging' | 'production'
}

export const APOLLO_ACCESS_FORBIDDEN_EVENT = 'apollo-access-forbidden'

// Global flag to track if we've already shown the "service-unavailable" message
let hasShownServiceUnavailableMessage = false

/**
 * Get the session cookie name from environment variable.
 * Works in both server (process.env) and client (import.meta.env) contexts.
 */
function getSessionCookieName(): string {
  // Server-side (Node.js)
  if (process?.env?.VITE_COOKIE_NAME) {
    return process.env.VITE_COOKIE_NAME
  }
  // Client-side (Vite)
  if (import.meta?.env?.VITE_COOKIE_NAME) {
    return import.meta.env.VITE_COOKIE_NAME
  }
  // Default fallback
  return '__session'
}

/**
 * Decode a base64url JWT segment in both runtimes.
 *
 * `Buffer` is Node-only and the web bundle polyfills nothing, so decoding through it threw a
 * ReferenceError on every token in the browser. The throw never surfaced: the caller's `catch`
 * treats it as a malformed token, leaves `best` null, and falls back to the last cookie value —
 * which is exactly the behaviour `pickNewestJwt` exists to replace. `document.cookie` orders by
 * path specificity rather than by age, so that fallback can hand back the stale token, silently,
 * in precisely the duplicate-cookie case this code was written for.
 *
 * Padding is restored explicitly because base64url omits it and `atob` requires it.
 *
 * `Buffer` is preferred where it exists, so server rendering keeps a single decoder rather than
 * silently switching to the browser one on a Node version that happens to expose `atob`. The
 * `atob` branch requires `TextDecoder` as well: guarding on `atob` alone would throw in a runtime
 * that has one and not the other, and that throw lands in the caller's catch and restores the very
 * silent fallback this function was written to remove.
 *
 * An exhausted decoder throws rather than returning something plausible. The caller still treats it
 * as an undecodable token, but it warns rather than failing quietly — see `pickNewestJwt`.
 */
export function decodeBase64UrlSegment(segment: string): string {
  const base64 = segment.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8')
  }

  if (typeof atob === 'function' && typeof TextDecoder === 'function') {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, character => character.codePointAt(0) ?? 0)
    return new TextDecoder().decode(bytes)
  }

  throw new Error(
    'No base64 decoder available: this runtime provides neither Buffer nor atob with TextDecoder',
  )
}

function pickNewestJwt(values: string[]): string {
  let best: { token: string; iat: number } | null = null
  for (const token of values) {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) continue
      const payload = JSON.parse(decodeBase64UrlSegment(parts[1])) as {
        iat?: number
        exp?: number
      }
      let iat: number
      if (typeof payload.iat === 'number') {
        iat = payload.iat
      } else if (typeof payload.exp === 'number') {
        iat = payload.exp
      } else {
        iat = 0
      }
      // Cookie headers order equal-path cookies from oldest to newest. Prefer the later value when
      // rapid re-logins produce tokens with the same whole-second JWT timestamp.
      if (!best || iat >= best.iat) {
        best = { token, iat }
      }
    } catch {
      // ignore malformed
    }
  }

  // The catch above cannot tell a malformed token from a broken environment, and this is the exact
  // shape that hid the Buffer defect: every token failed to decode, `best` stayed null, and the
  // positional fallback below became the normal path while looking like the exceptional one. It is
  // only defensible for a single value; with several, it is a guess ordered by path specificity
  // rather than by age, so say so out loud.
  if (!best && values.length > 1) {
    console.warn(
      `[Apollo] Could not decode any of ${values.length} session cookies; ` +
        'falling back to the last one, which may not be the newest.',
    )
  }
  return best?.token ?? values[values.length - 1]
}

// Helper to parse cookies from a cookie header string
function getCookieFromHeader(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null

  const pairs = cookieHeader.split(';').map(part => part.trim())
  const values: string[] = []
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) continue
    const key = pair.substring(0, eqIdx)
    const val = pair.substring(eqIdx + 1)
    if (key === name) {
      values.push(decodeURIComponent(val))
    }
  }
  if (values.length === 0) return null
  if (values.length === 1) return values[0]

  return pickNewestJwt(values)
}

function resolveAuthToken(request?: Request, options?: ClientOptions): string | null {
  // 1. Check options first
  if (options?.token) {
    return options.token
  }

  // 2. Check the request authorization header
  if (request) {
    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/, '')
      return token
    }

    // 3. Check request cookies
    const cookieHeader = request.headers.get('cookie')
    const cookieToken = getCookieFromHeader(cookieHeader, getSessionCookieName())
    if (cookieToken) {
      return cookieToken
    }
  }

  // 4. Check browser cookies (client-side only)
  if (globalThis.window !== undefined && typeof document !== 'undefined') {
    const browserToken = getCookieFromHeader(document.cookie, getSessionCookieName())
    if (browserToken) {
      return browserToken
    }
  }

  return null
}

function isAuthenticationError(message: string, extensions?: any): boolean {
  return (
    message.includes('Unauthorized') ||
    message.includes('User from token not found') ||
    message.includes('Invalid JWT') ||
    message.includes('Session has been invalidated') ||
    extensions?.code === 'UNAUTHENTICATED'
  )
}

function isForbiddenError(extensions?: { code?: unknown }): boolean {
  return extensions?.code === 'FORBIDDEN'
}

function isQueryOperation(operation: ApolloLink.Operation): boolean {
  const definition = getMainDefinition(operation.query)
  return definition.kind === 'OperationDefinition' && definition.operation === 'query'
}

function handleAuthorizationError(operation: ApolloLink.Operation): void {
  if (globalThis.window === undefined || !isQueryOperation(operation)) return

  globalThis.window.dispatchEvent(
    new CustomEvent(APOLLO_ACCESS_FORBIDDEN_EVENT, {
      detail: { operation: operation.operationName },
    }),
  )
}

function handleAuthenticationError(): void {
  console.log('[Apollo] Authentication error detected, redirecting to logout then login')

  // Redirect through logout to clear server-side session (client-side only)
  if (globalThis.window === undefined) {
    return
  }

  const { pathname, search, hash } = globalThis.window.location
  const currentPath = `${pathname}${search}${hash}`
  const shouldRedirectWithReturnUrl =
    currentPath && currentPath !== '/login' && !currentPath.startsWith('/logout')

  if (shouldRedirectWithReturnUrl) {
    globalThis.window.location.href = `/logout?return_url=${encodeURIComponent(currentPath)}`
  } else {
    globalThis.window.location.href = '/logout'
  }
}

function logDevelopmentExtensions(extensions: any): void {
  if (extensions && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.error(`[GraphQL error]: Extensions:`, extensions)
  }
}

function errorFromUnknown(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)

  try {
    return new Error(JSON.stringify(value))
  } catch {
    return new Error('Unknown Apollo network error')
  }
}

function createErrorLink(): ApolloLink {
  return new ErrorLink(({ error, operation }) => {
    if (CombinedGraphQLErrors.is(error)) {
      for (const { message, path, extensions } of error.errors) {
        console.error(`[GraphQL error]: Message: ${message}, Path: ${path}`)

        if (isAuthenticationError(message, extensions)) {
          handleAuthenticationError()
        } else if (isForbiddenError(extensions)) {
          handleAuthorizationError(operation)
        }

        logDevelopmentExtensions(extensions)
      }
    }

    if (!CombinedGraphQLErrors.is(error)) {
      const networkError = errorFromUnknown(error)
      console.error(`[Apollo Error Link] Network error for operation: ${operation.operationName}`)
      handleNetworkError(networkError, operation)
    }
  })
}

function handleNetworkError(networkError: Error, operation: ApolloLink.Operation): void {
  console.error(`[Network error]: ${networkError}`)

  const statusCode = networkErrorStatus(networkError)
  if (statusCode === 401) {
    handleAuthenticationError()
    return
  }
  if (statusCode === 403) {
    handleAuthorizationError(operation)
    return
  }

  if (isNetworkConnectivityError(networkError) && shouldShowServiceUnavailableMessage()) {
    dispatchServiceUnavailableEvent(networkError, operation)
  }
}

function networkErrorStatus(networkError: Error): number | undefined {
  const enrichedError = networkError as Error & {
    status?: number
    statusCode?: number
    response?: { status?: number }
  }
  return enrichedError.statusCode ?? enrichedError.status ?? enrichedError.response?.status
}

function isNetworkConnectivityError(networkError: Error): boolean {
  const errorMessage = networkError.message || ''
  const errorName = networkError.name || ''
  const constructorName = networkError.constructor?.name || ''
  const enrichedError = networkError as Error & {
    statusCode?: number
    code?: string
  }

  return (
    errorName === 'NetworkError' ||
    errorName === 'TypeError' ||
    constructorName === 'ApolloError' ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('event stream') ||
    errorMessage.includes('Connection refused') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ERR_CONNECTION_REFUSED') ||
    errorMessage.includes('net::ERR_') ||
    errorMessage.includes('Redacted for security concerns') ||
    enrichedError.statusCode === 0 ||
    enrichedError.code === 'NETWORK_ERROR'
  )
}

function shouldShowServiceUnavailableMessage(): boolean {
  return globalThis.window !== undefined && !hasShownServiceUnavailableMessage
}

function dispatchServiceUnavailableEvent(
  networkError: Error,
  operation: ApolloLink.Operation,
): void {
  hasShownServiceUnavailableMessage = true

  const serviceUnavailableEvent = new CustomEvent('apollo-service-unavailable', {
    detail: {
      error: networkError,
      operation: operation.operationName,
      timestamp: new Date().toISOString(),
    },
  })

  globalThis.window.dispatchEvent(serviceUnavailableEvent)

  // Reset the flag after a delay to allow retry
  setTimeout(() => {
    hasShownServiceUnavailableMessage = false
  }, 30000) // 30 seconds
}

function getActiveOrganizationId(): string | null {
  // Only available in browser environment
  if (globalThis.window === undefined || typeof localStorage === 'undefined') {
    return null
  }
  return localStorage.getItem('activeOrganizationId')
}

function createAuthLink(token: string | null): ApolloLink {
  return new SetContextLink(({ headers }) => {
    const newHeaders: Record<string, string> = { ...headers }

    // Add authorization header if token exists
    if (token) {
      newHeaders.authorization = `Bearer ${token}`
    }

    // Add organization context header for multi-tenant isolation
    const activeOrgId = getActiveOrganizationId()
    if (activeOrgId) {
      newHeaders['x-organization-id'] = activeOrgId
    }

    return { headers: newHeaders }
  })
}

function createLogLink(): ApolloLink {
  return new ApolloLink((operation, forward) => {
    console.log(`[Apollo] ${operation.operationName}`, operation.variables)
    const observable = forward(operation)
    return new Observable(observer => {
      const subscription = observable.subscribe({
        next: result => {
          console.log(`[Apollo][Result] ${operation.operationName}`, result)
          observer.next(result)
        },
        error: error => observer.error(error),
        complete: () => observer.complete(),
      })
      return () => subscription.unsubscribe()
    })
  })
}

function createWebSocketLink(wsUri: string, token: string | null): GraphQLWsLink {
  return new GraphQLWsLink(
    createClient({
      url: wsUri,
      connectionParams: () => (token ? { Authorization: `Bearer ${token}` } : {}),
      lazy: true,
    }),
  )
}

function createLinkChain(uri: string, token: string | null, isDev: boolean): ApolloLink {
  const wsUri = uri.replace(/^http/, 'ws')
  const uploadLink = new UploadHttpLink({
    uri,
    credentials: 'include',
    headers: {
      'apollo-require-preflight': 'true', // Prevent CSRF blocking
    },
  })
  const isServer = globalThis.window === undefined

  const splitLink = isServer
    ? uploadLink
    : ApolloLink.split(
        ({ query }) => {
          const def = getMainDefinition(query)
          return def.kind === 'OperationDefinition' && def.operation === 'subscription'
        },
        createWebSocketLink(wsUri, token),
        uploadLink,
      )

  const links = [
    createErrorLink(),
    ...(isDev ? [createLogLink()] : []),
    createAuthLink(token),
    splitLink,
  ]

  return ApolloLink.from(links)
}

export function makeClient(request?: Request, options?: ClientOptions) {
  const uri = options?.apiUrl ?? 'http://localhost:3000/graphql'

  // Log warning if falling back to localhost (only in development)
  if (
    !options?.apiUrl &&
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development'
  ) {
    console.warn('[Apollo makeClient] WARNING: No apiUrl provided, falling back to localhost:3000')
    console.warn(
      '[Apollo makeClient] This likely means VITE_API_URL is not available in the client bundle',
    )
  }

  const token = resolveAuthToken(request, options)
  const isDev = options?.environment === 'development'

  const link = createLinkChain(uri, token, isDev)

  return new ApolloClient({
    link,
    cache: createCache(), // Create a fresh cache for each client to avoid SSR cache pollution
    ssrMode: globalThis.window === undefined,
    assumeImmutableResults: true, // This can help with fragment handling
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network' },
      query: { errorPolicy: 'all' },
      mutate: { errorPolicy: 'all' },
    },
  })
}

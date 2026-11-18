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
      { cause: e },
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
import { print } from 'graphql'
import { createClient } from 'graphql-ws'
import UploadHttpLink from 'apollo-upload-client/UploadHttpLink.mjs'
import { decodeCookieValue, isFetchFailure, pickNewestJwt } from '@nestled-template/shared/utils'
import { createCache } from './cache-config'

export type ClientOptions = {
  token?: string
  webToken?: string
  apiUrl?: string
  platform?: 'web' | 'native'
  environment?: 'development' | 'staging' | 'production'
  /**
   * Told what each failed operation failed with (`classifyApiFailure`), and the error itself. The
   * server render uses it to recover the real cause of a failed preload, which the streamed query
   * ref redacts.
   */
  onApiFailure?: (cause: ApiFailureCause, error: unknown) => void
  /**
   * Called when an operation starts; the function it returns is called once when that operation
   * settles (answered, failed or cancelled). The server render uses it to wait, bounded, for a
   * request's calls still in flight before it decides a sign-out (apollo-loader.ts,
   * `waitForSsrApiCalls`).
   */
  onOperationStart?: () => () => void
}

/**
 * Why an operation against the API failed:
 * - `unauthenticated`: the API rejected the session (HTTP 401, or a GraphQL error whose
 *   `extensions.code` is `UNAUTHENTICATED`; never judged by message text);
 * - `unavailable`: no HTTP response, or a proxy's 502/503/504 (`isRetryableConnectivityError`);
 * - `other`: the API answered with some other error (a 403, a 500, a resolver or validation error).
 */
export type ApiFailureCause = 'unauthenticated' | 'unavailable' | 'other'

export const APOLLO_ACCESS_FORBIDDEN_EVENT = 'apollo-access-forbidden'

/**
 * Dispatched on `window` when a query is refused with `ORGANIZATION_CONTEXT_REQUIRED`: the user is
 * signed in but has no active organization (or a stale one). The web app shows its organization
 * picker; the session is kept.
 */
export const APOLLO_ORGANIZATION_REQUIRED_EVENT = 'apollo-organization-required'

/**
 * Dispatched on `window` when a request fails without reaching the server. It is a report, not a
 * verdict: the web app confirms it with its own reachability probe before showing anything, and
 * clears the screen again by itself once the API answers (apps/web/app/api-availability.ts).
 */
export const APOLLO_SERVICE_UNAVAILABLE_EVENT = 'apollo-service-unavailable'

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
      values.push(decodeCookieValue(val))
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

/**
 * A GraphQL error that rejects the session: its `extensions.code` is `UNAUTHENTICATED`, which the
 * API sets for every 401 (Nest maps an `UnauthorizedException` to it). The message is never read:
 * text such as "Unauthorized" or "Session has been invalidated" is not evidence of a dead session
 * (owner rule, 2026-11-12), and matching it logged users out over errors that only said so.
 */
function isAuthenticationError(extensions?: { code?: unknown }): boolean {
  return extensions?.code === 'UNAUTHENTICATED'
}

/**
 * The API's 403 for a signed-in request with no active organization (or a stale one). The session
 * is fine: a query refused with it dispatches `APOLLO_ORGANIZATION_REQUIRED_EVENT`, and the app
 * shows its organization picker (apps/web/app/organization-required.tsx), never a logout and never
 * the access-denied screen.
 */
export const ORGANIZATION_CONTEXT_REQUIRED_CODE = 'ORGANIZATION_CONTEXT_REQUIRED'

/**
 * Whether an Apollo error is the API's `ORGANIZATION_CONTEXT_REQUIRED` refusal (by code only). The
 * server render records it for a preloaded query, whose error reaches the render redacted.
 */
export function isOrganizationContextRequiredError(error: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(({ extensions }) => extensions?.code === ORGANIZATION_CONTEXT_REQUIRED_CODE)
  )
}

/**
 * A permission refusal, shown as access denied: `FORBIDDEN`, or any other code the API gave a 403
 * (`forbiddenWithCode` keeps the code and the 403 in `originalError.statusCode`), except
 * `ORGANIZATION_CONTEXT_REQUIRED`, which has its own screen. None of them is ever a logout.
 */
function isForbiddenError(extensions?: { code?: unknown; originalError?: unknown }): boolean {
  if (extensions?.code === 'FORBIDDEN') return true
  if (extensions?.code === ORGANIZATION_CONTEXT_REQUIRED_CODE) return false
  const originalError = extensions?.originalError as { statusCode?: unknown } | null | undefined
  return originalError?.statusCode === 403
}

/**
 * Whether `operation` is a query (not a mutation or a subscription). The outage-retry link
 * (`createOutageRetryLink`) and the access-forbidden event depend on it; exported so an app with a
 * link chain of its own can use the same test.
 */
export function isQueryOperation(operation: ApolloLink.Operation): boolean {
  const definition = getMainDefinition(operation.query)
  return definition.kind === 'OperationDefinition' && definition.operation === 'query'
}

function isSubscriptionOperation(operation: ApolloLink.Operation): boolean {
  const definition = getMainDefinition(operation.query)
  return definition.kind === 'OperationDefinition' && definition.operation === 'subscription'
}

function handleOrganizationRequired(operation: ApolloLink.Operation): void {
  if (globalThis.window === undefined || !isQueryOperation(operation)) return

  globalThis.window.dispatchEvent(
    new CustomEvent(APOLLO_ORGANIZATION_REQUIRED_EVENT, {
      detail: { operation: operation.operationName },
    }),
  )
}

function handleAuthorizationError(operation: ApolloLink.Operation): void {
  if (globalThis.window === undefined || !isQueryOperation(operation)) return

  globalThis.window.dispatchEvent(
    new CustomEvent(APOLLO_ACCESS_FORBIDDEN_EVENT, {
      detail: { operation: operation.operationName },
    }),
  )
}

// Browser only. Whoever currently has outage evidence: in the web app, each mounted availability
// check that is confirming a connectivity failure or showing the recovering screen. Never set
// during a server render.
const apiOutageSignals = new Set<object>()

/**
 * Tells the error link that `source` (any object, such as a component's ref) has outage evidence,
 * until `clearApiOutage(source)`. While any source does, a 401 does not log the user out: a 401
 * alongside an outage is not proof the session is bad. The app retries once the API recovers, and
 * a 401 then, with no outage, logs out as usual. Signalling the same source twice is one signal.
 */
export function signalApiOutage(source: object): void {
  apiOutageSignals.add(source)
}

/** Withdraws `source`'s outage evidence (`signalApiOutage`); other sources' evidence stays. */
export function clearApiOutage(source: object): void {
  apiOutageSignals.delete(source)
}

/** Whether any source has signalled an outage (`signalApiOutage`) that is still in effect. */
export function isApiOutageSignalled(): boolean {
  return apiOutageSignals.size > 0
}

// Set when the error link lets a 401 pass because an outage was signalled.
let authFailureDeferred = false

/**
 * Whether the error link has let a 401 pass because an outage was signalled, since the last call;
 * the call clears it. Once the outage clears, the app refetches the queries left holding such a
 * 401, so each gets a fresh answer: data, or a 401 with no outage that logs out as usual.
 */
export function takeDeferredAuthFailure(): boolean {
  const deferred = authFailureDeferred
  authFailureDeferred = false
  return deferred
}

/**
 * Whether the error link has let a 401 pass because an outage was signalled and nothing has taken
 * it yet (`takeDeferredAuthFailure`). Unlike `takeDeferredAuthFailure` it leaves the record in
 * place: the root error boundary reads it to tell a 401 that is still waiting for a fresh answer
 * from one that was judged with no outage.
 */
export function isAuthFailureDeferred(): boolean {
  return authFailureDeferred
}

/**
 * `outage`: the same answer carried outage evidence of its own (a GraphQL 502/503/504 beside the
 * UNAUTHENTICATED error), which nothing has signalled yet; the 401 is let pass as during any outage.
 */
function handleAuthenticationError(outage = false): void {
  if (outage || isApiOutageSignalled()) {
    authFailureDeferred = true
    console.log('[Apollo] Authentication error during an API outage, keeping the session for now')
    return
  }
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

// Browser only. Operations (by name and variables) whose last attempt got no answer, or a
// proxy's 502/503/504 (`isRetryableConnectivityError`); forgotten once one is answered.
const unreachableOperations = new Set<string>()

function operationKey(operation: ApolloLink.Operation): string {
  const name = operation.operationName || print(operation.query)
  return `${name}:${JSON.stringify(operation.variables ?? {})}`
}

const CANCELLED = Symbol('cancelled')
const GATEWAY_UNAVAILABLE_ANSWER = Symbol('gateway-unavailable-answer')

/**
 * Dispatched on `window` when the last outage evidence an in-flight retry held is withdrawn
 * (`createOutageRetryLink`) while the error link has let a 401 pass because of it
 * (`takeDeferredAuthFailure`). Nothing else marks the end of that evidence: the availability
 * check never left `available`, so it calls no recovery callback. The web app listens and
 * refetches the queries holding such a 401, for a fresh answer.
 */
export const APOLLO_DEFERRED_AUTH_FAILURE_EVENT = 'apollo-deferred-auth-failure'

/**
 * Withdraws `source`'s outage evidence, like `clearApiOutage`, and when that was the last evidence
 * held while the error link has let a 401 pass (`isAuthFailureDeferred`), dispatches
 * `APOLLO_DEFERRED_AUTH_FAILURE_EVENT` so the app refetches the queries holding it for a fresh
 * answer. For evidence whose end nothing else announces (an in-flight retry, a loader's outage
 * flag), where `clearApiOutage` alone would leave such a 401 waiting.
 */
export function releaseApiOutage(source: object): void {
  clearApiOutage(source)
  if (isApiOutageSignalled() || !authFailureDeferred || globalThis.window === undefined) return
  globalThis.window.dispatchEvent(new CustomEvent(APOLLO_DEFERRED_AUTH_FAILURE_EVENT))
}

/**
 * Counts a retry of an unreachable call, while it is in flight, as outage evidence
 * (`signalApiOutage`). Without it, a 401 that came back while another call was still being retried
 * after failing to reach the API (a refetch once a blip cleared, or a loader's preload when Me is
 * revalidated) logged the user out before that retry could fail again and record the outage. The
 * evidence lasts until the retry settles: an answer clears it (and the 401s after it are judged
 * as usual), and a second connectivity failure is reported by the error link in the same tick.
 *
 * Sits below the error link, so a retry's own failure clears its evidence before the error link
 * sees it: a retried call that gets a 401 is judged like any other. Queries only by default (see
 * `counts` below); never a subscription, which stays open and would hold the evidence as long as
 * it lives; never during a server render.
 *
 * `makeClient` puts it directly below the error link. Exported for an app that builds its own link
 * chain: place it below that chain's error link, and place a RetryLink of its own between the two
 * (error link, RetryLink, this link), so each attempt the RetryLink makes passes through here and
 * an attempt after an unreachable one counts as outage evidence while it is in flight. A RetryLink
 * that also retries mutations passes `counts` to widen the default (queries only); subscriptions
 * never count. Cancellation is forwarded: unsubscribing withdraws the attempt's evidence and
 * cancels the request below, so a cancelled request leaves no evidence behind.
 */
export function createOutageRetryLink(
  options: { counts?: (operation: ApolloLink.Operation) => boolean } = {},
): ApolloLink {
  const counts = options.counts ?? isQueryOperation
  return new ApolloLink((operation, forward) => {
    if (
      globalThis.window === undefined ||
      isSubscriptionOperation(operation) ||
      !counts(operation)
    ) {
      return forward(operation)
    }
    const key = operationKey(operation)
    return new Observable(observer => {
      const evidence = {}
      const retrying = unreachableOperations.has(key)
      if (retrying) signalApiOutage(evidence)
      let settled = false
      // Once per attempt: the first answer, error or cancellation decides.
      const settle = (error?: unknown) => {
        if (settled) return
        settled = true
        if (error === GATEWAY_UNAVAILABLE_ANSWER || isRetryableConnectivityError(error)) {
          unreachableOperations.add(key)
        } else if (error !== CANCELLED) unreachableOperations.delete(key)
        if (retrying) releaseApiOutage(evidence)
      }
      const subscription = forward(operation).subscribe({
        // An answer (an HTTP 200 carrying an UNAUTHENTICATED error among them) settles the attempt
        // before the error link above judges it, so a clean rejection is not deferred. An answer
        // carrying a 502/503/504 of its own counts as unreachable, like a proxy's.
        next: result => {
          settle(
            hasGatewayUnavailableStatus(result.errors) ? GATEWAY_UNAVAILABLE_ANSWER : undefined,
          )
          observer.next(result)
        },
        error: error => {
          settle(error)
          observer.error(error)
        },
        complete: () => {
          settle()
          observer.complete()
        },
      })
      return () => {
        settle(CANCELLED)
        subscription.unsubscribe()
      }
    })
  })
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

/**
 * Classifies an Apollo link error; see `ApiFailureCause`. A GraphQL answer that carries a 502, 503
 * or 504 (`isGatewayUnavailableGraphQLError`) is `unavailable` even when another error in it is
 * UNAUTHENTICATED: outage evidence outranks a 401.
 */
export function classifyApiFailure(error: unknown): ApiFailureCause {
  if (CombinedGraphQLErrors.is(error)) {
    if (isGatewayUnavailableGraphQLError(error)) return 'unavailable'
    return error.errors.some(({ extensions }) => isAuthenticationError(extensions))
      ? 'unauthenticated'
      : 'other'
  }
  if (error instanceof Error && networkErrorStatus(error) === 401) return 'unauthenticated'
  if (isRetryableConnectivityError(error)) return 'unavailable'
  return 'other'
}

/**
 * The operation context for a request whose caller judges its own authentication and permission
 * errors: pass it as `context` and the error link takes no action for that request (no logout, no
 * deferred 401, no access-forbidden or organization-required event); it still logs. The signed-in
 * layout's Me re-check (apps/web/app/session-recheck.tsx) uses it, since it decides the outcome
 * itself. Apps whose error link only dispatches an event need it most: without it the re-check's
 * own 401 or 403 reached that event's handler (an access-denied screen, say) before the re-check
 * could decide. An app with its own error link checks `operation.getContext().skipAuthErrorReport`.
 */
export const SKIP_AUTH_ERROR_REPORT_CONTEXT = { skipAuthErrorReport: true } as const

function skipsAuthErrorReport(operation: ApolloLink.Operation): boolean {
  return operation.getContext().skipAuthErrorReport === true
}

function reportGraphQLError(
  extensions: { code?: unknown; originalError?: unknown } | undefined,
  operation: ApolloLink.Operation,
  outage: boolean,
): void {
  if (isAuthenticationError(extensions)) {
    handleAuthenticationError(outage)
  } else if (extensions?.code === ORGANIZATION_CONTEXT_REQUIRED_CODE) {
    handleOrganizationRequired(operation)
  } else if (isForbiddenError(extensions)) {
    handleAuthorizationError(operation)
  }
}

/**
 * Tells `onStart` when each operation starts, and calls the function it returns once that operation
 * settles: its first error, its completion, or its cancellation. Placed at the top of the chain, so
 * an operation counts as settled only after the error link below has seen (and reported) its
 * failure. See `ClientOptions.onOperationStart`.
 */
export function createOperationTrackingLink(onStart: () => () => void): ApolloLink {
  return new ApolloLink(
    (operation, forward) =>
      new Observable(observer => {
        const markSettled = onStart()
        let settled = false
        const settle = () => {
          if (settled) return
          settled = true
          markSettled()
        }
        const subscription = forward(operation).subscribe({
          next: result => observer.next(result),
          error: error => {
            settle()
            observer.error(error)
          },
          complete: () => {
            settle()
            observer.complete()
          },
        })
        return () => {
          subscription.unsubscribe()
          settle()
        }
      }),
  )
}

function createErrorLink(
  onApiFailure?: (cause: ApiFailureCause, error: unknown) => void,
): ApolloLink {
  return new ErrorLink(({ error, operation }) => {
    onApiFailure?.(classifyApiFailure(error), error)
    const report = !skipsAuthErrorReport(operation)

    if (CombinedGraphQLErrors.is(error)) {
      // The API answered, but with a 502/503/504 (a failed lookup it could not complete): outage
      // evidence, reported like a proxy's, and it keeps the session over a 401 in the same answer.
      const outage = isGatewayUnavailableGraphQLError(error)
      if (outage) dispatchServiceUnavailableEvent(error, operation)
      for (const { message, path, extensions } of error.errors) {
        console.error(`[GraphQL error]: Message: ${message}, Path: ${path}`)

        if (report) reportGraphQLError(extensions, operation, outage)

        logDevelopmentExtensions(extensions)
      }
    }

    if (!CombinedGraphQLErrors.is(error)) {
      const networkError = errorFromUnknown(error)
      console.error(`[Apollo Error Link] Network error for operation: ${operation.operationName}`)
      handleNetworkError(networkError, operation, report)
    }
  })
}

function handleNetworkError(
  networkError: Error,
  operation: ApolloLink.Operation,
  report: boolean,
): void {
  console.error(`[Network error]: ${networkError}`)

  const statusCode = networkErrorStatus(networkError)
  if (statusCode === 401 || statusCode === 403) {
    // The caller judges these itself when it asked to (SKIP_AUTH_ERROR_REPORT_CONTEXT).
    if (!report) return
    if (statusCode === 401) handleAuthenticationError()
    else handleAuthorizationError(operation)
    return
  }

  if (isRetryableConnectivityError(networkError)) {
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

const GATEWAY_UNAVAILABLE_STATUSES = new Set([502, 503, 504])

type GraphQLErrorExtensions = { status?: unknown; originalError?: unknown }

/**
 * The HTTP status a GraphQL error was thrown with: `extensions.status`, which Nest sets for an
 * internal failure (a `ServiceUnavailableException` arrives as `INTERNAL_SERVER_ERROR` with
 * `status: 503`, in an HTTP 200), else the original exception's `statusCode`.
 */
function graphQLErrorStatus(extensions: GraphQLErrorExtensions | undefined): number | undefined {
  if (typeof extensions?.status === 'number') return extensions.status
  const originalError = extensions?.originalError as { statusCode?: unknown } | null | undefined
  return typeof originalError?.statusCode === 'number' ? originalError.statusCode : undefined
}

function hasGatewayUnavailableStatus(
  errors: readonly { extensions?: GraphQLErrorExtensions }[] | undefined,
): boolean {
  return !!errors?.some(({ extensions }) => {
    const status = graphQLErrorStatus(extensions)
    return status !== undefined && GATEWAY_UNAVAILABLE_STATUSES.has(status)
  })
}

/**
 * A GraphQL answer in which the API says it could not complete the request: an error whose status
 * (`extensions.status`, or the original exception's `statusCode`) is 502, 503 or 504. The API
 * throws a 503 when a lookup it needs fails (the API-token lookup in `JwtStrategy`, say). It is
 * outage evidence exactly as a proxy's 502/503/504 is (`isRetryableConnectivityError`): it is
 * reported, retried once the API answers, and it outranks a 401. A plain `INTERNAL_SERVER_ERROR`
 * (a 500, or no status) is not.
 */
export function isGatewayUnavailableGraphQLError(error: unknown): boolean {
  return CombinedGraphQLErrors.is(error) && hasGatewayUnavailableStatus(error.errors)
}

/**
 * A request that never got an HTTP response, or got a proxy's 502/503/504 while the API restarts:
 * the only failures worth retrying, because the same request may well succeed once the API is
 * reachable again. This used to match any `TypeError`, any `ApolloError`, and any message
 * containing "fetch" or "event stream", so one unrelated failure was enough to report the API as
 * down. An error that carries any other HTTP status is an answered request and does not count
 * (401 and 403 included: retrying them only fails again), and neither does a `TypeError` thrown by
 * application code, nor a GraphQL error, except one that carries a 502/503/504 of its own
 * (`isGatewayUnavailableGraphQLError`): the API answered that it could not complete the request.
 *
 * The error link uses this to decide when to report an outage, and the web app uses it to decide
 * which failed queries to refetch once connectivity returns, so the two cannot drift apart.
 */
export function isRetryableConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (CombinedGraphQLErrors.is(error)) return isGatewayUnavailableGraphQLError(error)

  const status = networkErrorStatus(error)
  if (typeof status === 'number' && status > 0) return GATEWAY_UNAVAILABLE_STATUSES.has(status)

  const errorMessage = error.message || ''
  const enrichedError = error as Error & {
    statusCode?: number
    code?: string
  }

  return (
    isFetchFailure(error) ||
    error.name === 'NetworkError' ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ERR_CONNECTION_REFUSED') ||
    errorMessage.includes('net::ERR_') ||
    enrichedError.statusCode === 0 ||
    enrichedError.code === 'NETWORK_ERROR'
  )
}

function dispatchServiceUnavailableEvent(
  networkError: Error,
  operation: ApolloLink.Operation,
): void {
  if (globalThis.window === undefined) return

  // No once-per-30-seconds latch: the listener ignores reports while it is already checking, and a
  // latch here only meant that an outage starting soon after a recovery went unreported.
  globalThis.window.dispatchEvent(
    new CustomEvent(APOLLO_SERVICE_UNAVAILABLE_EVENT, {
      detail: {
        error: networkError,
        operation: operation.operationName,
        timestamp: new Date().toISOString(),
      },
    }),
  )
}

/** Where the browser keeps its active organization, sent on every request as `x-organization-id`. */
export const ACTIVE_ORGANIZATION_STORAGE_KEY = 'activeOrganizationId'

/**
 * The organization this browser's requests are sent for (`x-organization-id`), or null: none is
 * stored, storage is blocked, or this is a server render (which never sends the header). The API
 * reads the header before the user's own `activeOrganizationId`, so this is the organization the
 * next request is answered for.
 */
export function getStoredActiveOrganizationId(): string | null {
  if (globalThis.window === undefined) return null
  // Inside the try: where storage is blocked, reading `localStorage` itself throws.
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)
  } catch {
    return null
  }
}

// Advanced each time the stored organization is forgotten (a logout); see
// `activeOrganizationSession`.
let activeOrganizationSessionGeneration = 0

/**
 * The browser's current organization session: a number that changes each time the stored
 * organization is forgotten (`storeActiveOrganizationId(null)`, which every logout calls). A switch
 * reads it before its request and again when the answer arrives; if it changed meanwhile, the
 * session the switch was for has ended, and the answer must not be stored, cached or acted on
 * (`useSwitchActiveOrganization` in `@nestled-template/web`). Otherwise a late answer wrote the
 * previous session's organization back after logout, and the next user's requests carried it.
 */
export function activeOrganizationSession(): number {
  return activeOrganizationSessionGeneration
}

/**
 * Stores (or, with null, forgets) the organization the next requests are sent for. Every switch and
 * every shell that learns the active organization writes it here, so the header and the UI cannot
 * disagree. Forgetting it also ends the organization session (`activeOrganizationSession`), so a
 * switch still in flight for it stores nothing. A no-op during a server render or with storage
 * blocked (the session still ends).
 */
export function storeActiveOrganizationId(organizationId: string | null): void {
  if (globalThis.window === undefined) return
  if (!organizationId) activeOrganizationSessionGeneration += 1
  try {
    if (typeof localStorage === 'undefined') return
    if (organizationId) localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, organizationId)
    else localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY)
  } catch {
    // Storage blocked: requests fall back to the user's active organization on the API.
  }
}

/**
 * The organization a signed-in shell shows, from the user's organizations:
 * 1. the server's active organization (`User.activeOrganizationId`, from Me), when the user is
 *    still a member of it;
 * 2. else `chosenOrganizationId`, when still a member: the organization this browser chose, once
 *    a reconciliation after hydration has settled it (`useActiveOrganization` in
 *    `@nestled-template/web`);
 * 3. else the first; null with no organizations.
 *
 * It never reads browser storage by itself: a server render cannot see it, so a stored choice
 * picked here while rendering made the hydrating render differ from the server's HTML (another
 * organization's name and permissions). Pass only what both renders know; a stored choice is
 * applied after hydration (see `isActiveOrganizationAmbiguous`).
 *
 * Whatever it returns must also be what the requests are sent for: a shell stores it
 * (`rememberActiveOrganization`) so the `x-organization-id` header, the server's answer and the UI
 * cannot disagree. Every place that shows or acts on "the active organization" uses this, never
 * `organizations[0]` on its own: that showed the first organization while requests went to the
 * stored one.
 */
export function resolveActiveOrganization<T extends { id: string }>(
  organizations: readonly T[],
  serverActiveOrganizationId: string | null | undefined,
  chosenOrganizationId: string | null = null,
): T | null {
  const member = (id: string | null | undefined) =>
    id ? organizations.find(organization => organization.id === id) : undefined
  return (
    member(serverActiveOrganizationId) ?? member(chosenOrganizationId) ?? organizations[0] ?? null
  )
}

/**
 * Whether the server's own information leaves the active organization open: the user has more
 * than one organization and the server's active one (`User.activeOrganizationId`) is missing or no
 * longer theirs. The server renders the first then, but this browser may have stored another
 * (`getStoredActiveOrganizationId`). A shell renders organization-scoped content only once that is
 * settled after hydration, on both sides the same way, so the server HTML and the first browser
 * render agree and no query is sent for an organization the screen does not show.
 */
export function isActiveOrganizationAmbiguous(
  organizations: readonly { id: string }[],
  serverActiveOrganizationId: string | null | undefined,
): boolean {
  if (organizations.length < 2) return false
  return !organizations.some(organization => organization.id === serverActiveOrganizationId)
}

/**
 * Stores `organizationId` as the organization the next requests are sent for, when it is not stored
 * already. A shell calls it with what it shows (`resolveActiveOrganization`) while rendering, before
 * its children's queries start, so they are sent for the organization on screen. Null stores
 * nothing: a user with no organization keeps whatever the API decides.
 */
export function rememberActiveOrganization(organizationId: string | null | undefined): void {
  if (!organizationId || getStoredActiveOrganizationId() === organizationId) return
  storeActiveOrganizationId(organizationId)
}

function createAuthLink(token: string | null): ApolloLink {
  return new SetContextLink(({ headers }) => {
    const newHeaders: Record<string, string> = { ...headers }

    // Add authorization header if token exists
    if (token) {
      newHeaders.authorization = `Bearer ${token}`
    }

    // Add organization context header for multi-tenant isolation
    const activeOrgId = getStoredActiveOrganizationId()
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

const SUBSCRIPTION_RETRY_BASE_MS = 2000
const SUBSCRIPTION_RETRY_CAP_MS = 30000

/** A number in [0, 1) from the platform CSPRNG (browsers and Node 22), for retry jitter. */
function randomUnit(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

/**
 * How long the subscription socket waits before reconnect attempt `retries`: 2 s doubling to a
 * 30 s cap, plus up to a second of jitter so many tabs do not reconnect in step after a redeploy.
 */
export function subscriptionRetryDelayMs(retries: number, jitter: number = randomUnit()): number {
  const base = Math.min(SUBSCRIPTION_RETRY_BASE_MS * 2 ** retries, SUBSCRIPTION_RETRY_CAP_MS)
  return base + Math.floor(jitter * 1000)
}

// graphql-ws gives up after 5 attempts by default (about half a minute), after which every active
// subscription errors and stays dead until the page reloads: a laptop that slept or an API
// redeploy longer than that left live views frozen. Retry without a limit at a capped interval
// instead. graphql-ws still refuses to retry its fatal close codes (4400 bad request, 4401
// unauthorized, 4500 internal error and the like), and `lazy` closes the socket when nothing is
// subscribed, so this only keeps reconnecting while something is listening.
function createWebSocketLink(wsUri: string, token: string | null): GraphQLWsLink {
  return new GraphQLWsLink(
    createClient({
      url: wsUri,
      connectionParams: () => (token ? { Authorization: `Bearer ${token}` } : {}),
      lazy: true,
      retryAttempts: Number.POSITIVE_INFINITY,
      retryWait: retries =>
        new Promise(resolve => setTimeout(resolve, subscriptionRetryDelayMs(retries))),
    }),
  )
}

function createLinkChain(
  uri: string,
  token: string | null,
  isDev: boolean,
  onApiFailure?: (cause: ApiFailureCause, error: unknown) => void,
  onOperationStart?: () => () => void,
): ApolloLink {
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
    ...(onOperationStart ? [createOperationTrackingLink(onOperationStart)] : []),
    createErrorLink(onApiFailure),
    createOutageRetryLink(),
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

  const link = createLinkChain(uri, token, isDev, options?.onApiFailure, options?.onOperationStart)

  return new ApolloClient({
    link,
    cache: createCache(), // Create a fresh cache for each client to avoid SSR cache pollution
    ssrMode: globalThis.window === undefined,
    assumeImmutableResults: true, // This can help with fragment handling
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network' },
      query: { errorPolicy: 'all' },
      // A refused mutation rejects, so no caller can mistake a refusal for success: under 'all' it
      // resolved with the error beside `data` and any caller that only awaited it moved on. A
      // call site that really uses partial data from a failed mutation sets 'all' itself.
      mutate: { errorPolicy: 'none' },
    },
  })
}

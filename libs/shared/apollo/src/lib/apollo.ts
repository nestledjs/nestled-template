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
import { createClient } from 'graphql-ws'
import UploadHttpLink from 'apollo-upload-client/UploadHttpLink.mjs'
import { decodeCookieValue, isFetchFailure, pickNewestJwt } from '@nestled-template/shared/utils'
import { createCache } from './cache-config'
import { recordApiOutage } from './session/outage-memory'

/**
 * The `errorPolicy` defaults `makeClient` sets, declared to TypeScript. From Apollo Client 4.2 a
 * default `errorPolicy` that is not declared here fails to type-check (TS2322, "A default option
 * for mutate.errorPolicy must be declared in ApolloClient.DeclareDefaultOptions before usage"),
 * because the result types of `client.query`, `client.mutate` and the hooks depend on it. Keep
 * these two in step with `defaultOptions` in `makeClient`: change one, change the other. On Apollo
 * Client 4.1 the interfaces are not read yet and the declaration is harmless.
 * See https://www.apollographql.com/docs/react/data/typescript#declaring-default-options-for-type-safety
 */
// Apollo declares these as namespaces; an augmentation has to use the same shape.
/* eslint-disable @typescript-eslint/no-namespace */
declare module '@apollo/client' {
  export namespace ApolloClient {
    export namespace DeclareDefaultOptions {
      interface Query {
        errorPolicy: 'all'
      }
      interface Mutate {
        errorPolicy: 'none'
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export type ClientOptions = {
  token?: string
  webToken?: string
  apiUrl?: string
  platform?: 'web' | 'native'
  environment?: 'development' | 'staging' | 'production'
  /**
   * Told what each failed operation failed with (`classifyApiFailure`), and the error itself. The
   * server render uses it to recover the real cause of a failed preload, which the streamed query
   * ref redacts. Independently of it, every server-side client records an unreachable API in the
   * process-wide outage memory (session/outage-memory.ts) that the session judge reads.
   */
  onApiFailure?: (cause: ApiFailureCause, error: unknown) => void
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
  return extensions?.code === 'UNAUTHENTICATED' // nestled-session-allow: the classification primitive
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
 * Whether `operation` is a query (not a mutation or a subscription). The access-forbidden and
 * organization-required events depend on it; exported so an app with a link chain of its own can
 * use the same test.
 */
export function isQueryOperation(operation: ApolloLink.Operation): boolean {
  const definition = getMainDefinition(operation.query)
  return definition.kind === 'OperationDefinition' && definition.operation === 'query'
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

/**
 * Dispatched on `window` when an API call made by the browser is refused with a clean 401 (an HTTP
 * 401 or a GraphQL `UNAUTHENTICATED`). It is a suspicion, never a verdict: the browser never signs
 * anyone out by itself. The web app's session revalidator (apps/web/app/session/
 * session-revalidator.tsx) answers it with one debounced revalidation, whose request runs the
 * server's session middleware again; only that middleware may decide the session is rejected.
 */
export const APOLLO_SESSION_SUSPECT_EVENT = 'apollo-session-suspect'

function handleAuthenticationError(operation: ApolloLink.Operation): void {
  if (globalThis.window === undefined) return
  globalThis.window.dispatchEvent(
    new CustomEvent(APOLLO_SESSION_SUSPECT_EVENT, {
      detail: { operation: operation.operationName },
    }),
  )
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
 * errors: pass it as `context` and the error link takes no action for that request (no session
 * suspect event, no access-forbidden or organization-required event); it still logs. The session
 * middleware's Me calls (apps/web/app/session/session-middleware.server.ts) use it, since the judge
 * decides the outcome itself. An app with its own error link checks
 * `operation.getContext().skipAuthErrorReport`.
 */
export const SKIP_AUTH_ERROR_REPORT_CONTEXT = { skipAuthErrorReport: true } as const

function skipsAuthErrorReport(operation: ApolloLink.Operation): boolean {
  return operation.getContext().skipAuthErrorReport === true
}

function reportGraphQLError(
  extensions: { code?: unknown; originalError?: unknown } | undefined,
  operation: ApolloLink.Operation,
): void {
  if (isAuthenticationError(extensions)) {
    handleAuthenticationError(operation)
  } else if (extensions?.code === ORGANIZATION_CONTEXT_REQUIRED_CODE) {
    handleOrganizationRequired(operation)
  } else if (isForbiddenError(extensions)) {
    handleAuthorizationError(operation)
  }
}

function createErrorLink(
  onApiFailure?: (cause: ApiFailureCause, error: unknown) => void,
): ApolloLink {
  return new ErrorLink(({ error, operation }) => {
    const cause = classifyApiFailure(error)
    onApiFailure?.(cause, error)
    // Server only: remember that this instance found the API unreachable, whichever request it
    // served, so the session judge does not trust a 401 that arrives just after (OUTAGE_MEMORY_MS).
    if (cause === 'unavailable' && globalThis.window === undefined) recordApiOutage()
    const report = !skipsAuthErrorReport(operation)

    if (CombinedGraphQLErrors.is(error)) {
      // The API answered, but with a 502/503/504 (a failed lookup it could not complete): outage
      // evidence, reported like a proxy's. A 401 in the same answer is then not a session suspect.
      const outage = isGatewayUnavailableGraphQLError(error)
      if (outage) dispatchServiceUnavailableEvent(error, operation)
      for (const { message, path, extensions } of error.errors) {
        console.error(`[GraphQL error]: Message: ${message}, Path: ${path}`)

        if (report && !outage) reportGraphQLError(extensions, operation)

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
  // nestled-session-allow: reports a suspect to the revalidator; never navigates
  if (statusCode === 401 || statusCode === 403) {
    // The caller judges these itself when it asked to (SKIP_AUTH_ERROR_REPORT_CONTEXT).
    if (!report) return
    // nestled-session-allow: reports a suspect to the revalidator; never navigates
    if (statusCode === 401) handleAuthenticationError(operation)
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
  // This document is leaving for another user's session: it sends no organization, whatever
  // another tab may have stored meanwhile (`clearActiveOrganizationForSessionChange`).
  if (activeOrganizationSessionChanging) return null
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

// Set by `clearActiveOrganizationForSessionChange`; nothing in this document clears it again.
let activeOrganizationSessionChanging = false

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
  // Leaving for another user's session: an organization stored now is the previous user's.
  if (organizationId && activeOrganizationSessionChanging) return
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
 * Forgets the stored organization because this document is about to load another user's session,
 * and stores none for the rest of this document. For starting or ending an emulation, which then
 * sets `location.href`: the next document is the other user's.
 *
 * `storeActiveOrganizationId(null)` alone is not enough there. The signed-in shell is still mounted
 * while the navigation is pending, and it stores the organization it shows on every render
 * (`rememberActiveOrganization`): any re-render in that window (the mutation's answer reaching the
 * cache, a query settling) wrote the previous user's organization back, so the next session's
 * first requests carried it and its shell could restore it as the user's choice. From here on,
 * every non-null `storeActiveOrganizationId` is ignored and `getStoredActiveOrganizationId`
 * answers null, so this document sends no organization either; the next document starts clean.
 *
 * Only before a document navigation. A sign-in that stays in this document (the login form, an
 * invitation) uses `storeActiveOrganizationId(null)`, so the new session's shell can store its own
 * organization. It never signs anyone out and does not touch the session cookie.
 */
export function clearActiveOrganizationForSessionChange(): void {
  if (globalThis.window === undefined) return
  activeOrganizationSessionChanging = true
  storeActiveOrganizationId(null)
}

/**
 * Test-only: undoes `clearActiveOrganizationForSessionChange` for the next test in the same module
 * instance. A browser never needs it: the document it latched is gone.
 */
export function __resetActiveOrganizationSessionChange(): void {
  activeOrganizationSessionChanging = false
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
    createErrorLink(onApiFailure),
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

  const link = createLinkChain(uri, token, isDev, options?.onApiFailure)

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

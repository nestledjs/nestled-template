import { data, isRouteErrorResponse } from 'react-router'
import {
  classifyApiFailure,
  isOrganizationContextRequiredError,
  ORGANIZATION_CONTEXT_REQUIRED_CODE,
} from '../apollo'

/** The codes `narrowApiError` gives the route errors it makes, read by the root ErrorBoundary. */
export const API_UNAVAILABLE_CODE = 'API_UNAVAILABLE'
export const API_UNAUTHENTICATED_CODE = 'API_UNAUTHENTICATED'

/**
 * Turns an API failure a loader or action threw into a route error response that keeps its status
 * and code, before React Router sanitizes it. In production React Router replaces any thrown Error
 * with a bare "Unexpected Server Error" 500 on the way to the browser (a `.data` request included),
 * so a raw Apollo error lost whether it was an outage or a refusal. A thrown `data(...)` keeps both.
 *
 * - connectivity (no answer, 502/503/504, a GraphQL 503): a 503 `API_UNAVAILABLE`, shown as the
 *   self-recovering screen;
 * - `UNAUTHENTICATED` or HTTP 401: a 401 `API_UNAUTHENTICATED`. It means "this call was refused
 *   after the session middleware judged the request signed in". It is NOT a sign-out: the root
 *   ErrorBoundary asks the server to judge the session again (one revalidation), and only the
 *   session middleware may sign anyone out;
 * - `ORGANIZATION_CONTEXT_REQUIRED`, when neither of the above is present: the 403 carrying that
 *   code, shown as the organization picker;
 * - anything else (a Response, a route error response, a bug) passes through unchanged.
 *
 * `apolloLoader` applies it to whatever its loader throws. A loader that calls the API without
 * `apolloLoader` wraps its call: `try { ... } catch (error) { throw narrowApiError(error) }`.
 */
export function narrowApiError(error: unknown): unknown {
  if (error instanceof Response || isRouteErrorResponse(error)) return error
  // Outage first, then authentication, then the organization picker: a combined GraphQL response
  // can carry ORGANIZATION_CONTEXT_REQUIRED beside a 503 or UNAUTHENTICATED, and the picker would
  // hide the outage screen or the session re-check.
  const cause = classifyApiFailure(error)
  if (cause === 'unavailable') {
    return data({ code: API_UNAVAILABLE_CODE }, { status: 503, statusText: 'Service Unavailable' })
  }
  if (cause === 'unauthenticated') {
    return data({ code: API_UNAUTHENTICATED_CODE }, { status: 401, statusText: 'Unauthorized' })
  }
  if (isOrganizationContextRequiredError(error)) {
    return data(
      { code: ORGANIZATION_CONTEXT_REQUIRED_CODE },
      { status: 403, statusText: 'Forbidden' },
    )
  }
  return error
}

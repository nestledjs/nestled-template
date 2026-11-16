import { useContext } from 'react'
import { UNSAFE_DataRouterStateContext } from 'react-router'

/**
 * Whether a loader's data says it found the API unreachable: the root loader returns
 * `{ serviceUnavailable: true }` when it could not even start the Me preload (root.tsx). That flag
 * is outage evidence like any other, and it outranks a 401: a later 401 in a child loader, in the
 * signed-in layout's re-check of Me, or in the root error boundary must not sign the user out while
 * it stands. It can only keep a session, never end one.
 */
export function loaderReportsOutage(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { serviceUnavailable?: unknown }).serviceUnavailable === true
  )
}

/**
 * Whether the root route's loader data, in the browser, carries the outage flag
 * (`loaderReportsOutage`). Read from the data router's state, so it also works in the root error
 * boundary and returns false outside a data router instead of throwing.
 */
export function useRootLoaderOutage(): boolean {
  const state = useContext(UNSAFE_DataRouterStateContext)
  return loaderReportsOutage(state?.loaderData?.root)
}

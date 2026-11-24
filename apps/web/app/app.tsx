import { Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router'
import { GlobalContextProvider } from '@nestled-template/web'
import { useApolloClient, useQuery } from '@apollo/client/react'
import { Me, type MeQuery } from '@nestled-template/shared/sdk'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isViteCacheError, isNetworkError } from '@nestled-template/shared/utils'
import { ViteCacheError } from '@nestledjs/shared-components'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_ORGANIZATION_REQUIRED_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import { AccessDenied } from './access-denied'
import { OrganizationRequired } from './organization-required'
import { retryDelayMs, useApiAvailability, useRefetchFailedQueries } from './api-availability'
import { ApiUnavailableScreen } from './api-unavailable'
import { SessionRevalidator, type AppSessionVerdict, type SessionUser } from './session'

/**
 * The signed-in user to render, from the session verdict the server judged for this request.
 *
 * The verdict's user is written into the Apollo cache as the Me query's answer, so components that
 * read Me through Apollo get it with no second request, and the user shown follows later cache
 * writes (a profile edit). Until the cache has it (the server render, and the first browser render,
 * before the layout effect), the verdict's user is used, so both renders agree.
 */
function useSessionUser(session: AppSessionVerdict): SessionUser | null {
  const verdictUser = session.kind === 'signed-in' ? session.user : null
  const client = useApolloClient()
  useLayoutEffect(() => {
    if (verdictUser) client.writeQuery<MeQuery>({ query: Me, data: { me: verdictUser } })
  }, [client, verdictUser])
  const cached = useQuery(Me, { fetchPolicy: 'cache-only', skip: !verdictUser })
  const cachedUser = cached.data?.me
  if (!verdictUser) return null
  return cachedUser?.id === verdictUser.id ? cachedUser : verdictUser
}

/**
 * A public page renders while the verdict is `unknown` (the API did not answer, or answered with an
 * error), with the session kept and a neutral header (owner decision D2). This asks the server to
 * judge again, quietly, with backoff (2 s doubling to 30 s), until the verdict is known. A private
 * page never gets here: `requireSession` shows its recovering screen instead.
 */
function useQuietSessionRecovery(session: AppSessionVerdict): void {
  const revalidator = useRevalidator()
  const revalidateRef = useRef(revalidator.revalidate)
  useLayoutEffect(() => {
    revalidateRef.current = revalidator.revalidate
  })
  const attemptRef = useRef(0)
  const unknown = session.kind === 'unknown'
  useEffect(() => {
    if (!unknown) {
      attemptRef.current = 0
      return
    }
    const timer = setTimeout(() => {
      attemptRef.current += 1
      void revalidateRef.current()
    }, retryDelayMs(attemptRef.current))
    return () => clearTimeout(timer)
  }, [unknown, session])
}

export function App() {
  const location = useLocation()
  const { session } = useLoaderData() as { session: AppSessionVerdict }
  const user = useSessionUser(session)
  const [viteCacheError, setViteCacheError] = useState(false)
  const [accessForbidden, setAccessForbidden] = useState(false)
  // A query refused with ORGANIZATION_CONTEXT_REQUIRED: signed in, no active organization. Cleared
  // on navigation like `accessForbidden`; choosing an organization reloads the page.
  const [organizationRequired, setOrganizationRequired] = useState(false)
  // Keyed on the whole navigation, not the pathname. A route that changes only its query string
  // -- switching the active organization, say -- is a new request that may well be permitted, and
  // keying on pathname alone leaves the access-denied screen up over it with no way to clear it.
  // location.key changes on every navigation, including same-path ones. Cleared while rendering
  // the new location (React's "adjust state when a prop changes"), so it is never shown over it.
  const [accessForbiddenKey, setAccessForbiddenKey] = useState(location.key)
  if (accessForbiddenKey !== location.key) {
    setAccessForbiddenKey(location.key)
    setAccessForbidden(false)
    setOrganizationRequired(false)
  }

  useQuietSessionRecovery(session)

  // The server rejected the session on a public page and expired its cookies in place. The
  // organization stored for `x-organization-id` belonged to that session: forget it, as the login
  // form does on `expired=1`.
  const rejected = session.kind === 'signed-out' && session.reason === 'rejected'
  useEffect(() => {
    if (rejected) storeActiveOrganizationId(null)
  }, [rejected])

  // Queries that failed during an outage, or during a blip too short to show the screen, refetch
  // once the API answers, the browser comes back online or the tab is shown again.
  const refetchFailedQueries = useRefetchFailedQueries()
  const api = useApiAvailability({
    onRecover: () => refetchFailedQueries(),
    onBlipCleared: () => refetchFailedQueries(),
  })
  const { reportConnectivityError } = api

  useEffect(() => {
    const handleServiceUnavailable = () => reportConnectivityError()
    const handleAccessForbidden = () => setAccessForbidden(true)
    const handleOrganizationRequired = () => setOrganizationRequired(true)

    const handleGlobalError = (event: ErrorEvent) => {
      const error = event.error
      if (!error) return
      if (isViteCacheError(error)) {
        setViteCacheError(true)
        return
      }
      if (isNetworkError(error)) reportConnectivityError()
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      if (!reason) return
      if (isViteCacheError(reason)) {
        setViteCacheError(true)
        event.preventDefault()
        return
      }
      if (isNetworkError(reason)) {
        reportConnectivityError()
        event.preventDefault()
      }
    }

    globalThis.addEventListener(APOLLO_SERVICE_UNAVAILABLE_EVENT, handleServiceUnavailable)
    globalThis.addEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, handleAccessForbidden)
    globalThis.addEventListener(APOLLO_ORGANIZATION_REQUIRED_EVENT, handleOrganizationRequired)
    globalThis.addEventListener('error', handleGlobalError)
    globalThis.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      globalThis.removeEventListener(APOLLO_SERVICE_UNAVAILABLE_EVENT, handleServiceUnavailable)
      globalThis.removeEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, handleAccessForbidden)
      globalThis.removeEventListener(APOLLO_ORGANIZATION_REQUIRED_EVENT, handleOrganizationRequired)
      globalThis.removeEventListener('error', handleGlobalError)
      globalThis.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [reportConnectivityError])

  let content
  if (viteCacheError) {
    content = <ViteCacheError autoRefresh={true} autoRefreshDelay={3000} />
  } else if (api.unavailable) {
    // Shown only for a confirmed outage, and cleared by itself when the API answers again.
    content = <ApiUnavailableScreen reason={api.reason} onRetry={api.retryNow} />
  } else if (organizationRequired) {
    content = <OrganizationRequired />
  } else if (accessForbidden) {
    content = <AccessDenied />
  } else {
    content = <Outlet />
  }

  return (
    <GlobalContextProvider key={user?.id ?? 'nouser'} user={user}>
      <SessionRevalidator />
      {content}
    </GlobalContextProvider>
  )
}

export default App

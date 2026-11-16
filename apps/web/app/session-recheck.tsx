import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApolloClient } from '@apollo/client/react'
import { Me, type MeQuery } from '@nestled-template/shared/sdk'
import {
  classifyApiFailure,
  isApiOutageSignalled,
  SKIP_AUTH_ERROR_REPORT_CONTEXT,
} from '@nestled-template/shared/apollo'
import { retryDelayMs } from './api-availability'
import { isOrganizationContextRequired } from './organization-required'

export type SessionUser = NonNullable<MeQuery['me']>

/**
 * Where a signed-in layout's check of the session stands, when it has no user to render:
 * - `checking`: Me has been asked again and has not answered yet;
 * - `signed-in`: Me answered with the user, so the session is fine (the null user came from
 *   something else: a Me preload that failed for a reason that says nothing about the session, or
 *   a root loader that did not preload Me on a public route);
 * - `rejected`: the API rejected the session (an HTTP 401 or UNAUTHENTICATED) with no outage
 *   evidence: the only outcome that may log the user out;
 * - `organization-required`: the API answered a 403 ORGANIZATION_CONTEXT_REQUIRED: the session is
 *   fine but has no active organization, so the layout shows the organization picker (no logout,
 *   and no retry: asking again gets the same answer until an organization is chosen);
 * - `retrying`: anything else (no answer, a 502/503/504, a 500, a 401 during an outage, an answer
 *   with no user); the session is kept and Me is asked again with backoff, or now via `retryNow`.
 */
export type SessionRecheck =
  | { status: 'checking' }
  | { status: 'signed-in'; user: SessionUser }
  | { status: 'rejected' }
  | { status: 'organization-required' }
  | { status: 'retrying'; retryNow: () => void }

type RecheckState = Exclude<SessionRecheck, { status: 'retrying' }> | { status: 'retrying' }

/**
 * How one answer to the Me re-check is judged (see `SessionRecheck`). `loaderOutage` is the root
 * loader's own outage flag (`useRootLoaderOutage`), outage evidence like a signalled outage: a 401
 * while either stands is retried, not a rejection.
 */
export function sessionRecheckOutcome(
  answer: {
    user?: SessionUser | null
    error?: unknown
  },
  loaderOutage = false,
): 'signed-in' | 'rejected' | 'organization-required' | 'retry' {
  if (answer.error === undefined) return answer.user ? 'signed-in' : 'retry'
  if (isOrganizationContextRequired(answer.error)) return 'organization-required'
  if (
    classifyApiFailure(answer.error) === 'unauthenticated' &&
    !loaderOutage &&
    !isApiOutageSignalled()
  ) {
    return 'rejected'
  }
  return 'retry'
}

/**
 * Asks the API for Me again while `needed` (a signed-in layout rendering with no user), instead of
 * treating the missing user as a dead session. A null user in a signed-in layout used to go
 * straight to /force-logout, which cleared a session that might be fine: a Me preload on a public
 * route that failed for some other reason kept the cookie but left the user null for every later
 * client-side navigation into the signed-in area, since the root loader does not run again on
 * those. Log out only on a real 401 (`rejected`).
 *
 * The request skips the cache (`no-cache`), so it is always a fresh answer. It goes through the
 * app's Apollo client but tells its error link to take no action on the answer
 * (`SKIP_AUTH_ERROR_REPORT_CONTEXT`): this hook decides the outcome itself, and an error link that
 * reacts to a 401 or 403 (a logout, or an event that puts up access denied) would otherwise act
 * first, on an answer this hook may judge differently (a 401 during an outage is retried here).
 *
 * `loaderOutage` (the root loader's outage flag) is read when each answer arrives, so a 401 while
 * it stands is retried.
 *
 * The user it returns is a snapshot (`no-cache`): the layout that asked brings the live, cached Me
 * back once this recovers (see the signed-in layout), so later edits to the user show.
 */
export function useSessionRecheck(needed: boolean, loaderOutage = false): SessionRecheck {
  const client = useApolloClient()
  const loaderOutageRef = useRef(loaderOutage)
  useLayoutEffect(() => {
    loaderOutageRef.current = loaderOutage
  }, [loaderOutage])
  const [state, setState] = useState<RecheckState>({ status: 'checking' })
  const attemptRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Bumped by every check and by the cleanup, so a late answer to an earlier one is ignored.
  const runRef = useRef(0)
  // The queued retry calls the check through this, which always holds the current one.
  const checkRef = useRef<() => void>(() => undefined)

  const check = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = undefined
    runRef.current += 1
    const run = runRef.current
    const settle = (answer: { user?: SessionUser | null; error?: unknown }) => {
      // A newer check, or the layout no longer needing one, supersedes this answer.
      if (run !== runRef.current) return
      const outcome = sessionRecheckOutcome(answer, loaderOutageRef.current)
      if (outcome === 'signed-in' && answer.user) {
        attemptRef.current = 0
        setState({ status: 'signed-in', user: answer.user })
      } else if (outcome === 'rejected') {
        setState({ status: 'rejected' })
      } else if (outcome === 'organization-required') {
        setState({ status: 'organization-required' })
      } else {
        setState({ status: 'retrying' })
        timerRef.current = setTimeout(() => checkRef.current(), retryDelayMs(attemptRef.current))
        attemptRef.current += 1
      }
    }
    client
      .query<MeQuery>({
        query: Me,
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
        context: SKIP_AUTH_ERROR_REPORT_CONTEXT,
      })
      .then(
        result => settle({ user: result.data?.me ?? null }),
        error => settle({ error }),
      )
  }, [client])

  useLayoutEffect(() => {
    checkRef.current = check
  }, [check])

  useEffect(() => {
    if (!needed) return
    check()
    return () => {
      runRef.current += 1
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [needed, check])

  const retryNow = useCallback(() => {
    attemptRef.current = 0
    check()
  }, [check])

  if (state.status === 'retrying') return { status: 'retrying', retryNow }
  return state
}

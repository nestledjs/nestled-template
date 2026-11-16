import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  activeOrganizationSession,
  getStoredActiveOrganizationId,
  isActiveOrganizationAmbiguous,
  rememberActiveOrganization,
  resolveActiveOrganization,
} from '@nestled-template/shared/apollo'
import {
  isOrganizationSwitchSuperseded,
  useSwitchActiveOrganization,
  type ActiveOrganizationSwitch,
} from './switch-active-organization'

export interface ActiveOrganizationOptions {
  /** False while there is no signed-in user: nothing is resolved, stored or switched. */
  enabled?: boolean
  /**
   * Runs after the stored organization was made active on the API, before organization-scoped
   * content renders: the signed-in layout revalidates its loaders, a provider refetches its
   * queries. Content stays gated until it settles.
   */
  afterSwitch?: () => unknown
  /**
   * Called once a stored organization was restored for the session still current, with the id now
   * active and the `sessionKey` it was restored for, as content is let through. A caller whose
   * user lives in its own state (`AuthProvider`, a re-checked snapshot of Me) sets that user's
   * `activeOrganizationId` to it there, for that user only, so `user.activeOrganizationId` and
   * `activeOrganization.id` agree: a cache write and a refetch cannot reach such a user. Never
   * called for a refused, failed or superseded restore.
   */
  onRestored?: (organizationId: string, sessionKey: string) => void
  /**
   * Makes the stored organization active and resolves with the id now active; it must reject on a
   * refusal. Defaults to the shared switch (`useSwitchActiveOrganization`). An app whose API has no
   * switch mutation passes one that only stores the id, without reloading. It is handed
   * `{ isCurrent }`: a switch that awaits anything checks it before storing, and stores nothing
   * once it is false (the shared switch does).
   */
  switchOrganization?: ActiveOrganizationSwitch
  /**
   * Who is signed in (the user's id). A change, or `enabled` turning false, starts over: a choice
   * restored for one session is never carried into the next, and a restore still in flight for it
   * is dropped.
   */
  sessionKey?: string | null
}

export interface ActiveOrganizationState<T> {
  /** The organization to show, and the one every request is sent for (`x-organization-id`). */
  activeOrganization: T | null
  /**
   * Organization-scoped content (the page, subscription queries) must not render yet. True on the
   * first render, on the server and in the browser alike, whenever the server's information leaves
   * the organization open (`isActiveOrganizationAmbiguous`), and while a stored choice is being
   * restored after hydration.
   */
  reconciling: boolean
}

/**
 * The active organization of a signed-in shell, the same in the server render and the hydrating
 * browser render.
 *
 * The first render uses only what the server knows: the user's `activeOrganizationId` from Me,
 * else the first organization (`resolveActiveOrganization`). Reading the browser's stored
 * organization while rendering made the hydrating render show another organization's name and
 * permissions than the server HTML. When the server's information leaves the choice open, the
 * stored one is restored after hydration instead: through the shared switch
 * (`useSwitchActiveOrganization`), so the server's active organization, the cache and the
 * `x-organization-id` header agree, then `afterSwitch`. Until that settles `reconciling` is true
 * and the caller holds back organization-scoped content. If the switch fails, the server's choice
 * stands and is stored, so the screen and the requests still agree.
 *
 * Whatever it shows is stored for the header while rendering (`rememberActiveOrganization`),
 * before children's queries start, except while reconciling, when the stored choice is still to
 * be read.
 */
export function useActiveOrganization<T extends { id: string }>(
  organizations: readonly T[],
  serverActiveOrganizationId: string | null | undefined,
  options: ActiveOrganizationOptions = {},
): ActiveOrganizationState<T> {
  const enabled = options.enabled ?? true
  const sharedSwitch = useSwitchActiveOrganization()
  const switchActiveOrganization = options.switchOrganization ?? sharedSwitch
  const sessionKey = enabled ? (options.sessionKey ?? '') : null
  // undefined: not settled yet; null: settled, the server's choice stands; an id: the restored one.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined)
  const [switching, setSwitching] = useState(false)
  // A new session (sign-out, or another user) starts over, while rendering rather than after.
  const [settledFor, setSettledFor] = useState(sessionKey)
  if (settledFor !== sessionKey) {
    setSettledFor(sessionKey)
    setChosen(undefined)
    setSwitching(false)
  }
  const ambiguous =
    enabled && isActiveOrganizationAmbiguous(organizations, serverActiveOrganizationId)
  const reconciling = (ambiguous && chosen === undefined) || switching

  const activeOrganization = enabled
    ? resolveActiveOrganization(organizations, serverActiveOrganizationId, chosen ?? null)
    : null
  if (enabled && !reconciling) rememberActiveOrganization(activeOrganization?.id)

  const afterSwitchRef = useRef(options.afterSwitch)
  const onRestoredRef = useRef(options.onRestored)
  useLayoutEffect(() => {
    afterSwitchRef.current = options.afterSwitch
    onRestoredRef.current = options.onRestored
  })
  // The session a restore was started for, and the session now; a restore whose session is gone by
  // the time it finishes is dropped.
  const startedForRef = useRef<string | null | undefined>(undefined)
  const sessionKeyRef = useRef(sessionKey)
  useLayoutEffect(() => {
    sessionKeyRef.current = sessionKey
    startedForRef.current = undefined
  }, [sessionKey])
  // A restore still in flight when the shell unmounts is dropped too.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const pending = ambiguous && chosen === undefined && settledFor === sessionKey

  useEffect(() => {
    if (!pending || startedForRef.current === sessionKey) return
    startedForRef.current = sessionKey
    const first = organizations[0]?.id
    const stored = getStoredActiveOrganizationId()
    const restore =
      stored && stored !== first && organizations.some(organization => organization.id === stored)
        ? stored
        : null
    if (!restore) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- settles browser-only state after hydration
      setChosen(null)
      return
    }
    setSwitching(true)
    // The session this restore is for: the same user, the same organization session (no logout
    // since, `activeOrganizationSession`), and the shell still mounted. Once it has ended, the
    // switch's answer is neither stored nor cached (the switch checks `isCurrent`), and nothing
    // here refreshes or settles for it.
    const session = activeOrganizationSession()
    const stillCurrent = () =>
      mountedRef.current &&
      sessionKeyRef.current === sessionKey &&
      activeOrganizationSession() === session
    void (async () => {
      let restored: string | null = null
      try {
        restored = await switchActiveOrganization(restore, { isCurrent: stillCurrent })
      } catch (error) {
        if (isOrganizationSwitchSuperseded(error)) return
        console.error(
          '[ActiveOrganization] Could not restore the stored organization; keeping the server’s',
          error,
        )
      }
      if (!stillCurrent()) return
      if (restored) {
        try {
          await afterSwitchRef.current?.()
        } catch (error) {
          console.error('[ActiveOrganization] Refreshing after the switch failed', error)
        }
      }
      if (!stillCurrent()) return
      if (restored && sessionKey !== null) onRestoredRef.current?.(restored, sessionKey)
      setChosen(restored)
      setSwitching(false)
    })()
  }, [pending, organizations, sessionKey, switchActiveOrganization])

  return { activeOrganization, reconciling }
}

/** An organization restored for a user (`onRestored`), kept by a caller whose user is a snapshot. */
export interface RestoredOrganization {
  userId: string
  organizationId: string
}

/**
 * `user` with `restored` applied as its `activeOrganizationId`, for a user `useActiveOrganization`
 * cannot update itself (a no-cache snapshot of Me), so `user.activeOrganizationId` and the shown
 * organization agree after a restore. Applied only for the user it was restored for, while that
 * user's own active organization is missing or not one of `organizations` (one the server knows
 * wins), and while the restored one still is (a later list without it falls back as
 * `resolveActiveOrganization` does, and so does the user). Otherwise `user` unchanged.
 */
export function withRestoredOrganization<
  U extends { id: string; activeOrganizationId?: string | null },
>(
  user: U | null,
  organizations: readonly { id: string }[],
  restored: RestoredOrganization | null,
): U | null {
  if (!user || restored?.userId !== user.id) return user
  const isMember = (id: string | null | undefined) =>
    organizations.some(organization => organization.id === id)
  if (isMember(user.activeOrganizationId) || !isMember(restored.organizationId)) return user
  return { ...user, activeOrganizationId: restored.organizationId }
}

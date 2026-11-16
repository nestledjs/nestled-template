import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  getStoredActiveOrganizationId,
  isActiveOrganizationAmbiguous,
  rememberActiveOrganization,
  resolveActiveOrganization,
} from '@nestled-template/shared/apollo'
import { useSwitchActiveOrganization } from './switch-active-organization'

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
   * Makes the stored organization active and resolves with the id now active; it must reject on a
   * refusal. Defaults to the shared switch (`useSwitchActiveOrganization`). An app whose API has no
   * switch mutation passes one that only stores the id, without reloading.
   */
  switchOrganization?: (organizationId: string) => Promise<string>
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
  useLayoutEffect(() => {
    afterSwitchRef.current = options.afterSwitch
  })
  // The session a restore was started for, and the session now; a restore whose session is gone by
  // the time it finishes is dropped.
  const startedForRef = useRef<string | null | undefined>(undefined)
  const sessionKeyRef = useRef(sessionKey)
  useLayoutEffect(() => {
    sessionKeyRef.current = sessionKey
    startedForRef.current = undefined
  }, [sessionKey])
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
    void (async () => {
      const stillCurrent = () => sessionKeyRef.current === sessionKey
      let restored: string | null = null
      try {
        restored = await switchActiveOrganization(restore)
      } catch (error) {
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
      setChosen(restored)
      setSwitching(false)
    })()
  }, [pending, organizations, sessionKey, switchActiveOrganization])

  return { activeOrganization, reconciling }
}

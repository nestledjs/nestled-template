import { useCallback, useEffect, useRef } from 'react'
import { useApolloClient, useMutation } from '@apollo/client/react'
import {
  activeOrganizationSession,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import {
  SwitchActiveOrganization,
  type SwitchActiveOrganizationMutation,
  type SwitchActiveOrganizationMutationVariables,
} from '@nestled-template/shared/sdk'

export interface SwitchActiveOrganizationOptions {
  /**
   * Whether the caller's session is still the one the switch was started for (the same signed-in
   * user, say). Checked when the API answers; false drops the answer like a logout does.
   */
  isCurrent?: () => boolean
}

/** Makes an organization active; see `useSwitchActiveOrganization`. */
export type ActiveOrganizationSwitch = (
  organizationId: string,
  options?: SwitchActiveOrganizationOptions,
) => Promise<string>

/**
 * Thrown by the shared switch when its answer arrives for a session that has ended: a logout
 * (`storeActiveOrganizationId(null)`), a change of user (`isCurrent`), or the component that
 * started it unmounted. Nothing was stored or cached. Not a failure to show: the caller drops it
 * (`isOrganizationSwitchSuperseded`) and does not reload or refresh.
 */
export class OrganizationSwitchSupersededError extends Error {
  constructor() {
    super('The organization switch finished after its session ended; it was dropped')
    this.name = 'OrganizationSwitchSupersededError'
  }
}

export function isOrganizationSwitchSuperseded(
  error: unknown,
): error is OrganizationSwitchSupersededError {
  return error instanceof OrganizationSwitchSupersededError
}

/**
 * The one way to switch the active organization: the organization picker, a header switcher and
 * `AuthProvider` all call the function this returns. It makes `organizationId` the user's active
 * organization on the API (`switchActiveOrganization`, which also updates the API's auth cache),
 * then writes the answer to the Apollo cache and stores it for the `x-organization-id` header, and
 * resolves with the id now active. The caller reloads (or refetches) so every query runs again
 * under it.
 *
 * It throws when the API refuses the switch, with nothing stored: the mutation runs with
 * `errorPolicy: 'none'` (also the client default, kept explicit so a client that defaults
 * mutations to `'all'` cannot make a refusal resolve and the refused id be stored and reloaded).
 *
 * An answer that arrives after its session ended (a logout, a change of user the caller reports
 * through `isCurrent`, or this component unmounted) is dropped: nothing is cached or stored, and it
 * throws `OrganizationSwitchSupersededError`. The mutation runs with `fetchPolicy: 'no-cache'` so
 * Apollo does not write the answer itself before that check.
 */
export function useSwitchActiveOrganization(): ActiveOrganizationSwitch {
  const client = useApolloClient()
  const [switchOrganization] = useMutation<
    SwitchActiveOrganizationMutation,
    SwitchActiveOrganizationMutationVariables
  >(SwitchActiveOrganization, { errorPolicy: 'none', fetchPolicy: 'no-cache' })

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  return useCallback(
    async (organizationId: string, options: SwitchActiveOrganizationOptions = {}) => {
      const session = activeOrganizationSession()
      const variables = { input: { organizationId } }
      const { data } = await switchOrganization({ variables })
      const current =
        mountedRef.current &&
        activeOrganizationSession() === session &&
        (options.isCurrent?.() ?? true)
      if (!current) throw new OrganizationSwitchSupersededError()
      if (data) client.cache.writeQuery({ query: SwitchActiveOrganization, variables, data })
      const activeOrganizationId =
        data?.switchActiveOrganization?.activeOrganizationId ?? organizationId
      storeActiveOrganizationId(activeOrganizationId)
      return activeOrganizationId
    },
    [client, switchOrganization],
  )
}

import { useCallback } from 'react'
import { useMutation } from '@apollo/client/react'
import { storeActiveOrganizationId } from '@nestled-template/shared/apollo'
import {
  SwitchActiveOrganization,
  type SwitchActiveOrganizationMutation,
  type SwitchActiveOrganizationMutationVariables,
} from '@nestled-template/shared/sdk'

/**
 * The one way to switch the active organization: the organization picker, a header switcher and
 * `AuthProvider` all call the function this returns. It makes `organizationId` the user's active
 * organization on the API (`switchActiveOrganization`, which also updates the API's auth cache),
 * then stores it for the `x-organization-id` header, and resolves with the id now active. The
 * caller reloads (or refetches) so every query runs again under it.
 *
 * It throws when the API refuses the switch, with nothing stored: the mutation runs with
 * `errorPolicy: 'none'`, since under the app client's default (`'all'`) a refusal resolves instead
 * and the refused id would be stored and reloaded into.
 */
export function useSwitchActiveOrganization(): (organizationId: string) => Promise<string> {
  const [switchOrganization] = useMutation<
    SwitchActiveOrganizationMutation,
    SwitchActiveOrganizationMutationVariables
  >(SwitchActiveOrganization, { errorPolicy: 'none' })

  return useCallback(
    async (organizationId: string) => {
      const { data } = await switchOrganization({ variables: { input: { organizationId } } })
      const activeOrganizationId =
        data?.switchActiveOrganization?.activeOrganizationId ?? organizationId
      storeActiveOrganizationId(activeOrganizationId)
      return activeOrganizationId
    },
    [switchOrganization],
  )
}

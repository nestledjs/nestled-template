import { useQuery } from '@apollo/client/react'
import { useGlobalCtx } from '@nestled-template/web'
import {
  MyOrganizationsWithMembers,
  type MeQuery,
  type MyOrganizationsWithMembersQuery,
} from '@nestled-template/shared/sdk'

/**
 * Who the signed-in user is in their active organization, as the settings area sees it.
 *
 * The settings layout decides which tabs to show from this, and the pages behind those tabs gate
 * their own content on the same answer, so a tab never leads to a page that turns its user away.
 */

type UserWithActiveOrganization = NonNullable<MeQuery['me']> & {
  activeOrganizationId?: string | null
}

export type SettingsOrganization = MyOrganizationsWithMembersQuery['myOrganizations'][number]

export type SettingsOrganizationMember = NonNullable<
  NonNullable<SettingsOrganization['members']>[number]
>

export function useSettingsOrganization() {
  const { user } = useGlobalCtx()
  const { data, loading } = useQuery<MyOrganizationsWithMembersQuery>(MyOrganizationsWithMembers)
  const organizations = data?.myOrganizations || []
  const userWithActiveOrganization: UserWithActiveOrganization | null | undefined = user
  const activeOrganization =
    organizations.find(org => org.id === userWithActiveOrganization?.activeOrganizationId) ||
    organizations[0] ||
    null
  const activeOrganizationMember =
    activeOrganization?.members?.find(member => member.userId === user?.id) || null

  return { user, activeOrganization, activeOrganizationMember, loading: loading && !data }
}

/**
 * Whether the member's role holds `permission`. `all:manage` holds every permission, as it does in
 * the API's access policy (it grants `*`), so a role that carries only `all:manage` is not shown
 * less than the API lets it do.
 */
export function hasRolePermission(member: SettingsOrganizationMember | null, permission: string) {
  const [subject, action] = permission.split(':')
  return !!member?.role?.permissions?.some(
    p =>
      (p.subject === 'all' && p.action === 'manage') ||
      (p.subject === subject && p.action === action),
  )
}

/** May view the organization's billing: `billing:read` or `billing:manage`. */
export function hasBillingAccess(
  user: MeQuery['me'] | null | undefined,
  member: SettingsOrganizationMember | null,
) {
  if (user?.isSuperAdmin) return true
  if (!member) return false

  const roleName = member.role?.name
  if (roleName === 'Owner' || roleName === 'Admin') return true

  return hasRolePermission(member, 'billing:read') || hasRolePermission(member, 'billing:manage')
}

/**
 * May change the organization's billing: subscribe, change plan, cancel, open the billing portal.
 * Only `billing:manage` (or `all:manage`, which holds it) grants this, matching the API's
 * mutations; a role's name never does.
 */
export function canManageBilling(
  user: MeQuery['me'] | null | undefined,
  member: SettingsOrganizationMember | null,
) {
  if (user?.isSuperAdmin) return true
  return hasRolePermission(member, 'billing:manage')
}

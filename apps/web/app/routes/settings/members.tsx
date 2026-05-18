import React, { useState } from 'react'
import { useLoaderData } from 'react-router'
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserMinusIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { RequirePermission } from '@nestled-template/web'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { formTheme } from '@nestled-template/shared/styles'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  Me,
  type MeQuery,
  MyOrganizationsWithMembers,
  type MyOrganizationsWithMembersQuery,
  CreateOrganizationInvitation,
  CancelOrganizationInvitation,
  ResendOrganizationInvitation,
  RemoveOrganizationMember,
  UpdateOrganizationMemberRole,
  UserOrganizationMembers,
  OrganizationRoles,
  OrganizationInvitations,
  type CreateOrganizationInvitationMutation,
  type CancelOrganizationInvitationMutation,
  type ResendOrganizationInvitationMutation,
  type RemoveOrganizationMemberMutation,
  type UpdateOrganizationMemberRoleMutation,
  type UserOrganizationMembersQuery,
  type OrganizationRolesQuery,
  type OrganizationInvitationsQuery,
} from '@nestled-template/shared/sdk'
import { useReadQuery, type QueryRef, useQuery, useMutation } from '@apollo/client/react'

// Permission descriptions for display
const permissionDescriptions: Record<string, string> = {
  'organization:read': 'View organization details',
  'organization:update': 'Update organization settings',
  'organization:delete': 'Delete organization',
  'member:read': 'View organization members',
  'member:invite': 'Invite new members',
  'member:update': 'Update member roles',
  'member:remove': 'Remove members',
  'role:read': 'View roles',
  'role:create': 'Create custom roles',
  'role:update': 'Update role permissions',
  'role:delete': 'Delete custom roles',
  'billing:read': 'View billing information',
  'billing:manage': 'Manage subscriptions and payments',
  'team:read': 'View teams',
  'team:create': 'Create teams',
  'team:update': 'Update teams',
  'team:delete': 'Delete teams',
  'audit:read': 'View audit logs',
}

// Group permissions by subject for display
function groupPermissionsBySubject(permissions: Array<{ subject: string; action: string }>) {
  const grouped: Record<string, string[]> = {}
  for (const perm of permissions) {
    if (!grouped[perm.subject]) {
      grouped[perm.subject] = []
    }
    grouped[perm.subject].push(perm.action)
  }
  return grouped
}

// Role badge colors
const roleBadgeColors: Record<string, string> = {
  Owner:
    'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20',
  Admin:
    'bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20',
  Member:
    'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
}

// Subject display names
const subjectDisplayNames: Record<string, string> = {
  organization: 'Organization',
  member: 'Members',
  role: 'Roles',
  billing: 'Billing',
  team: 'Teams',
  audit: 'Audit Logs',
}

type OrganizationMemberRow = UserOrganizationMembersQuery['userOrganizationMembers'][number]
type OrganizationRole = OrganizationRolesQuery['organizationRoles'][number]
type ActiveOrganizationMember = NonNullable<
  NonNullable<MyOrganizationsWithMembersQuery['myOrganizations'][number]['members']>[number]
>

interface RolePermissionsCardProps {
  role: {
    id: string
    name: string
    description?: string | null
    permissions?: Array<{ id: string; subject: string; action: string }> | null
  }
}

function RolePermissionsCard({ role }: Readonly<RolePermissionsCardProps>) {
  const [isExpanded, setIsExpanded] = useState(false)
  const permissions = role.permissions || []
  const groupedPermissions = groupPermissionsBySubject(permissions)
  const badgeColor =
    roleBadgeColors[role.name] ||
    'bg-zinc-100 dark:bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-200 dark:border-zinc-500/20'

  return (
    <div className="border border-zinc-200 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeColor}`}>
            {role.name}
          </div>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {role.description || `${permissions.length} permissions`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {permissions.length} permissions
          </span>
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-zinc-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-200 dark:border-white/10 p-4 bg-zinc-50 dark:bg-white/[0.02]">
          {Object.keys(groupedPermissions).length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">
              No permissions assigned to this role.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(groupedPermissions).map(([subject, actions]) => (
                <div key={subject} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon className="h-4 w-4 text-zinc-400" />
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-white">
                      {subjectDisplayNames[subject] || subject}
                    </h4>
                  </div>
                  <ul className="space-y-1 pl-6">
                    {actions.map(action => {
                      const permKey = `${subject}:${action}`
                      return (
                        <li key={action} className="text-xs text-zinc-600 dark:text-zinc-400">
                          {permissionDescriptions[permKey] || `${action}`}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function isOwnerRole(roleName: string | null | undefined): boolean {
  return roleName === 'Owner'
}

function getAssignableRoles(
  roles: readonly OrganizationRole[],
  activeOrganizationMember: ActiveOrganizationMember | null | undefined,
) {
  if (isOwnerRole(activeOrganizationMember?.role?.name)) return roles
  return roles.filter(role => !isOwnerRole(role.name))
}

export const loader = apolloLoader()(({ preloadQuery }) => {
  const myOrganizationsQueryRef = preloadQuery<MyOrganizationsWithMembersQuery>(
    MyOrganizationsWithMembers,
  )
  const meQueryRef = preloadQuery<MeQuery>(Me)
  return { myOrganizationsQueryRef, meQueryRef }
})

export default function MembersSettings() {
  const loaderData = useLoaderData() as {
    myOrganizationsQueryRef: QueryRef<MyOrganizationsWithMembersQuery>
    meQueryRef: QueryRef<MeQuery>
  }
  const { data: orgData } = useReadQuery(loaderData.myOrganizationsQueryRef)
  const { data: meData } = useReadQuery(loaderData.meQueryRef)
  const organizations = orgData?.myOrganizations || []
  const activeOrganization = organizations[0] || null
  const user = meData?.me
  const activeOrganizationMember =
    activeOrganization?.members?.find(member => member.userId === user?.id) || null
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<OrganizationMemberRow | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  const [inviteMember] = useMutation<CreateOrganizationInvitationMutation>(
    CreateOrganizationInvitation,
  )
  const [resendInvitation] = useMutation<ResendOrganizationInvitationMutation>(
    ResendOrganizationInvitation,
  )
  const [cancelInvitation] = useMutation<CancelOrganizationInvitationMutation>(
    CancelOrganizationInvitation,
  )
  const [removeMember] = useMutation<RemoveOrganizationMemberMutation>(RemoveOrganizationMember)
  const [updateMemberRole] = useMutation<UpdateOrganizationMemberRoleMutation>(
    UpdateOrganizationMemberRole,
  )

  const { data, loading, error, refetch } = useQuery<UserOrganizationMembersQuery>(
    UserOrganizationMembers,
    {
      variables: {
        organizationId: activeOrganization?.id || '',
      },
      skip: !activeOrganization?.id,
    },
  )

  const { data: rolesData } = useQuery<OrganizationRolesQuery>(OrganizationRoles, {
    variables: {
      organizationId: activeOrganization?.id || '',
    },
    skip: !activeOrganization?.id,
  })

  const {
    data: invitationsData,
    loading: invitationsLoading,
    refetch: refetchInvitations,
  } = useQuery<OrganizationInvitationsQuery>(OrganizationInvitations, {
    variables: {
      organizationId: activeOrganization?.id || '',
    },
    skip: !activeOrganization?.id,
  })

  const members = data?.userOrganizationMembers || []
  const roles = rolesData?.organizationRoles || []
  const assignableRoles = getAssignableRoles(roles, activeOrganizationMember)
  const invitations =
    invitationsData?.organizationInvitations?.filter(inv => inv.status === 'PENDING') || []

  async function handleInviteMember(input: { email: string; roleId: string }) {
    setFormError(null)
    setFormSuccess(null)

    if (!activeOrganization) {
      setFormError('No active organization selected')
      return
    }

    try {
      await inviteMember({
        variables: {
          input: {
            organizationId: activeOrganization.id,
            email: input.email,
            roleId: input.roleId,
          },
        },
      })

      setFormSuccess('Invitation sent successfully!')
      setShowInviteForm(false)
      refetch()
      refetchInvitations()
    } catch (error) {
      setFormError((error as Error)?.message ?? 'Failed to send invitation')
    }
  }

  async function handleResendInvitation(invitationId: string, email: string) {
    setConfirmModal({
      isOpen: true,
      title: 'Resend Invitation',
      message: `Are you sure you want to resend the invitation to ${email}?`,
      onConfirm: async () => {
        setConfirmModal(null)
        setFormError(null)
        setFormSuccess(null)

        if (!activeOrganization) {
          setFormError('No active organization selected')
          return
        }

        try {
          await resendInvitation({
            variables: {
              input: {
                invitationId,
              },
            },
          })

          setFormSuccess(`Invitation resent to ${email}`)
          refetchInvitations()
        } catch (error) {
          setFormError((error as Error)?.message ?? 'Failed to resend invitation')
        }
      },
    })
  }

  async function handleCancelInvitation(invitationId: string, email: string) {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Invitation',
      message: `Are you sure you want to cancel the pending invitation to ${email}? Their invitation link will stop working.`,
      onConfirm: async () => {
        setConfirmModal(null)
        setFormError(null)
        setFormSuccess(null)

        try {
          await cancelInvitation({
            variables: {
              input: {
                invitationId,
              },
            },
          })

          setFormSuccess(`Invitation cancelled for ${email}`)
          refetchInvitations()
        } catch (error) {
          setFormError((error as Error)?.message ?? 'Failed to cancel invitation')
        }
      },
    })
  }

  async function handleRemoveMember(userId: string, memberName: string) {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Member',
      message: `Are you sure you want to remove ${memberName} from the organization? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null)
        setFormError(null)
        setFormSuccess(null)

        try {
          await removeMember({
            variables: {
              input: {
                organizationId: activeOrganization.id,
                userId: userId,
              },
            },
          })

          setFormSuccess('Member removed successfully!')
          refetch()
        } catch (error) {
          setFormError((error as Error)?.message ?? 'Failed to remove member')
        }
      },
    })
  }

  async function handleUpdateMemberRole(newRoleId: string) {
    if (!editingMember) return

    setFormError(null)
    setFormSuccess(null)

    if (!activeOrganization) {
      setFormError('No active organization selected')
      return
    }

    const editingUser = editingMember.user
    if (!editingUser) {
      setFormError('Selected member is missing user details')
      return
    }

    try {
      await updateMemberRole({
        variables: {
          input: {
            organizationId: activeOrganization.id,
            userId: editingUser.id,
            roleId: newRoleId,
          },
        },
      })

      const editingUserName =
        [editingUser.firstName, editingUser.lastName].filter(Boolean).join(' ') || 'member'
      setFormSuccess(`Role updated successfully for ${editingUserName}`)
      setEditingMember(null)
      refetch()
    } catch (error) {
      setFormError((error as Error)?.message ?? 'Failed to update member role')
    }
  }

  const inviteFields = [
    FormFieldClass.email('email', {
      label: 'Email Address',
      required: true,
      placeholder: 'colleague@example.com',
    }),
    FormFieldClass.select('roleId', {
      label: 'Role',
      required: true,
      options: [
        { value: '', label: 'Select a role...' },
        ...assignableRoles.map(role => ({
          value: role.id,
          label: role.name,
        })),
      ],
    }),
    FormFieldClass.button('submit', {
      text: 'Send Invitation',
      type: 'submit',
      fullWidth: false,
    }),
  ]

  return (
    <RequirePermission
      permission="member:read"
      fallback={
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-3">
              <UsersIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                Permission Required
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                You don't have permission to view organization members.
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-500/10 p-3">
                <UsersIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Team Members</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Manage your organization's team members and roles
                </p>
              </div>
            </div>

            <RequirePermission permission="member:invite" fallback={null}>
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Invite Member
              </button>
            </RequirePermission>
          </div>
        </div>

        {formError && (
          <div className="rounded-lg text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3">
            {formError}
          </div>
        )}

        {formSuccess && (
          <div className="rounded-lg text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-3">
            {formSuccess}
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmModal?.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur shadow-xl max-w-md w-full">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
                {confirmModal.title}
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                {confirmModal.message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Member Role Modal */}
        {editingMember && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur shadow-xl max-w-md w-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-sky-100 dark:bg-sky-500/10 p-2">
                  <PencilIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Edit Member Role
                </h3>
              </div>

              <div className="mb-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                  Update the role for{' '}
                  <strong className="text-zinc-900 dark:text-white">
                    {editingMember.user?.firstName} {editingMember.user?.lastName}
                  </strong>
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  {editingMember.user?.emails?.find(e => e.primary)?.email ||
                    editingMember.user?.emails?.[0]?.email}
                </p>
              </div>

              <div className="mb-4">
                <label
                  htmlFor="select-new-role"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Select New Role
                </label>
                <select
                  id="select-new-role"
                  defaultValue={editingMember.role?.id}
                  onChange={e => {
                    if (e.target.value) {
                      handleUpdateMemberRole(e.target.value)
                    }
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select a role...</option>
                  {assignableRoles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingMember(null)}
                  className="flex-1 px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invite Form */}
        {showInviteForm && (
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-sky-100 dark:bg-sky-500/10 p-2">
                <EnvelopeIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Invite New Member
              </h3>
            </div>

            <Form
              id="invite-member-form"
              theme={formTheme}
              fields={inviteFields}
              submit={handleInviteMember}
            />

            <button
              onClick={() => setShowInviteForm(false)}
              className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Members List */}
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Active Members ({members.length})
          </h3>

          {loading && (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-500 border-r-transparent"></div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Loading members...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-rose-600 dark:text-rose-400">
              Failed to load members. Please try again.
            </div>
          )}

          {!loading && !error && members.length === 0 && (
            <div className="text-center py-8">
              <UsersIcon className="h-12 w-12 mx-auto text-zinc-400 dark:text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No members found. Invite your first team member!
              </p>
            </div>
          )}

          {!loading && !error && members.length > 0 && (
            <div className="space-y-3">
              {members.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-white font-semibold">
                      {member.user?.firstName?.[0] || '?'}
                      {member.user?.lastName?.[0] || ''}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-white">
                        {member.user?.firstName} {member.user?.lastName}
                        {member.id === activeOrganizationMember?.id && (
                          <span className="ml-2 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
                            You
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        {member.user?.emails?.find(e => e.primary)?.email ||
                          member.user?.emails?.[0]?.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 rounded-full text-xs font-medium">
                      {member.role?.name || 'Member'}
                    </span>

                    <RequirePermission permission="member:update" fallback={null}>
                      {member.id !== activeOrganizationMember?.id && (
                        <button
                          onClick={() => setEditingMember(member)}
                          className="p-1.5 rounded text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/10"
                          title="Edit role"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                    </RequirePermission>

                    <RequirePermission permission="member:remove" fallback={null}>
                      {member.id !== activeOrganizationMember?.id && (
                        <button
                          onClick={() =>
                            handleRemoveMember(
                              member.user?.id || '',
                              `${member.user?.firstName} ${member.user?.lastName}`,
                            )
                          }
                          className="p-1.5 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/10"
                          title="Remove member"
                        >
                          <UserMinusIcon className="h-4 w-4" />
                        </button>
                      )}
                    </RequirePermission>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Invitations */}
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Pending Invitations ({invitations.length})
          </h3>

          {invitationsLoading && (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-500 border-r-transparent"></div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Loading invitations...
              </p>
            </div>
          )}

          {!invitationsLoading && invitations.length === 0 && (
            <div className="text-center py-6">
              <EnvelopeIcon className="h-10 w-10 mx-auto text-zinc-400 dark:text-zinc-600 mb-2" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">No pending invitations</p>
            </div>
          )}

          {!invitationsLoading && invitations.length > 0 && (
            <div className="space-y-3">
              {invitations.map(invitation => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                      <EnvelopeIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-white">
                        {invitation.email}
                      </h4>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Invited by {invitation.inviter?.firstName} {invitation.inviter?.lastName} •
                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 rounded-full text-xs font-medium">
                      {invitation.role?.name || 'Member'}
                    </span>

                    <RequirePermission permission="member:invite" fallback={null}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleResendInvitation(invitation.id, invitation.email)}
                          className="p-1.5 rounded text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/10"
                          title="Resend invitation"
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                          className="p-1.5 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/10"
                          title="Cancel invitation"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </RequirePermission>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Role Permissions Detail */}
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Role Permissions
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            Each role grants specific permissions within the organization. Click to expand and see
            detailed permissions.
          </p>

          <div className="space-y-4">
            {roles.map(role => (
              <RolePermissionsCard key={role.id} role={role} />
            ))}
            {roles.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">Loading roles...</p>
            )}
          </div>
        </div>
      </div>
    </RequirePermission>
  )
}

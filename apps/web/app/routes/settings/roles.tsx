import { FormEvent, useMemo, useState } from 'react'
import {
  CheckIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useMutation, useQuery } from '@apollo/client/react'
import { RequirePermission, useGlobalCtx } from '@nestled-template/web'
import {
  MyOrganizationsWithMembers,
  OrganizationRoles,
  UserCreateOrganizationRole,
  UserDeleteOrganizationRole,
  UserUpdateOrganizationRole,
  type MyOrganizationsWithMembersQuery,
  type OrganizationRolesQuery,
} from '@nestled-template/shared/sdk'

type OrganizationRole = OrganizationRolesQuery['organizationRoles'][number]
type Permission = NonNullable<OrganizationRole['permissions']>[number]

function permissionKey(permission: Pick<Permission, 'subject' | 'action'>) {
  return `${permission.subject}:${permission.action}`
}

function groupPermissions(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>()
  for (const permission of permissions) {
    const group = groups.get(permission.subject) ?? []
    group.push(permission)
    groups.set(permission.subject, group)
  }
  return [...groups.entries()]
}

interface RoleEditorProps {
  role?: OrganizationRole
  permissions: Permission[]
  busy: boolean
  onClose: () => void
  onSave: (input: { name: string; description: string; permissionKeys: string[] }) => Promise<void>
}

function RoleEditor({ role, permissions, busy, onClose, onSave }: Readonly<RoleEditorProps>) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState(
    () => new Set(role?.permissions?.map(permissionKey) ?? []),
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onSave({ name, description, permissionKeys: [...selected] })
  }
  let submitLabel = 'Create role'
  if (role) submitLabel = 'Save role'
  if (busy) submitLabel = 'Saving…'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={submit}
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-5 dark:border-white/10 dark:bg-zinc-900">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Organization role
            </p>
            <h2 className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
              {role ? 'Edit custom role' : 'Create custom role'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-zinc-100 p-2 text-zinc-500 hover:text-zinc-900 dark:bg-white/10 dark:text-zinc-400 dark:hover:text-white"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Name</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                minLength={2}
                maxLength={80}
                required
                autoFocus
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Description
              </span>
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                maxLength={500}
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-zinc-900 dark:text-white">
              Permissions you may delegate
            </legend>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The API also enforces this grant ceiling; hidden or modified browser fields cannot
              grant access you do not hold.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {groupPermissions(permissions).map(([subject, subjectPermissions]) => (
                <section
                  key={subject}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <h3 className="mb-2 text-sm font-bold capitalize text-zinc-900 dark:text-white">
                    {subject}
                  </h3>
                  <div className="space-y-1">
                    {subjectPermissions.map(permission => {
                      const key = permissionKey(permission)
                      const checked = selected.has(key)
                      return (
                        <label
                          key={permission.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-white dark:hover:bg-white/5"
                        >
                          <span className="sr-only">Toggle permission</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelected(current => {
                                const next = new Set(current)
                                if (next.has(key)) next.delete(key)
                                else next.add(key)
                                return next
                              })
                            }
                            className="mt-0.5 h-4 w-4 accent-emerald-500"
                          />
                          <span>
                            <strong className="block text-sm capitalize text-zinc-800 dark:text-zinc-200">
                              {permission.action}
                            </strong>
                            <small className="text-xs text-zinc-500 dark:text-zinc-400">
                              {permissionKey(permission)}
                            </small>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </fieldset>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default function OrganizationRolesSettings() {
  const { user } = useGlobalCtx()
  const [editing, setEditing] = useState<OrganizationRole | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const { data: organizationData } = useQuery<MyOrganizationsWithMembersQuery>(
    MyOrganizationsWithMembers,
  )
  const organizations = organizationData?.myOrganizations ?? []
  const activeOrganizationId = (user as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId
  const activeOrganization =
    organizations.find(organization => organization.id === activeOrganizationId) ?? organizations[0]
  const activeMember = activeOrganization?.members?.find(member => member.userId === user?.id)
  const { data, loading, refetch } = useQuery<OrganizationRolesQuery>(OrganizationRoles, {
    variables: { organizationId: activeOrganization?.id ?? '' },
    skip: !activeOrganization?.id,
  })
  const roles = data?.organizationRoles ?? []
  const delegatablePermissions = useMemo(
    () => (activeMember?.role?.permissions ?? []) as Permission[],
    [activeMember],
  )
  const canCreate = delegatablePermissions.some(
    permission => permission.subject === 'role' && permission.action === 'create',
  )
  const canUpdate = delegatablePermissions.some(
    permission => permission.subject === 'role' && permission.action === 'update',
  )
  const canDelete = delegatablePermissions.some(
    permission => permission.subject === 'role' && permission.action === 'delete',
  )

  const [createRole] = useMutation(UserCreateOrganizationRole)
  const [updateRole] = useMutation(UserUpdateOrganizationRole)
  const [deleteRole] = useMutation(UserDeleteOrganizationRole)

  const run = async (operation: () => Promise<void>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await operation()
      await refetch()
      setEditing(null)
      setMessage({ tone: 'success', text: success })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'The role change failed.',
      })
    } finally {
      setBusy(false)
    }
  }

  if (!activeOrganization) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
        Create or join an organization before managing roles.
      </div>
    )
  }

  return (
    <RequirePermission permission="role:read" fallback={null}>
      <div className="space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-emerald-100 p-3 dark:bg-emerald-500/10">
              <ShieldCheckIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                Roles & Permissions
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Customize how members administer {activeOrganization.name}.
              </p>
            </div>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              <PlusIcon className="h-4 w-4" /> New role
            </button>
          )}
        </header>

        {message && (
          <div
            role="alert"
            className={`rounded-lg border p-3 text-sm ${
              message.tone === 'error'
                ? 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          {loading && <p className="text-sm text-zinc-500">Loading roles…</p>}
          {!loading &&
            roles.map(role => (
              <article
                key={role.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-white/5"
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-zinc-900 dark:text-white">{role.name}</h3>
                      {role.isSystem && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                          <LockClosedIcon className="h-3 w-3" /> System
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {role.description || 'No description provided.'}
                    </p>
                  </div>
                  {!role.isSystem && (
                    <div className="flex gap-1">
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => setEditing(role)}
                          className="rounded-lg p-2 text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
                          aria-label={`Edit ${role.name}`}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`Delete “${role.name}”?`)) return
                            void run(async () => {
                              await deleteRole({
                                variables: {
                                  input: {
                                    organizationId: activeOrganization.id,
                                    roleId: role.id,
                                  },
                                },
                              })
                            }, `${role.name} was deleted.`)
                          }}
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                          aria-label={`Delete ${role.name}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </header>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.permissions?.map(permission => (
                    <span
                      key={permission.id}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                    >
                      <CheckIcon className="h-3 w-3 text-emerald-500" />
                      {permissionKey(permission)}
                    </span>
                  ))}
                </div>
              </article>
            ))}
        </section>

        {editing && (
          <RoleEditor
            role={editing === 'new' ? undefined : editing}
            permissions={delegatablePermissions}
            busy={busy}
            onClose={() => setEditing(null)}
            onSave={input =>
              run(
                async () => {
                  if (editing === 'new') {
                    await createRole({
                      variables: {
                        input: { ...input, organizationId: activeOrganization.id },
                      },
                    })
                  } else {
                    await updateRole({
                      variables: {
                        input: {
                          ...input,
                          organizationId: activeOrganization.id,
                          roleId: editing.id,
                        },
                      },
                    })
                  }
                },
                editing === 'new' ? 'Role created.' : 'Role updated.',
              )
            }
          />
        )}
      </div>
    </RequirePermission>
  )
}

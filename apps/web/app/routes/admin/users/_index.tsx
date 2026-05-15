import { useState } from 'react'
import { useMutation, useQuery } from '@apollo/client/react'
import {
  AdminUserManagementDetails,
  AdminUserManagement,
  EmulateUser,
  type AdminUserManagementQuery,
  type AdminUserManagementDetailsQuery,
  type EmulateUserMutation,
} from '@nestled-template/shared/sdk'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@nestled-template/shared/utils'
import { useNavigate } from 'react-router'

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    isSuperAdmin: undefined as boolean | undefined,
    emailVerified: undefined as boolean | undefined,
    twoFactorEnabled: undefined as boolean | undefined,
    accountLocked: undefined as boolean | undefined,
  })
  const [page, setPage] = useState(0)
  const pageSize = 50

  // UI state for confirmation dialog and error messages
  const [confirmEmulation, setConfirmEmulation] = useState<{
    userId: string
    userEmail: string
  } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // Query users
  const { data, loading, error } = useQuery<AdminUserManagementQuery>(AdminUserManagement, {
    variables: {
      filters: {
        search: search || undefined,
        ...filters,
        skip: page * pageSize,
        take: pageSize,
      },
    },
    fetchPolicy: 'network-only',
  })

  // Query user details
  const { data: detailsData, loading: loadingDetails } = useQuery<AdminUserManagementDetailsQuery>(AdminUserManagementDetails, {
    variables: { userId: selectedUserId! },
    skip: !selectedUserId,
    fetchPolicy: 'network-only',
  })

  const userDetails = detailsData?.adminUserDetails

  // Emulate user mutation
  const [emulateUser, { loading: emulating }] = useMutation<EmulateUserMutation>(EmulateUser, {
    onCompleted: () => {
      // Reload the page to switch to the emulated user's session
      window.location.href = '/members/dashboard'
    },
    onError: error => {
      setErrorMessage(error.message)
      setTimeout(() => setErrorMessage(null), 5000)
    },
  })

  const users = data?.adminUsers?.users || []
  const total = data?.adminUsers?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const handleEmulate = (userId: string, userEmail: string) => {
    setConfirmEmulation({ userId, userEmail })
  }

  const confirmEmulationAction = () => {
    if (confirmEmulation) {
      emulateUser({ variables: { input: { userId: confirmEmulation.userId } } })
      setConfirmEmulation(null)
    }
  }

  const cancelEmulation = () => {
    setConfirmEmulation(null)
  }

  const formatDate = (date: string | null) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">User Management</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage users, view activity, and emulate user sessions
        </p>
      </div>

      {/* Search and Filters */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by email, name, or ID..."
              className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 pl-10 pr-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                setFilters(f => ({
                  ...f,
                  isSuperAdmin: f.isSuperAdmin === true ? undefined : true,
                }))
              }
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                filters.isSuperAdmin === true
                  ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10',
              )}
            >
              <ShieldCheckIcon className="h-4 w-4" />
              Super Admins
            </button>

            <button
              onClick={() =>
                setFilters(f => ({
                  ...f,
                  emailVerified: f.emailVerified === true ? undefined : true,
                }))
              }
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                filters.emailVerified === true
                  ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10',
              )}
            >
              <CheckCircleIcon className="h-4 w-4" />
              Email Verified
            </button>

            <button
              onClick={() =>
                setFilters(f => ({
                  ...f,
                  twoFactorEnabled: f.twoFactorEnabled === true ? undefined : true,
                }))
              }
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                filters.twoFactorEnabled === true
                  ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10',
              )}
            >
              <ShieldCheckIcon className="h-4 w-4" />
              2FA Enabled
            </button>

            <button
              onClick={() =>
                setFilters(f => ({
                  ...f,
                  accountLocked: f.accountLocked === true ? undefined : true,
                }))
              }
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                filters.accountLocked === true
                  ? 'border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                  : 'border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10',
              )}
            >
              <LockClosedIcon className="h-4 w-4" />
              Locked Accounts
            </button>

            {(search || Object.values(filters).some(v => v !== undefined)) && (
              <button
                onClick={() => {
                  setSearch('')
                  setFilters({
                    isSuperAdmin: undefined,
                    emailVerified: undefined,
                    twoFactorEnabled: undefined,
                    accountLocked: undefined,
                  })
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10"
              >
                <XCircleIcon className="h-4 w-4" />
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        Showing {users.length} of {total} users
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm overflow-hidden backdrop-blur">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 dark:border-emerald-400 border-r-transparent"></div>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading users...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-600 dark:text-red-400">Error loading users: {error.message}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
            No users found matching your criteria
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-white/10">
              <thead className="bg-zinc-50 dark:bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Organizations
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-white/10 bg-white dark:bg-white/5">
                {users.map(user => {
                  const email = user.emails?.find(e => e.primary)?.email || 'No email'
                  const emailVerified = user.emails?.find(e => e.primary)?.verified || false
                  const isLocked = user.lockedUntil
                    ? new Date(user.lockedUntil) > new Date()
                    : false

                  return (
                    <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-zinc-900 dark:text-white">
                                {user.firstName} {user.lastName}
                              </div>
                              {user.isSuperAdmin && (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                                  <ShieldCheckIcon className="mr-1 h-3 w-3" />
                                  Super Admin
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-400">{email}</div>
                            <div className="text-xs text-zinc-400 dark:text-zinc-500">
                              ID: {user.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {emailVerified ? (
                            <span className="inline-flex items-center text-xs text-green-700 dark:text-green-400">
                              <CheckCircleIcon className="mr-1 h-3 w-3" />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs text-zinc-500 dark:text-zinc-400">
                              <XCircleIcon className="mr-1 h-3 w-3" />
                              Not Verified
                            </span>
                          )}
                          {user.twoFactorEnabled && (
                            <span className="inline-flex items-center text-xs text-purple-700 dark:text-purple-400">
                              <ShieldCheckIcon className="mr-1 h-3 w-3" />
                              2FA
                            </span>
                          )}
                          {isLocked && (
                            <span className="inline-flex items-center text-xs text-red-700 dark:text-red-400">
                              <LockClosedIcon className="mr-1 h-3 w-3" />
                              Locked
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.organizations?.slice(0, 2).map(org => (
                            <span
                              key={org.organization?.id}
                              className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300"
                            >
                              {org.organization?.name}
                            </span>
                          ))}
                          {(user.organizations?.length || 0) > 2 && (
                            <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                              +{(user.organizations?.length || 0) - 2} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {formatDate(user.lastSuccessfulLogin)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedUserId(user.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-zinc-600 dark:bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-500 dark:hover:bg-white/20 transition"
                          >
                            <EyeIcon className="h-4 w-4" />
                            View
                          </button>
                          <button
                            onClick={() => handleEmulate(user.id, email)}
                            disabled={emulating}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
                          >
                            Emulate
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            Page {page + 1} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmEmulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-md w-full mx-4 border border-zinc-200 dark:border-white/10">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-amber-500 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                    Emulate User?
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                    You are about to emulate:{' '}
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {confirmEmulation.userEmail}
                    </span>
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    This will log you in as this user. You can return to your admin account at any
                    time using the banner at the top.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 px-6 py-4 flex gap-3 justify-end rounded-b-lg border-t border-zinc-200 dark:border-white/10">
              <button
                onClick={cancelEmulation}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-300 dark:border-white/10 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmEmulationAction}
                disabled={emulating}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emulating ? 'Emulating...' : 'Start Emulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg shadow-xl p-4 backdrop-blur">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                  Failed to Emulate User
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {selectedUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-4xl w-full my-8 border border-zinc-200 dark:border-white/10">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/10">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">User Details</h2>
              <button
                onClick={() => setSelectedUserId(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 dark:border-emerald-400 border-r-transparent"></div>
                </div>
              ) : userDetails ? (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        Name
                      </label>
                      <p className="mt-1 text-base font-medium text-zinc-900 dark:text-white">
                        {userDetails.firstName} {userDetails.lastName}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        User ID
                      </label>
                      <p className="mt-1 text-sm text-zinc-900 dark:text-white font-mono">
                        {userDetails.id}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        Created
                      </label>
                      <p className="mt-1 text-sm text-zinc-900 dark:text-white">
                        {formatDate(userDetails.createdAt)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        Last Login
                      </label>
                      <p className="mt-1 text-sm text-zinc-900 dark:text-white">
                        {formatDate(userDetails.lastSuccessfulLogin)}
                      </p>
                    </div>
                  </div>

                  {/* Emails */}
                  <div>
                    <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      Email Addresses
                    </label>
                    <div className="mt-2 space-y-2">
                      {userDetails.emails?.map(email => (
                        <div
                          key={email.id}
                          className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-2"
                        >
                          <span className="text-sm text-zinc-900 dark:text-white">
                            {email.email}
                          </span>
                          <div className="flex items-center gap-2">
                            {email.primary && (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                                Primary
                              </span>
                            )}
                            {email.verified ? (
                              <span className="inline-flex items-center text-xs text-green-700 dark:text-green-400">
                                <CheckCircleIcon className="mr-1 h-3 w-3" />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs text-zinc-500 dark:text-zinc-400">
                                <XCircleIcon className="mr-1 h-3 w-3" />
                                Not Verified
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Security Status */}
                  <div>
                    <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      Security Status
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-3">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          Two-Factor Auth
                        </span>
                        {userDetails.twoFactorEnabled ? (
                          <span className="inline-flex items-center text-sm text-green-700 dark:text-green-400 font-medium">
                            <CheckCircleIcon className="mr-1 h-4 w-4" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-sm text-zinc-500 dark:text-zinc-400">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-3">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          Account Status
                        </span>
                        {userDetails.lockedUntil &&
                        new Date(userDetails.lockedUntil) > new Date() ? (
                          <span className="inline-flex items-center text-sm text-red-700 dark:text-red-400 font-medium">
                            <LockClosedIcon className="mr-1 h-4 w-4" />
                            Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-sm text-green-700 dark:text-green-400 font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      {userDetails.isSuperAdmin && (
                        <div className="col-span-2 flex items-center justify-center rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-500/20 px-4 py-3">
                          <span className="inline-flex items-center text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                            <ShieldCheckIcon className="mr-2 h-5 w-5" />
                            Super Administrator
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Organizations */}
                  {userDetails.organizations && userDetails.organizations.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        Organizations
                      </label>
                      <div className="mt-2 space-y-2">
                        {userDetails.organizations.map(org => (
                          <div
                            key={org.organization?.id}
                            className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                {org.organization?.name}
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Joined {formatDate(org.organization?.createdAt)}
                              </p>
                            </div>
                            <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              {org.role?.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Sessions */}
                  {userDetails.activeSessions && userDetails.activeSessions.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        Active Sessions ({userDetails.activeSessions.filter(s => s.isValid).length})
                      </label>
                      <div className="mt-2 space-y-2">
                        {userDetails.activeSessions
                          .filter(s => s.isValid)
                          .slice(0, 5)
                          .map(session => (
                            <div
                              key={session.id}
                              className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-2 text-sm"
                            >
                              <div>
                                <p className="text-zinc-900 dark:text-white font-medium">
                                  {session.deviceInfo || 'Unknown Device'}
                                </p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {session.ipAddress}
                                </p>
                              </div>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {formatDate(session.lastActiveAt)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity */}
                  {userDetails.AuditLog && userDetails.AuditLog.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        Recent Activity
                      </label>
                      <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                        {userDetails.AuditLog.slice(0, 10).map(log => (
                          <div
                            key={log.id}
                            className="rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-4 py-2"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                  {log.action}
                                </p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {log.entityType} · {log.entityId.slice(0, 8)}
                                </p>
                              </div>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {formatDate(log.createdAt)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                  Failed to load user details
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-white/10 rounded-b-lg">
              <button
                onClick={() => setSelectedUserId(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-300 dark:border-white/10 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

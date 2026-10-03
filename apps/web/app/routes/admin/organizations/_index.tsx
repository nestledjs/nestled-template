import { useState } from 'react'
import { useQuery } from '@apollo/client/react'
import {
  AdminPlatformOrganizations,
  type AdminPlatformOrganizationsQuery,
} from '@nestled-template/shared/sdk'
import {
  BuildingOfficeIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@nestled-template/shared/utils'
import { Link } from 'react-router'

export default function AdminOrganizationsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 50

  const { data, loading, error } = useQuery<AdminPlatformOrganizationsQuery>(
    AdminPlatformOrganizations,
    {
      variables: {
        filters: {
          take: pageSize,
          skip: page * pageSize,
          search: search || undefined,
        },
      },
      fetchPolicy: 'network-only',
    },
  )

  type Organization = AdminPlatformOrganizationsQuery['adminOrganizations']['organizations'][number]

  const organizations = data?.adminOrganizations?.organizations || []
  const total = data?.adminOrganizations?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const formatDate = (date: string | null) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getSubscriptionStatus = (org: Organization) => {
    const subscription = org.subscription
    if (subscription?.status === 'ACTIVE') {
      return {
        status: 'Active',
        plan: subscription.plan?.name || 'Unknown',
        price: subscription.plan?.price || '0',
        color: 'emerald',
      }
    }
    return {
      status: 'No Subscription',
      plan: 'Free',
      price: '0',
      color: 'zinc',
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
          Organization Management
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          View and manage all organizations on the platform
        </p>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
          </div>
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search organizations by name..."
            className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 pl-10 pr-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        Showing {organizations.length} of {total} organizations
      </div>

      {/* Organizations Grid */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm overflow-hidden backdrop-blur">
        {loading && (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 dark:border-emerald-400 border-r-transparent"></div>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Loading organizations...
            </p>
          </div>
        )}
        {!loading && error && (
          <div className="p-12 text-center">
            <p className="text-red-600 dark:text-red-400">
              Error loading organizations: {error.message}
            </p>
          </div>
        )}
        {!loading && !error && organizations.length === 0 && (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
            No organizations found matching your search
          </div>
        )}
        {!loading && !error && organizations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-white/10">
              <thead className="bg-zinc-50 dark:bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Members
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Subscription
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-white/10 bg-white dark:bg-white/5">
                {organizations.map(org => {
                  const subscription = getSubscriptionStatus(org)
                  const memberCount = org.members?.length || 0
                  const ownerCount = org.members?.filter(m => m.role?.name === 'Owner').length || 0

                  return (
                    <tr key={org.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                            <BuildingOfficeIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-zinc-900 dark:text-white">
                              {org.name}
                            </div>
                            <div className="text-xs text-zinc-400 dark:text-zinc-500">
                              ID: {org.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <UsersIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                          <span className="text-sm text-zinc-900 dark:text-white">
                            {memberCount} {memberCount === 1 ? 'member' : 'members'}
                          </span>
                          {ownerCount > 0 && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              ({ownerCount} {ownerCount === 1 ? 'owner' : 'owners'})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs font-medium',
                              subscription.color === 'emerald'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-zinc-500 dark:text-zinc-400',
                            )}
                          >
                            {subscription.color === 'emerald' ? (
                              <CheckCircleIcon className="h-3 w-3" />
                            ) : (
                              <XCircleIcon className="h-3 w-3" />
                            )}
                            {subscription.status}
                          </span>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            {subscription.plan}{' '}
                            {subscription.price !== '0' && `($${subscription.price}/mo)`}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {formatDate(org.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          to={`/admin/organizations/${org.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 transition"
                        >
                          View Details
                        </Link>
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
    </div>
  )
}

import { Link, useLoaderData } from 'react-router'
import { apolloLoader } from '@nestled-template/shared/apollo'
import { MySecurityEvents, type MySecurityEventsQuery } from '@nestled-template/shared/sdk'
import { useReadQuery, type QueryRef } from '@apollo/client/react'
import { ChevronRightIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const securityEventsQueryRef = preloadQuery<MySecurityEventsQuery>(MySecurityEvents, {
    variables: {
      input: {
        take: 50,
        orderBy: 'createdAt',
        orderDirection: 'desc',
      },
    },
  })
  return { securityEventsQueryRef }
})

export default function SecurityEventsPage() {
  const loaderData = useLoaderData() as { securityEventsQueryRef: QueryRef<MySecurityEventsQuery> }
  const { data } = useReadQuery(loaderData.securityEventsQueryRef)
  const securityEvents = data?.mySecurityEvents || []

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm">
        <Link
          to="/settings"
          className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          Settings
        </Link>
        <ChevronRightIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />
        <Link
          to="/settings/security"
          className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          Security
        </Link>
        <ChevronRightIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />
        <span className="text-zinc-900 dark:text-white font-medium">Security Events</span>
      </nav>

      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-3">
            <ShieldCheckIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Security Events</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              View all security-related activities on your account
            </p>
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur overflow-hidden">
        {securityEvents.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No security events found
          </div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-white/10">
            <thead className="bg-zinc-50 dark:bg-white/5">
              <tr className="border-b border-zinc-200 dark:border-white/10">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
                  Event Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
                  Date & Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
                  IP Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
                  User Agent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-white/10 bg-white dark:bg-white/5">
              {securityEvents.map(event => (
                <tr
                  key={event.id}
                  className="border-b border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5"
                >
                  <td className="px-6 py-4 font-medium text-zinc-900 dark:text-white">
                    {event.eventType
                      ?.replaceAll('_', ' ')
                      .toLowerCase()
                      .replaceAll(/\b\w/g, l => l.toUpperCase()) || 'Security event'}
                  </td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-zinc-600 dark:text-zinc-400">
                    {event.ipAddress || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-400 max-w-md truncate">
                    {event.userAgent || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

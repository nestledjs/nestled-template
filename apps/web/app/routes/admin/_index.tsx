import { Link } from 'react-router'
import { useQuery } from '@apollo/client/react'
import { AdminDashboardStats, type AdminDashboardStatsQuery } from '@nestled-template/shared/sdk'
import {
  UsersIcon,
  BuildingOfficeIcon,
  ShieldCheckIcon,
  TableCellsIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline'

export default function AdminDashboard() {
  const { data, loading, error } = useQuery<AdminDashboardStatsQuery>(AdminDashboardStats, {
    fetchPolicy: 'cache-and-network',
  })

  const stats = data?.adminDashboardStats
  const quickLinks = [
    {
      name: 'Users',
      href: '/admin/users',
      icon: UsersIcon,
      description: 'Manage users and emulation',
      color: 'emerald',
    },
    {
      name: 'Organizations',
      href: '/admin/organizations',
      icon: BuildingOfficeIcon,
      description: 'Organization management',
      color: 'blue',
    },
    {
      name: 'Security Events',
      href: '/admin/security-events',
      icon: ShieldCheckIcon,
      description: 'Login attempts and 2FA',
      color: 'purple',
    },
    {
      name: 'Data Browser',
      href: '/admin/data',
      icon: TableCellsIcon,
      description: 'Database query tool',
      color: 'amber',
    },
    {
      name: 'Analytics',
      href: '/admin/analytics',
      icon: ChartBarSquareIcon,
      description: 'Platform metrics',
      color: 'cyan',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Admin Dashboard</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Platform administration and management overview
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Users</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {loading ? (
              <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
            ) : error ? (
              <span className="text-red-600 dark:text-red-400 text-base">Error</span>
            ) : (
              (stats?.totalUsers?.toLocaleString() ?? '0')
            )}
          </div>
          {!loading && !error && (
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Registered accounts</div>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Organizations</div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {loading ? (
              <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
            ) : error ? (
              <span className="text-red-600 dark:text-red-400 text-base">Error</span>
            ) : (
              (stats?.totalOrganizations?.toLocaleString() ?? '0')
            )}
          </div>
          {!loading && !error && (
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Active organizations
            </div>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Active Sessions
          </div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {loading ? (
              <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
            ) : error ? (
              <span className="text-red-600 dark:text-red-400 text-base">Error</span>
            ) : (
              (stats?.activeSessions?.toLocaleString() ?? '0')
            )}
          </div>
          {!loading && !error && (
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Currently logged in</div>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Security Events (24h)
          </div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {loading ? (
              <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
            ) : error ? (
              <span className="text-red-600 dark:text-red-400 text-base">Error</span>
            ) : (
              (stats?.recentSecurityEvents?.toLocaleString() ?? '0')
            )}
          </div>
          {!loading && !error && (
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Last 24 hours</div>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Active Subscriptions
          </div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {loading ? (
              <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
            ) : error ? (
              <span className="text-red-600 dark:text-red-400 text-base">Error</span>
            ) : (
              (stats?.activeSubscriptions?.toLocaleString() ?? '0')
            )}
          </div>
          {!loading && !error && (
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Paying customers</div>
          )}
        </div>
      </div>

      {/* Error Banner - Only show if query failed */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-6 backdrop-blur">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                Unable to Load Dashboard Stats
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">{error.message}</p>
              <p className="text-sm text-red-700 dark:text-red-300">
                Make sure the API server is running and the GraphQL schema is up to date. You may
                need to:
              </p>
              <ol className="text-sm text-red-700 dark:text-red-300 space-y-1 mt-2">
                <li>1. Restart the API server</li>
                <li>
                  2. Run{' '}
                  <code className="px-2 py-0.5 bg-red-100 dark:bg-red-500/20 rounded font-mono">
                    pnpm sdk
                  </code>{' '}
                  to regenerate types
                </li>
                <li>3. Refresh this page</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Quick Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map(link => (
            <Link
              key={link.name}
              to={link.href}
              className="group rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-zinc-100 dark:bg-white/10 p-3 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                  <link.icon className="h-6 w-6 text-zinc-600 dark:text-zinc-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {link.name}
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">{link.description}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useQuery } from '@apollo/client/react'
import { AdminAnalytics, type AdminAnalyticsQuery } from '@nestled-template/shared/sdk'
import {
  ChartBarIcon,
  ClockIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@nestled-template/shared/utils'

export default function AdminAnalyticsPage() {
  const { data, loading, error, refetch } = useQuery<AdminAnalyticsQuery>(AdminAnalytics, {
    fetchPolicy: 'cache-and-network',
  })

  const analytics = data?.adminAnalytics

  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return '0'
    return num.toLocaleString()
  }

  const formatPercent = (num: number | null | undefined) => {
    if (num === null || num === undefined) return '0%'
    return `${num.toFixed(1)}%`
  }

  const formatDuration = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return '0ms'
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Platform Analytics</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Monitor platform usage, performance, and health metrics
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            <ArrowTrendingUpIcon className="h-4 w-4" />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-6 backdrop-blur">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                Unable to Load Analytics Data
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

      {/* User Activity Section */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">User Activity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* DAU */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Daily Active Users
              </div>
              <UserGroupIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatNumber(analytics?.dailyActiveUsers)
              )}
            </div>
            {!loading && analytics?.dauChange !== null && analytics?.dauChange !== undefined && (
              <div
                className={cn(
                  'mt-2 flex items-center gap-1 text-sm',
                  analytics.dauChange >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {analytics.dauChange >= 0 ? (
                  <ArrowTrendingUpIcon className="h-4 w-4" />
                ) : (
                  <ArrowTrendingDownIcon className="h-4 w-4" />
                )}
                {formatPercent(Math.abs(analytics.dauChange))} vs yesterday
              </div>
            )}
          </div>

          {/* MAU */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Monthly Active Users
              </div>
              <UserGroupIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatNumber(analytics?.monthlyActiveUsers)
              )}
            </div>
            {!loading && analytics?.mauChange !== null && analytics?.mauChange !== undefined && (
              <div
                className={cn(
                  'mt-2 flex items-center gap-1 text-sm',
                  analytics.mauChange >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {analytics.mauChange >= 0 ? (
                  <ArrowTrendingUpIcon className="h-4 w-4" />
                ) : (
                  <ArrowTrendingDownIcon className="h-4 w-4" />
                )}
                {formatPercent(Math.abs(analytics.mauChange))} vs last month
              </div>
            )}
          </div>

          {/* New Users (Today) */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                New Users Today
              </div>
              <UserGroupIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatNumber(analytics?.newUsersToday)
              )}
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Registered in last 24h
            </div>
          </div>

          {/* Session Duration */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Avg Session Duration
              </div>
              <ClockIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatDuration(analytics?.avgSessionDuration)
              )}
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Per user session</div>
          </div>
        </div>
      </div>

      {/* System Performance Section */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          System Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* API Response Time */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Avg API Response
              </div>
              <ChartBarIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatDuration(analytics?.avgApiResponseTime)
              )}
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Last 24 hours</div>
          </div>

          {/* GraphQL Operations */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                GraphQL Operations
              </div>
              <CursorArrowRaysIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatNumber(analytics?.totalGraphQLOperations)
              )}
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Last 24 hours</div>
          </div>

          {/* Error Rate */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Error Rate</div>
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatPercent(analytics?.errorRate)
              )}
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Last 24 hours</div>
          </div>

          {/* Uptime */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                System Uptime
              </div>
              <ChartBarIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">
              {loading ? (
                <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded" />
              ) : (
                formatPercent(analytics?.systemUptime)
              )}
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Last 30 days</div>
          </div>
        </div>
      </div>

      {/* Top API Endpoints Section */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Top API Endpoints (24h)
        </h3>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm overflow-hidden backdrop-blur">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 dark:border-emerald-400 border-r-transparent"></div>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading endpoints...</p>
            </div>
          ) : !analytics?.topEndpoints || analytics.topEndpoints.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
              No endpoint data available
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-white/10">
                <thead className="bg-zinc-50 dark:bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Endpoint
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Requests
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Avg Response Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Error Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-white/10 bg-white dark:bg-white/5">
                  {analytics.topEndpoints.map((endpoint, index: any) => (
                    <tr key={index} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900 dark:text-white font-mono">
                          {endpoint.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900 dark:text-white">
                          {formatNumber(endpoint.requests)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900 dark:text-white">
                          {formatDuration(endpoint.avgResponseTime)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={cn(
                            'text-sm font-medium',
                            endpoint.errorRate > 5
                              ? 'text-red-600 dark:text-red-400'
                              : endpoint.errorRate > 1
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-green-600 dark:text-green-400',
                          )}
                        >
                          {formatPercent(endpoint.errorRate)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Feature Usage Section */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Feature Usage (Last 7 Days)
        </h3>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm overflow-hidden backdrop-blur">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 dark:border-emerald-400 border-r-transparent"></div>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                Loading feature usage...
              </p>
            </div>
          ) : !analytics?.featureUsage || analytics.featureUsage.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
              No feature usage data available
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-white/10">
                <thead className="bg-zinc-50 dark:bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Feature
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Unique Users
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Total Uses
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Adoption Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-white/10 bg-white dark:bg-white/5">
                  {analytics.featureUsage.map((feature, index: any) => (
                    <tr key={index} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900 dark:text-white">
                          {feature.featureName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900 dark:text-white">
                          {formatNumber(feature.uniqueUsers)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900 dark:text-white">
                          {formatNumber(feature.totalUses)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-emerald-600 dark:bg-emerald-400 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(feature.adoptionRate, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm text-zinc-900 dark:text-white">
                            {formatPercent(feature.adoptionRate)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

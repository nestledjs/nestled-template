import { useState } from 'react'
import { useQuery } from '@apollo/client/react'
import { AdminPlatformAuditLogs, AdminPlatformAuditLogsQuery } from '@nestled-template/shared/sdk'
import {
  DocumentMagnifyingGlassIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@nestled-template/shared/utils'

// Color class mappings to reduce cognitive complexity
const getColorClasses = (color: string) => {
  const colorMap = {
    emerald: {
      iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
      iconText: 'text-emerald-600 dark:text-emerald-400',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    },
    blue: {
      iconBg: 'bg-blue-100 dark:bg-blue-500/20',
      iconText: 'text-blue-600 dark:text-blue-400',
      badgeBg: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
    },
    red: {
      iconBg: 'bg-red-100 dark:bg-red-500/20',
      iconText: 'text-red-600 dark:text-red-400',
      badgeBg: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
    },
    purple: {
      iconBg: 'bg-purple-100 dark:bg-purple-500/20',
      iconText: 'text-purple-600 dark:text-purple-400',
      badgeBg: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300',
    },
    zinc: {
      iconBg: 'bg-zinc-200 dark:bg-zinc-700',
      iconText: 'text-zinc-600 dark:text-zinc-400',
      badgeBg: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300',
    },
  }
  return colorMap[color as keyof typeof colorMap] || colorMap.zinc
}

// Action type configurations for badge styling
const getActionConfig = (action: string) => {
  const actionLower = action.toLowerCase()

  if (actionLower.includes('create') || actionLower.includes('add')) {
    return {
      label: action,
      icon: PlusCircleIcon,
      color: 'emerald' as const,
    }
  }

  if (
    actionLower.includes('update') ||
    actionLower.includes('edit') ||
    actionLower.includes('change')
  ) {
    return {
      label: action,
      icon: PencilSquareIcon,
      color: 'blue' as const,
    }
  }

  if (actionLower.includes('delete') || actionLower.includes('remove')) {
    return {
      label: action,
      icon: TrashIcon,
      color: 'red' as const,
    }
  }

  if (
    actionLower.includes('read') ||
    actionLower.includes('view') ||
    actionLower.includes('access')
  ) {
    return {
      label: action,
      icon: EyeIcon,
      color: 'zinc' as const,
    }
  }

  return {
    label: action,
    icon: DocumentMagnifyingGlassIcon,
    color: 'purple' as const,
  }
}

// Extract AuditLogItem component to reduce cognitive complexity
type AuditLog = NonNullable<AdminPlatformAuditLogsQuery['adminAuditLogs']['logs'][number]>

interface AuditLogItemProps {
  readonly log: AuditLog
  readonly formatDate: (date: string) => string
}

function AuditLogItem({ log, formatDate }: AuditLogItemProps) {
  const config = getActionConfig(log.action)
  const colorClasses = getColorClasses(config.color)
  const Icon = config.icon
  const userEmail = log.user?.emails?.[0]?.email || 'System'
  const userName = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'

  return (
    <div className="flex gap-4 p-4 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 transition">
      {/* Icon */}
      <div className={cn('flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center', colorClasses.iconBg)}>
        <Icon className={cn('h-5 w-5', colorClasses.iconText)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', colorClasses.badgeBg)}>
                {config.label}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {log.entityType}
              </span>
            </div>
            <p className="text-sm text-zinc-900 dark:text-white font-medium mb-2">
              Entity ID: {log.entityId}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <span>
                User: {userName} ({userEmail})
              </span>
              {log.organization && <span>Organization: {log.organization.name}</span>}
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatDate(log.createdAt)}
            </div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {log.id.slice(0, 8)}
            </div>
          </div>
        </div>

        {/* Changes */}
        {log.changes && Object.keys(log.changes).length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
              View changes
            </summary>
            <div className="mt-2 p-3 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
              <pre className="text-xs text-zinc-700 dark:text-zinc-300 overflow-x-auto">
                {JSON.stringify(log.changes, null, 2)}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

export default function AdminAuditLogsPage() {
  const [filters, setFilters] = useState({
    userId: '',
    organizationId: '',
    action: '',
    entityType: '',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
  })
  const [page, setPage] = useState(0)
  const pageSize = 50

  const { data, loading, error } = useQuery<AdminPlatformAuditLogsQuery>(AdminPlatformAuditLogs, {
    variables: {
      filters: {
        userId: filters.userId || undefined,
        organizationId: filters.organizationId || undefined,
        action: filters.action || undefined,
        entityType: filters.entityType || undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        skip: page * pageSize,
        take: pageSize,
      },
    },
    fetchPolicy: 'network-only',
  })

  const logs = data?.adminAuditLogs?.logs || []
  const total = data?.adminAuditLogs?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const clearFilters = () => {
    setFilters({
      userId: '',
      organizationId: '',
      action: '',
      entityType: '',
      startDate: undefined,
      endDate: undefined,
    })
    setPage(0)
  }

  const hasActiveFilters =
    filters.userId ||
    filters.organizationId ||
    filters.action ||
    filters.entityType ||
    filters.startDate ||
    filters.endDate

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Audit Logs</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track all platform activities and changes for compliance and security
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur space-y-4">
        {/* Search Filters Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="action"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Action
            </label>
            <input
              id="action"
              type="text"
              value={filters.action}
              onChange={e => {
                setFilters(f => ({ ...f, action: e.target.value }))
                setPage(0)
              }}
              placeholder="Search by action (e.g., create, update, delete)..."
              className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 px-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="entityType"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Entity Type
            </label>
            <input
              id="entityType"
              type="text"
              value={filters.entityType}
              onChange={e => {
                setFilters(f => ({ ...f, entityType: e.target.value }))
                setPage(0)
              }}
              placeholder="Search by entity type (e.g., User, Organization)..."
              className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 px-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Search Filters Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="userId"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              User ID
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <MagnifyingGlassIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
              </div>
              <input
                id="userId"
                type="text"
                value={filters.userId}
                onChange={e => {
                  setFilters(f => ({ ...f, userId: e.target.value }))
                  setPage(0)
                }}
                placeholder="Search by user ID..."
                className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 pl-10 pr-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="organizationId"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Organization ID
            </label>
            <input
              id="organizationId"
              type="text"
              value={filters.organizationId}
              onChange={e => {
                setFilters(f => ({ ...f, organizationId: e.target.value }))
                setPage(0)
              }}
              placeholder="Search by organization ID..."
              className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 px-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Date Range Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Start Date
            </label>
            <input
              id="startDate"
              type="datetime-local"
              value={
                filters.startDate ? new Date(filters.startDate).toISOString().slice(0, 16) : ''
              }
              onChange={e => {
                setFilters(f => ({
                  ...f,
                  startDate: e.target.value ? new Date(e.target.value) : undefined,
                }))
                setPage(0)
              }}
              className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 px-3 text-zinc-900 dark:text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              End Date
            </label>
            <input
              id="endDate"
              type="datetime-local"
              value={filters.endDate ? new Date(filters.endDate).toISOString().slice(0, 16) : ''}
              onChange={e => {
                setFilters(f => ({
                  ...f,
                  endDate: e.target.value ? new Date(e.target.value) : undefined,
                }))
                setPage(0)
              }}
              className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 px-3 text-zinc-900 dark:text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition"
            >
              <XCircleIcon className="h-4 w-4" />
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        Showing {logs.length} of {total} audit logs
      </div>

      {/* Audit Logs Timeline */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm overflow-hidden backdrop-blur">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 dark:border-emerald-400 border-r-transparent"></div>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading audit logs...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-600 dark:text-red-400">
              Error loading audit logs: {error.message}
            </p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
            {hasActiveFilters
              ? 'No audit logs found matching your filters'
              : 'No audit logs recorded yet'}
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {logs.map((log) => (
              <AuditLogItem key={log.id} log={log} formatDate={formatDate} />
            ))}
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

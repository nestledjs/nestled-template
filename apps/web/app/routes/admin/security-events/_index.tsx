import { useState } from 'react'
import { useQuery } from '@apollo/client/react'
import {
  AdminPlatformSecurityEvents,
  SecurityEventType,
  type AdminPlatformSecurityEventsQuery,
} from '@nestled-template/shared/sdk'
import {
  ExclamationTriangleIcon,
  KeyIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  UserCircleIcon,
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
    amber: {
      iconBg: 'bg-amber-100 dark:bg-amber-500/20',
      iconText: 'text-amber-600 dark:text-amber-400',
      badgeBg: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
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
    blue: {
      iconBg: 'bg-blue-100 dark:bg-blue-500/20',
      iconText: 'text-blue-600 dark:text-blue-400',
      badgeBg: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
    },
    zinc: {
      iconBg: 'bg-zinc-200 dark:bg-zinc-700',
      iconText: 'text-zinc-600 dark:text-zinc-400',
      badgeBg: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300',
    },
  }
  return colorMap[color as keyof typeof colorMap] || colorMap.zinc
}

const EVENT_TYPE_CONFIG: Record<
  SecurityEventType,
  {
    label: string
    description: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    color: 'emerald' | 'amber' | 'red' | 'purple' | 'blue' | 'zinc'
  }
> = {
  [SecurityEventType.PasswordChanged]: {
    label: 'Password Changed',
    description: 'User changed their password',
    icon: KeyIcon,
    color: 'emerald',
  },
  [SecurityEventType.EmailChanged]: {
    label: 'Email Changed',
    description: 'User changed their email address',
    icon: UserCircleIcon,
    color: 'blue',
  },
  [SecurityEventType.TwoFactorEnabled]: {
    label: '2FA Enabled',
    description: 'User enabled two-factor authentication',
    icon: ShieldCheckIcon,
    color: 'emerald',
  },
  [SecurityEventType.TwoFactorDisabled]: {
    label: '2FA Disabled',
    description: 'User disabled two-factor authentication',
    icon: ShieldExclamationIcon,
    color: 'amber',
  },
  [SecurityEventType.RecoveryCodesGenerated]: {
    label: 'Recovery Codes Generated',
    description: 'User generated new recovery codes',
    icon: KeyIcon,
    color: 'purple',
  },
  [SecurityEventType.AccountLocked]: {
    label: 'Account Locked',
    description: 'Account was locked due to suspicious activity',
    icon: LockClosedIcon,
    color: 'red',
  },
  [SecurityEventType.AccountUnlocked]: {
    label: 'Account Unlocked',
    description: 'Account was unlocked by admin',
    icon: LockClosedIcon,
    color: 'emerald',
  },
  [SecurityEventType.SuspiciousLoginAttempt]: {
    label: 'Suspicious Login',
    description: 'Suspicious login attempt detected',
    icon: ExclamationTriangleIcon,
    color: 'red',
  },
  [SecurityEventType.PasswordResetRequested]: {
    label: 'Password Reset',
    description: 'User requested password reset',
    icon: KeyIcon,
    color: 'blue',
  },
  [SecurityEventType.LoginLocationChange]: {
    label: 'Location Change',
    description: 'Login from new location detected',
    icon: ExclamationTriangleIcon,
    color: 'amber',
  },
  [SecurityEventType.ApiTokenCreated]: {
    label: 'API Token Created',
    description: 'User created new API token',
    icon: KeyIcon,
    color: 'blue',
  },
  [SecurityEventType.ApiTokenRevoked]: {
    label: 'API Token Revoked',
    description: 'API token was revoked',
    icon: XCircleIcon,
    color: 'red',
  },
  [SecurityEventType.ApiTokenRotated]: {
    label: 'API Token Rotated',
    description: 'API token was rotated',
    icon: KeyIcon,
    color: 'amber',
  },
}

// Extract SecurityEventItem component to reduce cognitive complexity
type SecurityEvent = NonNullable<AdminPlatformSecurityEventsQuery['adminSecurityEvents']['events'][number]>

interface SecurityEventItemProps {
  readonly event: SecurityEvent
  readonly formatDate: (date: string) => string
}

function SecurityEventItem({ event, formatDate }: SecurityEventItemProps) {
  const config = EVENT_TYPE_CONFIG[event.eventType]
  const colorClasses = getColorClasses(config.color)
  const Icon = config.icon
  const userEmail = event.user?.emails?.[0]?.email || 'Unknown user'

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
            </div>
            <p className="text-sm text-zinc-900 dark:text-white font-medium">
              {config.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <span>
                User: {event.user?.firstName} {event.user?.lastName} ({userEmail})
              </span>
              {event.ipAddress && <span>IP: {event.ipAddress}</span>}
              {event.userAgent && (
                <span className="max-w-xs truncate">Device: {event.userAgent}</span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatDate(event.createdAt)}
            </div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {event.id.slice(0, 8)}
            </div>
          </div>
        </div>

        {/* Metadata */}
        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
              View metadata
            </summary>
            <pre className="mt-2 p-2 bg-zinc-100 dark:bg-zinc-900 rounded text-xs text-zinc-700 dark:text-zinc-300 overflow-x-auto">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

export default function AdminSecurityEventsPage() {
  const [filters, setFilters] = useState({
    eventType: undefined as SecurityEventType | undefined,
    userId: '',
    ipAddress: '',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
  })
  const [page, setPage] = useState(0)
  const pageSize = 50

  const { data, loading, error } = useQuery<AdminPlatformSecurityEventsQuery>(AdminPlatformSecurityEvents, {
    variables: {
      filters: {
        eventType: filters.eventType,
        userId: filters.userId || undefined,
        ipAddress: filters.ipAddress || undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        skip: page * pageSize,
        take: pageSize,
      },
    },
    fetchPolicy: 'network-only',
  })

  const events = data?.adminSecurityEvents?.events || []
  const total = data?.adminSecurityEvents?.total || 0
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
      eventType: undefined,
      userId: '',
      ipAddress: '',
      startDate: undefined,
      endDate: undefined,
    })
    setPage(0)
  }

  const hasActiveFilters =
    filters.eventType || filters.userId || filters.ipAddress || filters.startDate || filters.endDate

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Security Events</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Monitor login attempts, 2FA events, and security incidents across the platform
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur space-y-4">
        {/* Event Type Filter */}
        <div>
          <label
            htmlFor="eventType"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
          >
            Event Type
          </label>
          <select
            id="eventType"
            value={filters.eventType || ''}
            onChange={e => {
              setFilters(f => ({
                ...f,
                eventType: e.target.value ? (e.target.value as SecurityEventType) : undefined,
              }))
              setPage(0)
            }}
            className="block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 px-3 text-zinc-900 dark:text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Event Types</option>
            {Object.entries(EVENT_TYPE_CONFIG).map(([type, config]) => (
              <option key={type} value={type}>
                {config.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search Filters */}
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
              htmlFor="ipAddress"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              IP Address
            </label>
            <input
              id="ipAddress"
              type="text"
              value={filters.ipAddress}
              onChange={e => {
                setFilters(f => ({ ...f, ipAddress: e.target.value }))
                setPage(0)
              }}
              placeholder="Search by IP address..."
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
        Showing {events.length} of {total} security events
      </div>

      {/* Events Timeline */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm overflow-hidden backdrop-blur">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 dark:border-emerald-400 border-r-transparent"></div>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Loading security events...
            </p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-600 dark:text-red-400">Error loading events: {error.message}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
            {hasActiveFilters
              ? 'No events found matching your filters'
              : 'No security events recorded yet'}
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {events.map((event) => (
              <SecurityEventItem key={event.id} event={event} formatDate={formatDate} />
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

import React, { useState } from 'react'
import { useLimit, useLimits } from '../hooks/use-plan'
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { UpgradeModal } from './upgrade-modal'

function usageBorderClass(isAtLimit: boolean, shouldWarn: boolean) {
  if (isAtLimit) return 'border-red-300 bg-red-50'
  if (shouldWarn) return 'border-yellow-300 bg-yellow-50'
  return 'border-gray-200 bg-white'
}

function usageTextClass(isAtLimit: boolean, shouldWarn: boolean) {
  if (isAtLimit) return 'text-red-800'
  if (shouldWarn) return 'text-yellow-800'
  return 'text-gray-900'
}

function usageSubTextClass(isAtLimit: boolean, shouldWarn: boolean) {
  if (isAtLimit) return 'text-red-700'
  if (shouldWarn) return 'text-yellow-700'
  return 'text-gray-600'
}

function usageBarClass(isAtLimit: boolean, shouldWarn: boolean) {
  if (isAtLimit) return 'bg-red-500'
  if (shouldWarn) return 'bg-yellow-500'
  return 'bg-blue-500'
}

function UsageIcon({
  isAtLimit,
  shouldWarn,
}: Readonly<{ isAtLimit: boolean; shouldWarn: boolean }>) {
  if (isAtLimit) return <ExclamationTriangleIcon className="mr-3 h-5 w-5 text-red-500" />
  if (shouldWarn) return <ExclamationTriangleIcon className="mr-3 h-5 w-5 text-yellow-500" />
  return <InformationCircleIcon className="mr-3 h-5 w-5 text-gray-400" />
}

interface UsageLimitWarningProps {
  readonly limitKey: string
  readonly currentValue: number
  readonly warningThreshold?: number // Show warning when usage reaches this % (default 80)
  readonly label?: string
  readonly showBar?: boolean
}

/**
 * Component that displays usage and warns when approaching limit
 *
 * @example
 * ```tsx
 * <UsageLimitWarning
 *   limitKey="max_projects"
 *   currentValue={projectCount}
 *   warningThreshold={80}
 *   label="Projects"
 *   showBar={true}
 * />
 * ```
 */
export function UsageLimitWarning({
  limitKey,
  currentValue,
  warningThreshold = 80,
  label,
  showBar = true,
}: UsageLimitWarningProps) {
  const [showUpgrade, setShowUpgrade] = useState(false)
  const { limit, hasLimit, isAtLimit, remaining, percentUsed } = useLimit(limitKey, currentValue)

  // Don't show anything if no limit exists (unlimited)
  if (!hasLimit || limit === -1) {
    return null
  }

  const shouldWarn = percentUsed >= warningThreshold
  const displayLabel = label || limitKey.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase())

  return (
    <>
      <div className={`rounded-lg border p-4 ${usageBorderClass(isAtLimit, shouldWarn)}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start">
            <UsageIcon isAtLimit={isAtLimit} shouldWarn={shouldWarn} />
            <div className="flex-1">
              <h4 className={`text-sm font-medium ${usageTextClass(isAtLimit, shouldWarn)}`}>
                {displayLabel}
              </h4>
              <p className={`mt-1 text-sm ${usageSubTextClass(isAtLimit, shouldWarn)}`}>
                {currentValue} of {limit} used
                {!isAtLimit && remaining > 0 && (
                  <span className="ml-1">({remaining} remaining)</span>
                )}
              </p>

              {showBar && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full transition-all ${usageBarClass(isAtLimit, shouldWarn)}`}
                    style={{ width: `${Math.min(100, percentUsed)}%` }}
                  />
                </div>
              )}

              {isAtLimit && (
                <p className="mt-2 text-sm font-medium text-red-800">
                  Limit reached. Upgrade your plan to continue.
                </p>
              )}
            </div>
          </div>

          {(isAtLimit || shouldWarn) && (
            <button
              onClick={() => setShowUpgrade(true)}
              className={`ml-3 inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isAtLimit
                  ? 'bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600'
                  : 'bg-yellow-600 text-white hover:bg-yellow-500 focus-visible:outline-yellow-600'
              }`}
            >
              Upgrade
            </button>
          )}
        </div>
      </div>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason={`You're using ${currentValue} of ${limit} ${displayLabel.toLowerCase()}. Upgrade to increase your limit.`}
      />
    </>
  )
}

interface MultiUsageLimitWarningProps {
  readonly limits: Record<string, number> // limitKey -> currentValue
  readonly warningThreshold?: number
  readonly showBars?: boolean
}

/**
 * Component that displays multiple usage limits at once
 *
 * @example
 * ```tsx
 * <MultiUsageLimitWarning
 *   limits={{
 *     max_projects: projectCount,
 *     max_team_members: teamSize,
 *     max_storage_gb: storageUsedGB,
 *   }}
 *   warningThreshold={80}
 * />
 * ```
 */
export function MultiUsageLimitWarning({
  limits,
  warningThreshold = 80,
  showBars = true,
}: MultiUsageLimitWarningProps) {
  const limitData = useLimits(limits)

  // Filter to only show limits that exist and are being tracked
  const trackedLimits = Object.entries(limitData).filter(
    ([_, data]) => data.hasLimit && data.limit !== -1,
  )

  if (trackedLimits.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {trackedLimits.map(([key, data]) => (
        <UsageLimitWarning
          key={key}
          limitKey={key}
          currentValue={limits[key]}
          warningThreshold={warningThreshold}
          showBar={showBars}
        />
      ))}
    </div>
  )
}

/**
 * Compact badge showing usage for a specific limit
 *
 * @example
 * ```tsx
 * <UsageBadge limitKey="max_api_calls" currentValue={apiCallCount} />
 * ```
 */
export function UsageBadge({
  limitKey,
  currentValue,
}: {
  readonly limitKey: string
  readonly currentValue: number
}) {
  const { limit, hasLimit, isAtLimit, percentUsed } = useLimit(limitKey, currentValue)

  if (!hasLimit || limit === -1) {
    return null
  }

  let colorClass = 'bg-gray-100 text-gray-700'
  if (isAtLimit) colorClass = 'bg-red-100 text-red-700'
  else if (percentUsed >= 80) colorClass = 'bg-yellow-100 text-yellow-700'

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${colorClass}`}
    >
      {currentValue}/{limit}
    </span>
  )
}

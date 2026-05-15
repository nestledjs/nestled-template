import React, { ReactNode } from 'react'
import { useSubscription, useHasFeature } from '../hooks/use-subscription'
import { useLimit } from '../hooks/use-plan'
import { Link } from 'react-router'
import { LockClosedIcon } from '@heroicons/react/24/outline'

interface RequirePlanProps {
  children: ReactNode
  fallback?: ReactNode
  feature?: string
  features?: string[]
  requireAll?: boolean
  message?: string
}

/**
 * Component that requires specific plan features to render children
 *
 * @example Require single feature
 * ```tsx
 * <RequirePlan feature="advanced_reports">
 *   <AdvancedReportsPage />
 * </RequirePlan>
 * ```
 *
 * @example Require multiple features (all)
 * ```tsx
 * <RequirePlan features={['api_access', 'webhooks']} requireAll={true}>
 *   <APIWebhooksSettings />
 * </RequirePlan>
 * ```
 *
 * @example Require any feature
 * ```tsx
 * <RequirePlan features={['feature_a', 'feature_b']} requireAll={false}>
 *   <ConditionalFeature />
 * </RequirePlan>
 * ```
 */
export function RequirePlan({
  children,
  fallback,
  feature,
  features,
  requireAll = true,
  message = 'This feature requires a higher plan',
}: RequirePlanProps) {
  const { isLoading, plan } = useSubscription()

  // Determine if user has required features
  let hasRequiredFeatures = true

  if (feature) {
    hasRequiredFeatures = useHasFeature(feature)
  } else if (features && features.length > 0) {
    if (requireAll) {
      hasRequiredFeatures = features.every(f => {
        const hasIt = useHasFeature(f)
        return hasIt
      })
    } else {
      hasRequiredFeatures = features.some(f => {
        const hasIt = useHasFeature(f)
        return hasIt
      })
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Checking plan access...</div>
      </div>
    )
  }

  if (!hasRequiredFeatures) {
    if (fallback) {
      return <>{fallback}</>
    }

    return (
      <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <LockClosedIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800">Upgrade Required</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>{message}</p>
              {plan && (
                <p className="mt-1">
                  Current plan: <strong>{plan.name}</strong>
                </p>
              )}
            </div>
            <div className="mt-4">
              <Link
                to="/settings/billing"
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Upgrade Plan
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * Inline variant that renders nothing if plan doesn't have feature
 */
export function RequirePlanInline({
  children,
  feature,
  features,
  requireAll = true,
}: {
  children: ReactNode
  feature?: string
  features?: string[]
  requireAll?: boolean
}) {
  const { isLoading } = useSubscription()

  let hasRequiredFeatures = true

  if (feature) {
    hasRequiredFeatures = useHasFeature(feature)
  } else if (features && features.length > 0) {
    if (requireAll) {
      hasRequiredFeatures = features.every(f => useHasFeature(f))
    } else {
      hasRequiredFeatures = features.some(f => useHasFeature(f))
    }
  }

  if (isLoading || !hasRequiredFeatures) return null

  return <>{children}</>
}

interface RequireLimitProps {
  children: ReactNode
  fallback?: ReactNode
  limitKey: string
  currentValue: number
  message?: string
}

/**
 * Component that checks if usage is within plan limits
 *
 * @example
 * ```tsx
 * <RequireLimit limitKey="max_projects" currentValue={projectCount}>
 *   <CreateProjectButton />
 * </RequireLimit>
 * ```
 */
export function RequireLimit({
  children,
  fallback,
  limitKey,
  currentValue,
  message,
}: RequireLimitProps) {
  const { isLoading } = useSubscription()
  const { isWithin, limit, hasLimit } = useLimit(limitKey, currentValue)

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Checking limits...</div>
      </div>
    )
  }

  if (!isWithin) {
    if (fallback) {
      return <>{fallback}</>
    }

    const defaultMessage = hasLimit
      ? `You've reached the limit of ${limit} for this feature`
      : 'Limit reached'

    return (
      <div className="rounded-lg border-2 border-red-200 bg-red-50 p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <LockClosedIcon className="h-6 w-6 text-red-600" />
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-red-800">Limit Reached</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{message || defaultMessage}</p>
            </div>
            <div className="mt-4">
              <Link
                to="/settings/billing"
                className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                Upgrade Plan
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * Inline variant that renders nothing if limit is exceeded
 */
export function RequireLimitInline({
  children,
  limitKey,
  currentValue,
}: {
  children: ReactNode
  limitKey: string
  currentValue: number
}) {
  const { isLoading } = useSubscription()
  const { isWithin } = useLimit(limitKey, currentValue)

  if (isLoading || !isWithin) return null

  return <>{children}</>
}

import React, { ReactNode } from 'react'
import { useSubscription } from '../hooks/use-subscription'
import { Link } from 'react-router'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface RequireSubscriptionProps {
  children: ReactNode
  fallback?: ReactNode
  allowTrial?: boolean
  message?: string
}

/**
 * Component that requires an active subscription to render children
 *
 * @example
 * ```tsx
 * <RequireSubscription>
 *   <PremiumFeature />
 * </RequireSubscription>
 * ```
 *
 * @example With trial allowed
 * ```tsx
 * <RequireSubscription allowTrial={true}>
 *   <TrialOrPaidFeature />
 * </RequireSubscription>
 * ```
 *
 * @example With custom fallback
 * ```tsx
 * <RequireSubscription fallback={<CustomUpgradePrompt />}>
 *   <PremiumFeature />
 * </RequireSubscription>
 * ```
 */
export function RequireSubscription({
  children,
  fallback,
  allowTrial = true,
  message = 'This feature requires an active subscription',
}: RequireSubscriptionProps) {
  const { hasActiveSubscription, isTrialing, isLoading, subscription } = useSubscription()

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Loading subscription status...</div>
      </div>
    )
  }

  // Check subscription status
  const hasAccess = allowTrial ? hasActiveSubscription : hasActiveSubscription && !isTrialing

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>
    }

    return (
      <div className="rounded-lg border-2 border-yellow-200 bg-yellow-50 p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" />
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-yellow-800">Subscription Required</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>{message}</p>
            </div>
            <div className="mt-4">
              <Link
                to="/settings/billing"
                className="inline-flex items-center rounded-md bg-yellow-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-600"
              >
                View Plans
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
 * Inline variant that renders nothing if no subscription
 */
export function RequireSubscriptionInline({ children, allowTrial = true }: { children: ReactNode; allowTrial?: boolean }) {
  const { hasActiveSubscription, isTrialing, isLoading } = useSubscription()

  if (isLoading) return null

  const hasAccess = allowTrial ? hasActiveSubscription : hasActiveSubscription && !isTrialing

  if (!hasAccess) return null

  return <>{children}</>
}

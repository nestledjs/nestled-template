import React, { useState } from 'react'
import { Link } from 'react-router'
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useSubscription } from '../hooks/use-subscription'

/**
 * Global banner that shows subscription status alerts
 *
 * Shows warnings for:
 * - Trial ending soon
 * - Payment failed (past_due)
 * - Subscription canceled
 * - No active subscription (optional)
 */
export function SubscriptionStatusBanner({
  showNoSubscriptionWarning = false,
}: {
  readonly showNoSubscriptionWarning?: boolean
}) {
  const [dismissed, setDismissed] = useState(false)
  const { hasActiveSubscription, isTrialing, isCanceled, isPastDue, trialEndsAt, periodEndsAt } =
    useSubscription()

  // Don't show if dismissed
  if (dismissed) return null

  // Calculate days until trial ends
  const getDaysUntilTrialEnd = () => {
    if (!trialEndsAt) return null
    const now = new Date()
    const diff = trialEndsAt.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return Math.max(days, 0)
  }

  // Calculate days until access ends (for canceled subscriptions)
  const getDaysUntilAccessEnd = () => {
    if (!periodEndsAt) return null
    const now = new Date()
    const diff = periodEndsAt.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return Math.max(days, 0)
  }

  const daysUntilTrialEnd = getDaysUntilTrialEnd()
  const daysUntilAccessEnd = getDaysUntilAccessEnd()

  // Determine which banner to show (priority order)
  let bannerType: 'error' | 'warning' | 'info' | null = null
  let icon: React.ReactNode = null
  let message: React.ReactNode = null
  let action: React.ReactNode = null

  // 1. Past Due (highest priority)
  if (isPastDue) {
    bannerType = 'error'
    icon = <XCircleIcon className="h-5 w-5" />
    message = (
      <>
        <strong>Payment Failed:</strong> Your last payment was unsuccessful. Please update your
        payment method to avoid service interruption.
      </>
    )
    action = (
      <Link to="/settings/billing" className="whitespace-nowrap font-semibold hover:underline">
        Update Payment →
      </Link>
    )
  }
  // 2. Subscription Canceled
  else if (isCanceled && daysUntilAccessEnd !== null) {
    bannerType = 'warning'
    icon = <ExclamationTriangleIcon className="h-5 w-5" />
    message = (
      <>
        <strong>Subscription Canceled:</strong> Your access will end in {daysUntilAccessEnd}{' '}
        {daysUntilAccessEnd === 1 ? 'day' : 'days'} on {periodEndsAt?.toLocaleDateString()}.
      </>
    )
    action = (
      <Link to="/settings/billing" className="whitespace-nowrap font-semibold hover:underline">
        Reactivate →
      </Link>
    )
  }
  // 3. Trial Ending Soon (7 days or less)
  else if (isTrialing && daysUntilTrialEnd !== null && daysUntilTrialEnd <= 7) {
    bannerType = 'info'
    icon = <InformationCircleIcon className="h-5 w-5" />
    message = (
      <>
        <strong>Trial Ending Soon:</strong> Your trial ends in {daysUntilTrialEnd}{' '}
        {daysUntilTrialEnd === 1 ? 'day' : 'days'}.{' '}
        {daysUntilTrialEnd === 0 ? 'Subscribe today' : 'Subscribe now'} to keep your access.
      </>
    )
    action = (
      <Link to="/settings/billing" className="whitespace-nowrap font-semibold hover:underline">
        Subscribe Now →
      </Link>
    )
  }
  // 4. No Active Subscription (optional, lowest priority)
  else if (!hasActiveSubscription && showNoSubscriptionWarning) {
    bannerType = 'info'
    icon = <InformationCircleIcon className="h-5 w-5" />
    message = (
      <>
        <strong>Free Plan:</strong> You're currently on the free plan. Upgrade to unlock premium
        features and remove limitations.
      </>
    )
    action = (
      <Link to="/pricing" className="whitespace-nowrap font-semibold hover:underline">
        View Plans →
      </Link>
    )
  }

  // Don't render if no banner to show
  if (!bannerType) return null

  const styles = {
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-500/30',
      text: 'text-red-800 dark:text-red-200',
      icon: 'text-red-600 dark:text-red-400',
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-500/30',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: 'text-yellow-600 dark:text-yellow-400',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-500/30',
      text: 'text-blue-800 dark:text-blue-200',
      icon: 'text-blue-600 dark:text-blue-400',
    },
  }

  const style = styles[bannerType]

  return (
    <div className={`${style.bg} border-b ${style.border}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`flex-shrink-0 ${style.icon}`}>{icon}</div>
            <p className={`text-sm ${style.text} flex-1 min-w-0`}>{message}</p>
            {action && (
              <div className={`flex-shrink-0 hidden sm:block ${style.text}`}>{action}</div>
            )}
          </div>
          <button
            onClick={() => setDismissed(true)}
            className={`flex-shrink-0 ${style.icon} hover:opacity-70 transition-opacity`}
            aria-label="Dismiss"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        {/* Mobile action button */}
        {action && <div className={`sm:hidden pb-3 ${style.text}`}>{action}</div>}
      </div>
    </div>
  )
}

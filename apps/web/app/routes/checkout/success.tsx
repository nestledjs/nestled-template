import React, { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { useSubscription } from '@nestled-template/web'

type WindowWithGtag = typeof globalThis & {
  gtag?: (...args: unknown[]) => void
}

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { subscription, plan } = useSubscription()

  // Optional: You could fetch the session details from Stripe here if needed
  useEffect(() => {
    // Track conversion event for analytics
    const trackingWindow = globalThis as WindowWithGtag
    if (trackingWindow.gtag) {
      trackingWindow.gtag('event', 'purchase', {
        transaction_id: sessionId,
        value: plan?.price || 0,
        currency: 'USD',
        items: [
          {
            item_id: plan?.id,
            item_name: plan?.name,
          },
        ],
      })
    }
  }, [sessionId, plan])

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-emerald-900/20 dark:via-green-900/20 dark:to-teal-900/20 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12 text-center">
          {/* Success Icon */}
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>

          {/* Success Message */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome Aboard!
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Your subscription has been successfully activated.
          </p>

          {/* Subscription Details */}
          {plan && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Subscription Details
              </h2>
              <div className="space-y-3 text-left">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Plan:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Price:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    ${Number.parseFloat(plan.price || '0').toFixed(2)}/{plan.interval}
                  </span>
                </div>
                {subscription?.trialEnd && new Date(subscription.trialEnd) > new Date() && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Trial Ends:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {new Date(subscription.trialEnd).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              What's Next?
            </h3>
            <ul className="text-left space-y-3 text-gray-600 dark:text-gray-400">
              <li className="flex items-start">
                <span className="inline-block w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-sm font-semibold mr-3 flex-shrink-0">
                  1
                </span>
                <span>Explore all the premium features now available to you</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-sm font-semibold mr-3 flex-shrink-0">
                  2
                </span>
                <span>Check your email for your receipt and subscription confirmation</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-sm font-semibold mr-3 flex-shrink-0">
                  3
                </span>
                <span>Manage your subscription anytime from your billing settings</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/members/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-lg transition-colors"
            >
              Go to Dashboard
            </Link>
            <Link
              to="/settings/billing"
              className="inline-flex items-center justify-center px-6 py-3 border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors"
            >
              View Billing Settings
            </Link>
          </div>

          {/* Session ID (for reference) */}
          {sessionId && <p className="mt-8 text-xs text-gray-400">Session ID: {sessionId}</p>}
        </div>
      </div>
    </div>
  )
}

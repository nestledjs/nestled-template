import React from 'react'
import { Link } from 'react-router'
import { XCircleIcon } from '@heroicons/react/24/outline'

export default function CheckoutCancel() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50 to-red-50 dark:from-gray-900 dark:via-orange-900/20 dark:to-red-900/20 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12 text-center">
          {/* Cancel Icon */}
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              <XCircleIcon className="w-12 h-12 text-orange-600 dark:text-orange-400" />
            </div>
          </div>

          {/* Cancel Message */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Checkout Canceled
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Your subscription purchase was not completed. No charges have been made.
          </p>

          {/* Information Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 mb-8 text-left">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">What happened?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You closed the checkout page before completing your purchase. This could be because:
            </p>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400 list-disc list-inside">
              <li>You decided to review the plans again</li>
              <li>You needed to verify payment details</li>
              <li>You accidentally closed the window</li>
            </ul>
          </div>

          {/* Next Steps */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              What would you like to do?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Try Again</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Ready to subscribe? View our plans and complete your purchase.
                </p>
                <Link
                  to="/pricing"
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  View Plans →
                </Link>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Need Help?</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Have questions about our plans or payment options?
                </p>
                <a
                  href="mailto:support@example.com"
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  Contact Support →
                </a>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-lg transition-colors"
            >
              View Plans
            </Link>
            <Link
              to="/members/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>

          {/* Reassurance Message */}
          <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Don't worry!</strong> You can subscribe at any time. All your data is safe and
              waiting for you.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

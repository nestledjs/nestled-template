import React, { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useQuery, useMutation } from '@apollo/client/react'
import {
  ActivePlans,
  CreateCheckoutSession,
  type ActivePlansQuery,
  type CreateCheckoutSessionMutation
} from '@nestled-template/shared/sdk'
import { useSubscription } from '../hooks/use-subscription'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature?: string
  reason?: string
}

/**
 * Modal that displays available plans and allows upgrading
 *
 * @example
 * ```tsx
 * const [showUpgrade, setShowUpgrade] = useState(false)
 *
 * <button onClick={() => setShowUpgrade(true)}>Upgrade</button>
 *
 * <UpgradeModal
 *   isOpen={showUpgrade}
 *   onClose={() => setShowUpgrade(false)}
 *   feature="Advanced Reports"
 *   reason="Access advanced analytics and custom reports"
 * />
 * ```
 */
export function UpgradeModal({ isOpen, onClose, feature, reason }: UpgradeModalProps) {
  const { plan: currentPlan } = useSubscription()
  const { data, loading } = useQuery<ActivePlansQuery>(ActivePlans)
  const [createCheckout, { loading: checkoutLoading }] = useMutation<CreateCheckoutSessionMutation>(CreateCheckoutSession)

  const plans = data?.plans || []

  const handleUpgrade = async (stripePriceId: string) => {
    try {
      const { data } = await createCheckout({
        variables: { priceId: stripePriceId },
      })

      if (data?.createCheckoutSession) {
        // Redirect to Stripe Checkout
        window.location.href = data.createCheckoutSession
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error)
      alert('Failed to start checkout. Please try again.')
    }
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6">
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                    <Dialog.Title as="h3" className="text-2xl font-semibold leading-6 text-gray-900">
                      Upgrade Your Plan
                    </Dialog.Title>

                    {feature && (
                      <div className="mt-4 rounded-md bg-blue-50 p-4">
                        <p className="text-sm font-medium text-blue-800">
                          Unlock: {feature}
                        </p>
                        {reason && (
                          <p className="mt-1 text-sm text-blue-700">{reason}</p>
                        )}
                      </div>
                    )}

                    {currentPlan && (
                      <div className="mt-4">
                        <p className="text-sm text-gray-600">
                          Current plan: <strong>{currentPlan.name}</strong>
                        </p>
                      </div>
                    )}

                    <div className="mt-6">
                      {loading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="text-sm text-gray-500">Loading plans...</div>
                        </div>
                      ) : plans.length === 0 ? (
                        <div className="rounded-md bg-yellow-50 p-4">
                          <p className="text-sm text-yellow-800">No plans available at this time.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {plans.map((plan: any) => {
                            const isCurrentPlan = currentPlan?.id === plan.id
                            const features = Array.isArray(plan.features)
                              ? plan.features
                              : typeof plan.features === 'object'
                              ? Object.keys(plan.features || {})
                              : []

                            return (
                              <div
                                key={plan.id}
                                className={`relative rounded-lg border-2 p-6 ${
                                  isCurrentPlan
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 bg-white'
                                }`}
                              >
                                {isCurrentPlan && (
                                  <div className="absolute right-4 top-4">
                                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                                      Current
                                    </span>
                                  </div>
                                )}

                                <div className="mb-4">
                                  <h4 className="text-lg font-semibold text-gray-900">{plan.name}</h4>
                                  {plan.description && (
                                    <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
                                  )}
                                </div>

                                <div className="mb-4">
                                  <span className="text-3xl font-bold text-gray-900">
                                    ${parseFloat(plan.price || '0').toFixed(2)}
                                  </span>
                                  <span className="text-gray-500">/{plan.interval}</span>
                                </div>

                                {plan.trialPeriodDays && plan.trialPeriodDays > 0 && (
                                  <div className="mb-4">
                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                                      {plan.trialPeriodDays} day free trial
                                    </span>
                                  </div>
                                )}

                                {features.length > 0 && (
                                  <ul className="mb-6 space-y-2">
                                    {features.slice(0, 5).map((feat: string, idx: number) => (
                                      <li key={idx} className="flex items-start">
                                        <CheckIcon className="mr-2 h-5 w-5 flex-shrink-0 text-green-500" />
                                        <span className="text-sm text-gray-600">{feat}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                <button
                                  onClick={() => handleUpgrade(plan.stripePriceId)}
                                  disabled={isCurrentPlan || checkoutLoading}
                                  className={`w-full rounded-md px-4 py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                                    isCurrentPlan
                                      ? 'cursor-not-allowed bg-gray-300 text-gray-500'
                                      : 'bg-blue-600 text-white hover:bg-blue-500 focus-visible:outline-blue-600'
                                  }`}
                                >
                                  {isCurrentPlan ? 'Current Plan' : checkoutLoading ? 'Loading...' : 'Select Plan'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

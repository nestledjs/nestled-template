import React from 'react'
import { Link } from 'react-router'
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery } from '@apollo/client/react'
import {
  AvailablePlans,
  CreateCheckoutSession,
  type AvailablePlansQuery,
  type CreateCheckoutSessionMutation,
} from '@nestled-template/shared/sdk'
import { useSubscription, useGlobalCtx } from '@nestled-template/web'

type PricingFeature = {
  name: string
  included: boolean
}

export default function PricingPage() {
  const { user } = useGlobalCtx()
  const { plan: currentPlan } = useSubscription()
  const { data, loading } = useQuery<AvailablePlansQuery>(AvailablePlans)
  const [createCheckoutSession, { loading: checkoutLoading }] =
    useMutation<CreateCheckoutSessionMutation>(CreateCheckoutSession)

  const plans = data?.plans || []

  const getButtonText = (checkoutLoading: boolean, isCurrent: boolean, user: unknown) => {
    if (checkoutLoading) return 'Loading...'
    if (isCurrent) return 'Current Plan'
    return user ? 'Subscribe Now' : 'Get Started'
  }

  const handleSubscribe = async (stripePriceId: string) => {
    if (!user) {
      // Redirect to login with return URL
      globalThis.location.href = `/login?returnTo=/pricing`
      return
    }

    try {
      const { data } = await createCheckoutSession({
        variables: { priceId: stripePriceId },
      })

      if (data?.createCheckoutSession) {
        globalThis.location.href = data.createCheckoutSession
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error)
      alert('Failed to start checkout. Please try again.')
    }
  }

  const isCurrentPlan = (planId: string) => {
    return currentPlan?.id === planId
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 flex items-center justify-center px-4">
      <div className="container mx-auto py-16 sm:px-6 lg:px-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-zinc-700 dark:text-zinc-300 max-w-2xl mx-auto">
            Select the perfect plan for your needs. All plans include our core features.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-zinc-600 dark:text-zinc-400">Loading plans...</div>
          </div>
        )}

        {/* No Plans */}
        {!loading && plans.length === 0 && (
          <div className="max-w-2xl mx-auto text-center py-20">
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-left shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-2xl">
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                No Plans Available
              </h3>
              <p className="text-zinc-700 dark:text-zinc-300">
                Plans are being configured. Please check back soon.
              </p>
              <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">
                  Site owners: configure Stripe pricing
                </h4>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-emerald-900/80 dark:text-emerald-50/90">
                  <li>Create products and recurring prices in your Stripe dashboard.</li>
                  <li>
                    Add the Stripe product and price IDs to your local plan seed data or admin
                    plans.
                  </li>
                  <li>
                    Set the required Stripe environment variables, then run the billing sync or seed
                    workflow for this template.
                  </li>
                  <li>
                    Confirm each active plan has a `stripePriceId`; plans without one cannot start
                    checkout.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Plans Grid */}
        {!loading && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {plans.map(plan => {
              const isCurrent = isCurrentPlan(plan.id)
              let features: PricingFeature[]
              if (Array.isArray(plan.features)) {
                features = plan.features.map(feature =>
                  typeof feature === 'object' && feature !== null
                    ? {
                        name: 'name' in feature ? String(feature.name) : String(feature),
                        included: 'included' in feature ? feature.included === true : true,
                      }
                    : { name: String(feature), included: true },
                )
              } else if (typeof plan.features === 'object') {
                features = Object.entries(plan.features).map(([key, value]) => ({
                  name: key.replaceAll('_', ' ').replaceAll(/\b\w/g, char => char.toUpperCase()),
                  included: value === true,
                }))
              } else {
                features = []
              }

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-xl ${
                    isCurrent
                      ? 'border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-50 to-emerald-100/70 dark:from-emerald-500/10 dark:to-emerald-500/5'
                      : 'border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5'
                  } p-8 shadow-xl backdrop-blur transition-all hover:shadow-emerald-500/10 dark:shadow-2xl`}
                >
                  {isCurrent && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                        Current Plan
                      </span>
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className="mb-8">
                    <h3 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-2">
                      {plan.name}
                    </h3>
                    {plan.description && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{plan.description}</p>
                    )}
                  </div>

                  {/* Pricing */}
                  <div className="mb-8">
                    <div className="flex items-baseline">
                      <span className="text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                        ${Number.parseFloat(plan.price || '0').toFixed(0)}
                      </span>
                      <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                        /{plan.interval}
                      </span>
                    </div>
                    {plan.trialPeriodDays && plan.trialPeriodDays > 0 && (
                      <p className="mt-2 text-sm text-emerald-300 font-medium">
                        {plan.trialPeriodDays}-day free trial
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-4 mb-8">
                    {Array.isArray(features) ? (
                      features.map(feature => {
                        const isIncluded = feature.included
                        const featureName = feature.name

                        return (
                          <li key={featureName} className="flex items-start">
                            {isIncluded ? (
                              <CheckIcon className="h-5 w-5 text-emerald-300 flex-shrink-0 mr-3" />
                            ) : (
                              <XMarkIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-600 flex-shrink-0 mr-3" />
                            )}
                            <span
                              className={`text-sm ${
                                isIncluded ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-500'
                              }`}
                            >
                              {featureName}
                            </span>
                          </li>
                        )
                      })
                    ) : (
                      <li className="text-sm text-zinc-500 italic">No features listed</li>
                    )}
                  </ul>

                  {/* CTA Button */}
                  <button
                    onClick={() => plan.stripePriceId && handleSubscribe(plan.stripePriceId)}
                    disabled={isCurrent || checkoutLoading || !plan.stripePriceId}
                    className={`w-full rounded-lg py-2.5 px-5 font-semibold text-center transition ${
                      isCurrent
                        ? 'border border-zinc-200 bg-zinc-100 text-zinc-500 cursor-not-allowed dark:border-white/10 dark:bg-white/5 dark:text-zinc-400'
                        : 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400'
                    }`}
                  >
                    {getButtonText(checkoutLoading, isCurrent, user)}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* FAQ or Additional Info */}
        <div className="mt-20 max-w-4xl mx-auto">
          <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-2xl">
            <h3 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-6 text-center">
              Frequently Asked Questions
            </h3>
            <dl className="space-y-6">
              <div>
                <dt className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                  Can I change plans later?
                </dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  Yes! You can upgrade or downgrade your plan at any time from your billing
                  settings.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                  What payment methods do you accept?
                </dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  We accept all major credit cards and debit cards through our secure payment
                  processor, Stripe.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                  Can I cancel anytime?
                </dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  Yes, you can cancel your subscription at any time. You'll retain access until the
                  end of your billing period.
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Bottom CTA */}
        {!user && (
          <div className="mt-16 text-center">
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">Already have an account?</p>
            <Link
              to="/login"
              className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 inline-flex items-center"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

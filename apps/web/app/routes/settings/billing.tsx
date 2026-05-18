import React, { useState } from 'react'
import { Link } from 'react-router'
import { CreditCardIcon, ArrowUpIcon, BanknotesIcon } from '@heroicons/react/24/outline'
import { useMutation } from '@apollo/client/react'
import {
  RequireOwner,
  useSubscription,
  useLimit,
  UpgradeModal,
  useGlobalCtx,
} from '@nestled-template/web'
import {
  CreatePortalSession,
  CancelSubscription,
  type CreatePortalSessionMutation,
  type CancelSubscriptionMutation,
} from '@nestled-template/shared/sdk'

type OrganizationWithMemberCount = {
  _count?: {
    members?: number | null
  } | null
}

// Helper function to determine progress bar color based on usage
const getProgressBarColor = (isAtLimit: boolean, percentUsed: number) => {
  if (isAtLimit) return 'bg-rose-500'
  if (percentUsed >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export default function BillingSettings() {
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  const { activeOrganization } = useGlobalCtx()
  const {
    plan,
    hasActiveSubscription,
    isTrialing,
    isCanceled,
    isPastDue,
    periodEndsAt,
    trialEndsAt,
  } = useSubscription()

  const [createPortalSession] = useMutation<CreatePortalSessionMutation>(CreatePortalSession)
  const [cancelSubscription] = useMutation<CancelSubscriptionMutation>(CancelSubscription)

  // Get usage limits
  const memberCount =
    (activeOrganization as OrganizationWithMemberCount | null)?._count?.members || 0
  const teamMemberLimit = useLimit('max_team_members', memberCount)
  const storageLimit = useLimit('max_storage_gb', 0) // FUTURE: Implement storage tracking

  const handleManageBilling = async () => {
    setPortalLoading(true)
    try {
      const { data } = await createPortalSession()
      if (data?.createPortalSession) {
        globalThis.location.href = data.createPortalSession
      }
    } catch (error) {
      console.error('Failed to create portal session:', error)
      alert('Failed to open billing portal. Please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (
      !globalThis.confirm(
        'Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.',
      )
    ) {
      return
    }

    setCancelLoading(true)
    try {
      await cancelSubscription()
      alert('Subscription canceled. You will retain access until the end of your billing period.')
    } catch (error) {
      console.error('Failed to cancel subscription:', error)
      alert('Failed to cancel subscription. Please try again.')
    } finally {
      setCancelLoading(false)
    }
  }

  const getPlanStatus = () => {
    if (isPastDue) return 'past_due'
    if (isCanceled) return 'canceled'
    if (isTrialing) return 'trialing'
    if (hasActiveSubscription) return 'active'
    return 'inactive'
  }

  const getStatusBadge = () => {
    const status = getPlanStatus()
    const badges = {
      active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      trialing: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
      past_due: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
      canceled: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      inactive:
        'border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400',
    }
    return badges[status] || badges.inactive
  }

  return (
    <RequireOwner
      fallback={
        <div className="rounded-xl border border-amber-500/20 bg-white dark:bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-3">
              <CreditCardIcon className="h-6 w-6 text-amber-500 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-300">
                Permission Required
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                Only organization owners can manage billing settings.
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-3">
              <CreditCardIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                Billing & Subscription
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Manage your subscription, payment methods, and invoices
              </p>
            </div>
          </div>
        </div>

        {/* Current Plan */}
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-2xl backdrop-blur">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Current Plan</h3>

          <div className="flex items-center justify-between p-6 rounded-lg bg-gradient-to-br from-emerald-500/5 to-sky-500/5 border border-zinc-200 dark:border-white/10">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h4 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {plan?.name || 'No Plan'}
                </h4>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${getStatusBadge()}`}
                >
                  {getPlanStatus()}
                </span>
              </div>
              {plan && (
                <>
                  <p className="text-lg text-zinc-700 dark:text-zinc-300 mt-1">
                    ${Number.parseFloat(plan.price || '0').toFixed(2)}
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      /{plan.interval}
                    </span>
                  </p>
                  {isTrialing && trialEndsAt && (
                    <p className="text-sm text-sky-600 dark:text-sky-300 mt-2">
                      Trial ends: {trialEndsAt.toLocaleDateString()}
                    </p>
                  )}
                  {periodEndsAt && !isTrialing && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                      {isCanceled ? 'Access until' : 'Next billing date'}:{' '}
                      {periodEndsAt.toLocaleDateString()}
                    </p>
                  )}
                </>
              )}
              {!plan && (
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-2">
                  You don't have an active subscription.{' '}
                  <Link
                    to="/pricing"
                    className="text-emerald-300 hover:text-emerald-200 transition"
                  >
                    Browse plans
                  </Link>
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {!isCanceled && (
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
                >
                  <ArrowUpIcon className="h-5 w-5" />
                  {hasActiveSubscription ? 'Change Plan' : 'Subscribe'}
                </button>
              )}
              {hasActiveSubscription && !isCanceled && (
                <button
                  onClick={handleCancelSubscription}
                  disabled={cancelLoading}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-5 py-2 font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {cancelLoading ? 'Canceling...' : 'Cancel Subscription'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Usage & Limits */}
        {(teamMemberLimit.hasLimit || storageLimit.hasLimit) && (
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-lg bg-sky-500/10 p-2">
                <BanknotesIcon className="h-5 w-5 text-sky-600 dark:text-sky-300" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Usage & Limits
              </h3>
            </div>

            <div className="space-y-6">
              {/* Members Usage */}
              {teamMemberLimit.hasLimit && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Team Members
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {memberCount} /{' '}
                      {teamMemberLimit.limit === -1 ? 'Unlimited' : teamMemberLimit.limit}
                    </span>
                  </div>
                  {teamMemberLimit.limit !== -1 && (
                    <>
                      <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getProgressBarColor(teamMemberLimit.isAtLimit, teamMemberLimit.percentUsed)}`}
                          style={{ width: `${Math.min(teamMemberLimit.percentUsed, 100)}%` }}
                        />
                      </div>
                      {teamMemberLimit.percentUsed >= 80 && (
                        <p
                          className={`text-xs mt-2 ${teamMemberLimit.isAtLimit ? 'text-rose-400' : 'text-amber-400'}`}
                        >
                          {teamMemberLimit.isAtLimit
                            ? 'You have reached your member limit. Upgrade to add more members.'
                            : `You are approaching your member limit (${teamMemberLimit.remaining} remaining). Consider upgrading soon.`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Storage Usage */}
              {storageLimit.hasLimit && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Storage
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      0 GB / {storageLimit.limit === -1 ? 'Unlimited' : `${storageLimit.limit} GB`}
                    </span>
                  </div>
                  {storageLimit.limit !== -1 && (
                    <div className="w-full bg-zinc-800 rounded-full h-2">
                      <div
                        className="bg-sky-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(storageLimit.percentUsed, 100)}%` }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                    Storage tracking coming soon
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stripe Customer Portal */}
        {hasActiveSubscription && (
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-2xl backdrop-blur">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
              Manage Billing
            </h3>

            <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4">
              Use the Stripe Customer Portal to manage your subscription, update payment methods,
              view invoices, and more.
            </p>

            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-white/5 px-5 py-2.5 font-semibold text-zinc-900 dark:text-white transition hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-50"
            >
              {portalLoading ? 'Loading...' : 'Open Customer Portal'}
            </button>
          </div>
        )}

        {/* No Subscription CTA */}
        {!hasActiveSubscription && (
          <div className="rounded-xl border-2 border-dashed border-zinc-300 dark:border-white/20 bg-white dark:bg-white/5 p-8 backdrop-blur text-center">
            <CreditCardIcon className="h-12 w-12 text-zinc-400 dark:text-zinc-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
              No Active Subscription
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-6 max-w-md mx-auto">
              Subscribe to a plan to unlock premium features, increase your limits, and get the most
              out of your account.
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                View Plans
              </Link>
              <button
                onClick={() => setShowUpgrade(true)}
                className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-white/5 px-5 py-2.5 font-semibold text-zinc-900 dark:text-white transition hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                Quick Subscribe
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </RequireOwner>
  )
}

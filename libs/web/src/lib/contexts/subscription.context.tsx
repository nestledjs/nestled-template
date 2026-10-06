import React, { createContext, useContext, useMemo, ReactNode } from 'react'
import { useQuery } from '@apollo/client/react'
import {
  CurrentPlan,
  CurrentSubscription,
  CurrentSubscriptionActive,
  type CurrentPlanQuery,
  type CurrentSubscriptionActiveQuery,
  type CurrentSubscriptionQuery,
} from '@nestled-template/shared/sdk'
import { useGlobalCtx } from './global.context'

type CurrentSubscriptionItem = NonNullable<CurrentSubscriptionQuery['currentSubscription']>
type CurrentSubscriptionPlan = NonNullable<CurrentSubscriptionItem['plan']>

export interface SubscriptionContextType {
  // Subscription state. `subscription`, the trial/cancel/past-due flags and the dates need billing
  // permissions: for other members they are null/false. `plan`, the feature/limit checks and
  // `hasActiveSubscription` are available to every member.
  subscription: CurrentSubscriptionItem | null
  plan: CurrentSubscriptionPlan | null
  isLoading: boolean
  error: Error | null

  // Status checks
  hasActiveSubscription: boolean
  isTrialing: boolean
  isCanceled: boolean
  isPastDue: boolean

  // Feature/limit checks
  hasFeature: (feature: string) => boolean
  checkLimit: (limitKey: string) => { limit: number; hasLimit: boolean }
  isWithinLimit: (limitKey: string, currentValue: number) => boolean

  // Dates
  trialEndsAt: Date | null
  periodEndsAt: Date | null
}

export const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)

interface SubscriptionProviderProps {
  readonly children: ReactNode
}

type BillingPermission = { subject?: string | null; action?: string | null }

/**
 * The API serves the organization's subscription only to members holding `billing:read` or
 * `billing:manage` there. Members without them do not ask for it: they read the plan
 * (`currentPlan`) and whether the subscription is active (`currentSubscriptionActive`), which any
 * member may, and see no other subscription details.
 */
function canReadBilling(
  isSuperAdmin: boolean | null | undefined,
  permissions: readonly BillingPermission[] | null | undefined,
): boolean {
  if (isSuperAdmin) return true
  return (permissions ?? []).some(
    p =>
      (p.subject === 'billing' && (p.action === 'read' || p.action === 'manage')) ||
      (p.subject === 'all' && p.action === 'manage'),
  )
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { user, activeOrganization, activeOrganizationMember } = useGlobalCtx()
  const billingReadable = canReadBilling(
    user?.isSuperAdmin,
    activeOrganizationMember?.role?.permissions,
  )

  const hasOrganization = Boolean(activeOrganization?.id)

  // Billing readers get the full subscription for the active organization.
  const detailed = useQuery<CurrentSubscriptionQuery>(CurrentSubscription, {
    skip: !hasOrganization || !billingReadable,
    fetchPolicy: 'cache-and-network',
  })
  // Everyone else gets what feature gating needs: the plan, and whether the subscription is active.
  const memberPlan = useQuery<CurrentPlanQuery>(CurrentPlan, {
    skip: !hasOrganization || billingReadable,
    fetchPolicy: 'cache-and-network',
  })
  const memberStatus = useQuery<CurrentSubscriptionActiveQuery>(CurrentSubscriptionActive, {
    skip: !hasOrganization || billingReadable,
    fetchPolicy: 'cache-and-network',
  })

  const loading = detailed.loading || memberPlan.loading || memberStatus.loading
  const error = detailed.error || memberPlan.error || memberStatus.error

  const subscription = billingReadable ? detailed.data?.currentSubscription || null : null
  const plan: CurrentSubscriptionPlan | null = billingReadable
    ? subscription?.plan || null
    : memberPlan.data?.currentPlan || null

  // Status checks. Trial, cancellation and payment state are billing details: members without
  // billing permissions only learn whether the subscription is active (ACTIVE or TRIALING).
  const hasActiveSubscription = billingReadable
    ? subscription?.status === 'ACTIVE' || subscription?.status === 'TRIALING'
    : memberStatus.data?.currentSubscriptionActive === true
  const isTrialing = subscription?.status === 'TRIALING'
  const isCanceled = subscription?.status === 'CANCELED' || subscription?.cancelAtPeriodEnd === true
  const isPastDue = subscription?.status === 'PAST_DUE'

  // Date parsing
  const trialEndsAt = subscription?.trialEnd ? new Date(subscription.trialEnd) : null
  const periodEndsAt = subscription?.stripeCurrentPeriodEnd
    ? new Date(subscription.stripeCurrentPeriodEnd)
    : null

  /**
   * Check if subscription has a specific feature
   */
  const hasFeature = (feature: string): boolean => {
    if (!plan?.features) return false

    // Features can be stored as array or JSON
    if (Array.isArray(plan.features)) {
      return plan.features.includes(feature)
    }

    // Handle JSON object format
    if (typeof plan.features === 'object') {
      return (plan.features as Record<string, unknown>)[feature] === true
    }

    return false
  }

  /**
   * Get limit value for a specific key
   */
  const checkLimit = (limitKey: string): { limit: number; hasLimit: boolean } => {
    if (!plan?.limits) {
      return { limit: 0, hasLimit: false }
    }

    // Limits stored as JSON object
    if (typeof plan.limits === 'object') {
      const limitValue = (plan.limits as Record<string, unknown>)[limitKey]
      if (typeof limitValue === 'number') {
        return { limit: limitValue, hasLimit: true }
      }
    }

    return { limit: 0, hasLimit: false }
  }

  /**
   * Check if current value is within plan limit
   */
  const isWithinLimit = (limitKey: string, currentValue: number): boolean => {
    const { limit, hasLimit } = checkLimit(limitKey)

    // No limit = unlimited
    if (!hasLimit) return true

    // Special case: -1 means unlimited
    if (limit === -1) return true

    return currentValue < limit
  }

  const value = useMemo<SubscriptionContextType>(
    () => ({
      subscription,
      plan,
      isLoading: loading,
      error: error || null,
      hasActiveSubscription,
      isTrialing,
      isCanceled,
      isPastDue,
      hasFeature,
      checkLimit,
      isWithinLimit,
      trialEndsAt,
      periodEndsAt,
    }),
    [
      subscription,
      plan,
      loading,
      error,
      hasActiveSubscription,
      isTrialing,
      isCanceled,
      isPastDue,
      trialEndsAt,
      periodEndsAt,
    ],
  )

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext)
  if (context === undefined) {
    throw new Error('useSubscriptionContext must be used within a SubscriptionProvider')
  }
  return context
}

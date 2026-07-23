import React, { createContext, useContext, useMemo, ReactNode } from 'react'
import { useQuery } from '@apollo/client/react'
import { CurrentSubscription, type CurrentSubscriptionQuery } from '@nestled-template/shared/sdk'
import { useGlobalCtx } from './global.context'

type CurrentSubscriptionItem = NonNullable<CurrentSubscriptionQuery['currentSubscription']>
type CurrentSubscriptionPlan = NonNullable<CurrentSubscriptionItem['plan']>

export interface SubscriptionContextType {
  // Subscription state
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

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { activeOrganization } = useGlobalCtx()

  // Fetch current subscription for active organization
  const { data, loading, error } = useQuery<CurrentSubscriptionQuery>(CurrentSubscription, {
    skip: !activeOrganization?.id,
    fetchPolicy: 'cache-and-network',
  })

  const subscription = data?.currentSubscription || null
  const plan = subscription?.plan || null

  // Status checks
  const hasActiveSubscription =
    subscription?.status === 'ACTIVE' || subscription?.status === 'TRIALING'
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

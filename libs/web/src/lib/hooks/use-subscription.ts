import { useContext } from 'react'
import { useSubscriptionContext } from '../contexts/subscription.context'

/**
 * Hook to check subscription status and enforce access control
 *
 * Can be used both inside and outside SubscriptionProvider.
 * Returns empty/default values when used outside the provider (e.g., on public pages).
 *
 * @example
 * ```tsx
 * const { hasActiveSubscription, isTrialing, subscription } = useSubscription()
 *
 * if (!hasActiveSubscription) {
 *   return <UpgradePrompt />
 * }
 * ```
 */
export function useSubscription() {
  // Try to get context, but don't throw if not available
  let context
  try {
    context = useSubscriptionContext()
  } catch {
    // Not in a SubscriptionProvider - return default values
    context = null
  }

  // If no context, return empty state
  if (!context) {
    return {
      subscription: null,
      plan: null,
      isLoading: false,
      error: null,
      hasActiveSubscription: false,
      isTrialing: false,
      isCanceled: false,
      isPastDue: false,
      requireActiveSubscription: () => {
        throw new Error('No subscription provider available')
      },
      trialEndsAt: null,
      periodEndsAt: null,
    }
  }

  return {
    // State
    subscription: context.subscription,
    plan: context.plan,
    isLoading: context.isLoading,
    error: context.error,

    // Status checks
    hasActiveSubscription: context.hasActiveSubscription,
    isTrialing: context.isTrialing,
    isCanceled: context.isCanceled,
    isPastDue: context.isPastDue,

    // Helpers
    requireActiveSubscription: (): boolean => {
      if (!context.hasActiveSubscription) {
        throw new Error('Active subscription required')
      }
      return true
    },

    // Dates
    trialEndsAt: context.trialEndsAt,
    periodEndsAt: context.periodEndsAt,
  }
}

/**
 * Hook to check if subscription has required feature
 *
 * Can be used both inside and outside SubscriptionProvider.
 * Returns false when used outside the provider (e.g., on public pages).
 *
 * @example
 * ```tsx
 * const hasAdvancedReports = useHasFeature('advanced_reports')
 *
 * if (!hasAdvancedReports) {
 *   return <FeatureLockedMessage feature="Advanced Reports" />
 * }
 * ```
 */
export function useHasFeature(feature: string): boolean {
  let context
  try {
    context = useSubscriptionContext()
  } catch {
    return false
  }
  return context?.hasFeature(feature) ?? false
}

/**
 * Hook to check multiple features (requires all)
 *
 * Can be used both inside and outside SubscriptionProvider.
 * Returns false when used outside the provider (e.g., on public pages).
 *
 * @example
 * ```tsx
 * const hasAllFeatures = useHasFeatures(['api_access', 'webhooks'])
 * ```
 */
export function useHasFeatures(features: string[]): boolean {
  let context
  try {
    context = useSubscriptionContext()
  } catch {
    return false
  }
  if (!context) return false
  return features.every(feature => context.hasFeature(feature))
}

/**
 * Hook to check multiple features (requires any)
 *
 * Can be used both inside and outside SubscriptionProvider.
 * Returns false when used outside the provider (e.g., on public pages).
 *
 * @example
 * ```tsx
 * const hasAnyPremiumFeature = useHasAnyFeature(['advanced_reports', 'api_access'])
 * ```
 */
export function useHasAnyFeature(features: string[]): boolean {
  let context
  try {
    context = useSubscriptionContext()
  } catch {
    return false
  }
  if (!context) return false
  return features.some(feature => context.hasFeature(feature))
}

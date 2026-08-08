import { useSubscriptionContext } from '../contexts/subscription.context'

/**
 * Hook to check plan limits and enforce usage restrictions
 *
 * @example
 * ```tsx
 * const { checkLimit, isWithinLimit } = usePlan()
 *
 * const { limit, hasLimit } = checkLimit('max_team_members')
 * const canAddMore = isWithinLimit('max_team_members', currentTeamSize)
 * ```
 */
export function usePlan() {
  const context = useSubscriptionContext()

  return {
    // Current plan
    plan: context.plan,
    isLoading: context.isLoading,

    // Limit checks
    checkLimit: context.checkLimit,
    isWithinLimit: context.isWithinLimit,

    // Feature checks
    hasFeature: context.hasFeature,

    // Helper to get limit or throw
    requireWithinLimit: (limitKey: string, currentValue: number): boolean => {
      const isWithin = context.isWithinLimit(limitKey, currentValue)
      if (!isWithin) {
        const { limit } = context.checkLimit(limitKey)
        throw new Error(`Limit exceeded: ${limitKey}. Maximum: ${limit}, Current: ${currentValue}`)
      }
      return true
    },

    // Check if plan is a specific tier
    isPlan: (planName: string): boolean => {
      return context.plan?.name?.toLowerCase() === planName.toLowerCase()
    },

    // Check if plan is one of multiple tiers
    isPlanOneOf: (planNames: string[]): boolean => {
      if (!context.plan?.name) return false
      return planNames.some(name => context.plan?.name?.toLowerCase() === name.toLowerCase())
    },
  }
}

/**
 * Hook to check a specific limit
 *
 * @example
 * ```tsx
 * const { limit, hasLimit, remaining } = useLimit('max_projects', currentProjectCount)
 *
 * if (remaining <= 0) {
 *   return <LimitReachedMessage limit={limit} />
 * }
 * ```
 */
export function useLimit(limitKey: string, currentValue = 0) {
  const context = useSubscriptionContext()
  const { limit, hasLimit } = context.checkLimit(limitKey)
  const isWithin = context.isWithinLimit(limitKey, currentValue)

  return {
    limit,
    hasLimit,
    isWithin,
    isAtLimit: !isWithin && currentValue >= limit,
    remaining: hasLimit && limit !== -1 ? Math.max(0, limit - currentValue) : Infinity,
    percentUsed: hasLimit && limit > 0 ? (currentValue / limit) * 100 : 0,
  }
}

/**
 * Hook to check multiple limits at once
 *
 * @example
 * ```tsx
 * const limits = useLimits({
 *   projects: currentProjectCount,
 *   team_members: currentTeamSize,
 * })
 *
 * if (!limits.projects.isWithin) {
 *   return <UpgradePrompt reason="Project limit reached" />
 * }
 * ```
 */
export function useLimits(currentValues: Record<string, number>) {
  const context = useSubscriptionContext()

  const limits: Record<string, ReturnType<typeof useLimit>> = {}

  Object.entries(currentValues).forEach(([key, value]) => {
    const { limit, hasLimit } = context.checkLimit(key)
    const isWithin = context.isWithinLimit(key, value)

    limits[key] = {
      limit,
      hasLimit,
      isWithin,
      isAtLimit: !isWithin && value >= limit,
      remaining: hasLimit && limit !== -1 ? Math.max(0, limit - value) : Infinity,
      percentUsed: hasLimit && limit > 0 ? (value / limit) * 100 : 0,
    }
  })

  return limits
}

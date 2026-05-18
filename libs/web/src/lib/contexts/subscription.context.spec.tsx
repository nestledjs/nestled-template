import React from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalContextProvider } from './global.context'
import { SubscriptionProvider, useSubscriptionContext } from './subscription.context'
import {
  useHasAnyFeature,
  useHasFeature,
  useHasFeatures,
  useSubscription,
} from '../hooks/use-subscription'
import { useLimit, useLimits, usePlan } from '../hooks/use-plan'

const useQuery = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}))

vi.mock('@nestled-template/shared/sdk', () => ({
  CurrentSubscription: {},
}))

const activeOrganization = { id: 'org-1', name: 'Example Org' }

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <GlobalContextProvider activeOrganization={activeOrganization as any}>
      <SubscriptionProvider>{children}</SubscriptionProvider>
    </GlobalContextProvider>
  )
}

describe('SubscriptionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQuery.mockReturnValue({
      loading: false,
      error: null,
      data: {
        currentSubscription: {
          status: 'TRIALING',
          cancelAtPeriodEnd: false,
          trialEnd: '2026-06-01T00:00:00.000Z',
          stripeCurrentPeriodEnd: '2026-07-01T00:00:00.000Z',
          plan: {
            name: 'Growth',
            features: ['reports', 'api'],
            limits: { projects: 10, seats: -1 },
          },
        },
      },
    })
  })

  it('derives subscription status, features, limits, and dates', () => {
    const { result } = renderHook(
      () => ({
        context: useSubscriptionContext(),
        subscription: useSubscription(),
        plan: usePlan(),
        projectLimit: useLimit('projects', 7),
        limits: useLimits({ projects: 10, seats: 100 }),
        hasFeature: useHasFeature('reports'),
        hasAllFeatures: useHasFeatures(['reports', 'api']),
        hasAnyFeature: useHasAnyFeature(['missing', 'api']),
      }),
      { wrapper },
    )

    expect(useQuery).toHaveBeenCalledWith(expect.anything(), {
      skip: false,
      fetchPolicy: 'cache-and-network',
    })
    expect(result.current.context.hasActiveSubscription).toBe(true)
    expect(result.current.context.isTrialing).toBe(true)
    expect(result.current.subscription.requireActiveSubscription()).toBe(true)
    expect(result.current.plan.isPlan('growth')).toBe(true)
    expect(result.current.plan.isPlanOneOf(['starter', 'growth'])).toBe(true)
    expect(result.current.plan.requireWithinLimit('projects', 9)).toBe(true)
    expect(result.current.projectLimit.remaining).toBe(3)
    expect(result.current.projectLimit.percentUsed).toBe(70)
    expect(result.current.limits.projects.isAtLimit).toBe(true)
    expect(result.current.limits.seats.remaining).toBe(Infinity)
    expect(result.current.hasFeature).toBe(true)
    expect(result.current.hasAllFeatures).toBe(true)
    expect(result.current.hasAnyFeature).toBe(true)
    expect(result.current.context.trialEndsAt?.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('supports object-style feature maps and missing limits', () => {
    useQuery.mockReturnValue({
      loading: false,
      error: null,
      data: {
        currentSubscription: {
          status: 'CANCELED',
          cancelAtPeriodEnd: true,
          plan: {
            name: 'Starter',
            features: { reports: true, api: false },
            limits: {},
          },
        },
      },
    })

    const { result } = renderHook(
      () => ({
        context: useSubscriptionContext(),
        plan: usePlan(),
      }),
      { wrapper },
    )

    expect(result.current.context.isCanceled).toBe(true)
    expect(result.current.context.hasFeature('reports')).toBe(true)
    expect(result.current.context.hasFeature('api')).toBe(false)
    expect(result.current.context.checkLimit('projects')).toEqual({ limit: 0, hasLimit: false })
    expect(result.current.context.isWithinLimit('projects', 999)).toBe(true)
    expect(() => result.current.plan.requireWithinLimit('projects', 1)).not.toThrow()
  })

  it('returns default subscription state outside the provider', () => {
    const { result } = renderHook(() => ({
      subscription: useSubscription(),
      hasFeature: useHasFeature('reports'),
      hasFeatures: useHasFeatures(['reports']),
      hasAnyFeature: useHasAnyFeature(['reports']),
    }))

    expect(result.current.subscription.hasActiveSubscription).toBe(false)
    expect(() => result.current.subscription.requireActiveSubscription()).toThrow(
      'No subscription provider available',
    )
    expect(result.current.hasFeature).toBe(false)
    expect(result.current.hasFeatures).toBe(false)
    expect(result.current.hasAnyFeature).toBe(false)
  })
})

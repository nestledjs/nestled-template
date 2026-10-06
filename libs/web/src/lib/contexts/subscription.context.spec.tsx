import React from 'react'
import { render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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
import { RequirePlan } from '../components/require-plan'
import { RequireSubscription } from '../components/require-subscription'
import { SubscriptionStatusBanner } from '../components/subscription-status-banner'

const useQuery = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}))

vi.mock('@nestled-template/shared/sdk', () => ({
  CurrentSubscription: { document: 'CurrentSubscription' },
  CurrentPlan: { document: 'CurrentPlan' },
  CurrentSubscriptionActive: { document: 'CurrentSubscriptionActive' },
}))

type QueryResult = { loading: boolean; error: Error | null; data: unknown }
const idle: QueryResult = { loading: false, error: null, data: undefined }

/** Answer each SDK document separately; documents without an answer return nothing. */
function answerQueries(answers: Record<string, QueryResult>) {
  useQuery.mockImplementation((document: { document: string }, options: { skip?: boolean }) =>
    options?.skip ? idle : (answers[document.document] ?? idle),
  )
}

/** The options the provider passed for one SDK document. */
function optionsFor(document: string) {
  const call = useQuery.mock.calls.find(
    ([doc]) => (doc as { document: string }).document === document,
  )
  return call?.[1]
}

const activeOrganization = { id: 'org-1', name: 'Example Org' }
const owner = {
  role: {
    name: 'Owner',
    permissions: [
      { subject: 'billing', action: 'read' },
      { subject: 'billing', action: 'manage' },
    ],
  },
}
const member = {
  role: { name: 'Member', permissions: [{ subject: 'organization', action: 'read' }] },
}

function wrapperFor(activeOrganizationMember: unknown) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <GlobalContextProvider
        activeOrganization={activeOrganization as any}
        activeOrganizationMember={activeOrganizationMember as any}
      >
        <SubscriptionProvider>{children}</SubscriptionProvider>
      </GlobalContextProvider>
    )
  }
}

const wrapper = wrapperFor(owner)

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

  it('does not request billing details for a member without billing permissions', () => {
    answerQueries({})

    const { result } = renderHook(() => useSubscriptionContext(), { wrapper: wrapperFor(member) })

    expect(optionsFor('CurrentSubscription')).toEqual({
      skip: true,
      fetchPolicy: 'cache-and-network',
    })
    expect(result.current.subscription).toBeNull()
    expect(result.current.hasActiveSubscription).toBe(false)
  })

  it("gives a Member their organization's plan features and active subscription", () => {
    answerQueries({
      CurrentPlan: {
        loading: false,
        error: null,
        data: {
          currentPlan: {
            id: 'plan-growth',
            name: 'Growth',
            features: ['reports'],
            limits: { projects: 10 },
          },
        },
      },
      CurrentSubscriptionActive: {
        loading: false,
        error: null,
        data: { currentSubscriptionActive: true },
      },
    })

    const { result } = renderHook(
      () => ({
        context: useSubscriptionContext(),
        subscription: useSubscription(),
        hasFeature: useHasFeature('reports'),
        missingFeature: useHasFeature('api'),
        plan: usePlan(),
      }),
      { wrapper: wrapperFor(member) },
    )

    expect(result.current.context.hasFeature('reports')).toBe(true)
    expect(result.current.hasFeature).toBe(true)
    expect(result.current.missingFeature).toBe(false)
    expect(result.current.context.hasActiveSubscription).toBe(true)
    expect(result.current.subscription.requireActiveSubscription()).toBe(true)
    expect(result.current.plan.isPlan('growth')).toBe(true)
    expect(result.current.context.checkLimit('projects')).toEqual({ limit: 10, hasLimit: true })

    // Billing details stay with billing readers.
    expect(result.current.context.subscription).toBeNull()
    expect(result.current.context.isTrialing).toBe(false)
    expect(result.current.context.isCanceled).toBe(false)
    expect(result.current.context.isPastDue).toBe(false)
    expect(result.current.context.trialEndsAt).toBeNull()
    expect(result.current.context.periodEndsAt).toBeNull()

    // No billing query is issued for a Member; the member-readable ones are.
    expect(optionsFor('CurrentSubscription')?.skip).toBe(true)
    expect(optionsFor('CurrentPlan')?.skip).toBe(false)
    expect(optionsFor('CurrentSubscriptionActive')?.skip).toBe(false)
  })

  it("reports a Member's organization without an active subscription as inactive", () => {
    answerQueries({
      CurrentPlan: { loading: false, error: null, data: { currentPlan: null } },
      CurrentSubscriptionActive: {
        loading: false,
        error: null,
        data: { currentSubscriptionActive: false },
      },
    })

    const { result } = renderHook(() => useSubscriptionContext(), { wrapper: wrapperFor(member) })

    expect(result.current.hasActiveSubscription).toBe(false)
    expect(result.current.plan).toBeNull()
    expect(result.current.hasFeature('reports')).toBe(false)
  })

  it('reports loading while the member-readable queries are in flight', () => {
    answerQueries({
      CurrentSubscriptionActive: { loading: true, error: null, data: undefined },
    })

    const { result } = renderHook(() => useSubscriptionContext(), { wrapper: wrapperFor(member) })

    expect(result.current.isLoading).toBe(true)
  })

  it('does not ask for member-readable status when billing details are readable', () => {
    renderHook(() => useSubscriptionContext(), { wrapper })

    expect(optionsFor('CurrentSubscription')?.skip).toBe(false)
    expect(optionsFor('CurrentPlan')?.skip).toBe(true)
    expect(optionsFor('CurrentSubscriptionActive')?.skip).toBe(true)
  })

  it('degrades to no subscription when the request is refused', () => {
    useQuery.mockReturnValue({
      loading: false,
      error: new Error('You do not have permission to perform this operation'),
      data: undefined,
    })

    const { result } = renderHook(() => useSubscriptionContext(), { wrapper })

    expect(result.current.subscription).toBeNull()
    expect(result.current.plan).toBeNull()
    expect(result.current.error?.message).toMatch(/permission/)
  })
})

describe('Member-facing gates under SubscriptionProvider', () => {
  function memberOfOrganization(active: boolean) {
    answerQueries({
      CurrentPlan: {
        loading: false,
        error: null,
        data: active
          ? { currentPlan: { id: 'plan-growth', name: 'Growth', features: ['reports'] } }
          : { currentPlan: null },
      },
      CurrentSubscriptionActive: {
        loading: false,
        error: null,
        data: { currentSubscriptionActive: active },
      },
    })
    const Wrapper = wrapperFor(member)
    return (ui: React.ReactElement) =>
      render(
        <MemoryRouter>
          <Wrapper>{ui}</Wrapper>
        </MemoryRouter>,
      )
  }

  beforeEach(() => vi.clearAllMocks())

  it('lets a Member of a subscribed organization through plan and subscription gates', () => {
    memberOfOrganization(true)(
      <>
        <SubscriptionStatusBanner showNoSubscriptionWarning />
        <RequireSubscription>
          <span>Subscribed area</span>
        </RequireSubscription>
        <RequirePlan feature="reports">
          <span>Reports</span>
        </RequirePlan>
        <RequirePlan feature="api">
          <span>API</span>
        </RequirePlan>
      </>,
    )

    expect(screen.getByText('Subscribed area')).toBeTruthy()
    expect(screen.getByText('Reports')).toBeTruthy()
    expect(screen.queryByText('API')).toBeNull()
    expect(screen.queryByText(/Free Plan/)).toBeNull()
    expect(screen.queryByText(/Payment Failed|Subscription Canceled|Trial Ending/)).toBeNull()
  })

  it('still gates a Member of an organization without an active subscription', () => {
    memberOfOrganization(false)(
      <>
        <SubscriptionStatusBanner showNoSubscriptionWarning />
        <RequireSubscription>
          <span>Subscribed area</span>
        </RequireSubscription>
      </>,
    )

    expect(screen.queryByText('Subscribed area')).toBeNull()
    expect(screen.getByText('Subscription Required')).toBeTruthy()
    expect(screen.getByText(/Free Plan/)).toBeTruthy()
  })
})

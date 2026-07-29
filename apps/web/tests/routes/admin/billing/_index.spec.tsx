import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminBillingOverview from '../../../../app/routes/admin/billing/_index'

// Mock Apollo Client
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

// Mock gql - handle template literals properly
vi.mock('@apollo/client', () => ({
  gql: vi.fn((strings: TemplateStringsArray | string, ...values: unknown[]) => {
    // Handle both template literals and regular strings
    const queryString = typeof strings === 'string' ? strings : strings[0]
    return {
      kind: 'Document',
      definitions: [],
      loc: { source: { body: queryString } },
    }
  }),
}))

// Mock alert
global.alert = vi.fn()

describe('Admin Billing Overview Page', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    vi.clearAllMocks()
    ;(global.alert as any).mockClear()

    // Default mock for useMutation that calls onCompleted/onError callbacks
    mockUseMutation.mockImplementation((_document, options) => {
      const mutationFn = vi.fn().mockImplementation(async args => {
        try {
          const result = { data: {} }
          if (options?.onCompleted) {
            options.onCompleted(result.data)
          }
          return result
        } catch (error) {
          if (options?.onError) {
            options.onError(error)
          }
          throw error
        }
      })
      return [mutationFn, { loading: false, error: null, data: null }]
    })
  })

  const mockPlansData = {
    plans: [
      {
        id: 'plan-1',
        name: 'Pro Plan',
        description: 'For growing teams',
        price: '49.99',
        interval: 'month',
        active: true,
        stripeProductId: 'prod_123',
        stripePriceId: 'price_123',
        trialPeriodDays: 14,
      },
      {
        id: 'plan-2',
        name: 'Enterprise Plan',
        description: 'For large organizations',
        price: '199.99',
        interval: 'month',
        active: true,
        stripeProductId: 'prod_456',
        stripePriceId: 'price_456',
        trialPeriodDays: 30,
      },
      {
        id: 'plan-3',
        name: 'Legacy Plan',
        description: 'No longer available',
        price: '29.99',
        interval: 'month',
        active: false,
        stripeProductId: 'prod_789',
        stripePriceId: 'price_789',
        trialPeriodDays: 0,
      },
    ],
  }

  const mockSubscriptionsData = {
    subscriptions: [
      {
        id: 'sub-1',
        status: 'ACTIVE',
        organizationId: 'org-1',
        organization: {
          id: 'org-1',
          name: 'Acme Corporation',
        },
        plan: {
          id: 'plan-1',
          name: 'Pro Plan',
          price: '49.99',
        },
        stripeCurrentPeriodEnd: '2024-02-15T00:00:00Z',
      },
      {
        id: 'sub-2',
        status: 'TRIALING',
        organizationId: 'org-2',
        organization: {
          id: 'org-2',
          name: 'TechStart Inc',
        },
        plan: {
          id: 'plan-2',
          name: 'Enterprise Plan',
          price: '199.99',
        },
        stripeCurrentPeriodEnd: '2024-02-20T00:00:00Z',
      },
      {
        id: 'sub-3',
        status: 'CANCELED',
        organizationId: 'org-3',
        organization: {
          id: 'org-3',
          name: 'Startup Co',
        },
        plan: {
          id: 'plan-1',
          name: 'Pro Plan',
          price: '49.99',
        },
        stripeCurrentPeriodEnd: '2024-01-01T00:00:00Z',
      },
    ],
    subscriptionsCount: {
      total: 3,
      count: 3,
    },
  }

  const setupMocks = () => {
    mockUseQuery.mockImplementation((query, options) => {
      // Check if it's the plans query or subscriptions query
      const queryString = query?.loc?.source?.body || ''
      if (queryString.includes('plans')) {
        return {
          data: mockPlansData,
          loading: false,
          error: null,
          refetch: vi.fn().mockResolvedValue({ data: mockPlansData }),
        }
      } else if (queryString.includes('subscriptions')) {
        return {
          data: mockSubscriptionsData,
          loading: false,
          error: null,
        }
      }
      return {
        data: null,
        loading: false,
        error: null,
      }
    })

    const mockSyncProducts = vi.fn().mockResolvedValue({})
    const mockSyncPrices = vi.fn().mockResolvedValue({})
    mockUseMutation.mockImplementation(mutation => {
      const mutationString = mutation?.loc?.source?.body || ''
      if (mutationString.includes('syncStripeProducts')) {
        return [mockSyncProducts, { loading: false }]
      } else if (mutationString.includes('syncStripePrices')) {
        return [mockSyncPrices, { loading: false }]
      }
      return [vi.fn(), { loading: false }]
    })
  }

  const renderBillingPage = () => {
    setupMocks()

    const ReactRouterStub = createTestRouter([
      {
        path: '/admin/billing',
        Component: AdminBillingOverview,
      },
      {
        path: '/admin/billing/plans',
        Component: () => <div>Plans Page</div>,
      },
      {
        path: '/admin/billing/subscriptions',
        Component: () => <div>Subscriptions Page</div>,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/admin/billing']} />)
  }

  describe('Header and Description', () => {
    it('should render page header', () => {
      renderBillingPage()

      expect(screen.getByText('Billing Management')).toBeInTheDocument()
      expect(
        screen.getByText('Manage Stripe products, prices, and subscriptions'),
      ).toBeInTheDocument()
    })

    it('should render sync button', () => {
      renderBillingPage()

      expect(screen.getByRole('button', { name: /Sync from Stripe/ })).toBeInTheDocument()
    })
  })

  describe('Stats Display', () => {
    it('should display active subscriptions count', () => {
      const { container } = renderBillingPage()

      expect(screen.getByText('Active Subscriptions')).toBeInTheDocument()
      // Only ACTIVE status subscriptions - find by dd element
      const activeSubsCount = container.querySelector('dd')
      expect(activeSubsCount?.textContent).toBe('1')
    })

    it('should display MRR (Monthly Recurring Revenue)', () => {
      const { container } = renderBillingPage()

      expect(screen.getByText('MRR')).toBeInTheDocument()
      // Only ACTIVE subscriptions count toward MRR: 49.99
      const ddElements = container.querySelectorAll('dd')
      const mrrElement = Array.from(ddElements).find(dd => dd.textContent?.includes('49.99'))
      expect(mrrElement).toBeTruthy()
    })

    it('should display total subscriptions count', () => {
      const { container } = renderBillingPage()

      expect(screen.getByText('Total Subscriptions')).toBeInTheDocument()
      const ddElements = container.querySelectorAll('dd')
      const totalElement = Array.from(ddElements).find(dd => dd.textContent === '3')
      expect(totalElement).toBeTruthy()
    })

    it('should display active plans count', () => {
      const { container } = renderBillingPage()

      expect(screen.getByText('Active Plans')).toBeInTheDocument()
      const ddElements = container.querySelectorAll('dd')
      const plansElement = Array.from(ddElements).find(dd => dd.textContent === '2')
      expect(plansElement).toBeTruthy()
    })

    it('should render stat card icons', () => {
      const { container } = renderBillingPage()

      const icons = container.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)
    })
  })

  describe('Quick Links', () => {
    it('should render manage plans link', () => {
      renderBillingPage()

      const plansLink = screen.getByRole('link', { name: /Manage Plans/ })
      expect(plansLink).toBeInTheDocument()
      expect(plansLink).toHaveAttribute('href', '/admin/billing/plans')
    })

    it('should render view subscriptions link', () => {
      renderBillingPage()

      const subsLink = screen.getByRole('link', { name: /View Subscriptions/ })
      expect(subsLink).toBeInTheDocument()
      expect(subsLink).toHaveAttribute('href', '/admin/billing/subscriptions')
    })

    it('should display link descriptions', () => {
      renderBillingPage()

      expect(screen.getByText('View and manage products and prices')).toBeInTheDocument()
      expect(screen.getByText('See all customer subscriptions')).toBeInTheDocument()
    })
  })

  describe('Recent Subscriptions', () => {
    it('should render recent subscriptions section', () => {
      renderBillingPage()

      expect(screen.getByText('Recent Subscriptions')).toBeInTheDocument()
    })

    it('should display organization names', () => {
      renderBillingPage()

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
      expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
      expect(screen.getByText('Startup Co')).toBeInTheDocument()
    })

    it('should display plan names', () => {
      renderBillingPage()

      const proPlanElements = screen.getAllByText('Pro Plan')
      expect(proPlanElements.length).toBeGreaterThan(0)
      expect(screen.getByText('Enterprise Plan')).toBeInTheDocument()
    })

    it('should display subscription prices', () => {
      renderBillingPage()

      expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0)
      expect(screen.getAllByText('$199.99').length).toBeGreaterThan(0)
    })

    it('should show subscription status badges', () => {
      renderBillingPage()

      expect(screen.getByText('ACTIVE')).toBeInTheDocument()
      expect(screen.getByText('TRIALING')).toBeInTheDocument()
      expect(screen.getByText('CANCELED')).toBeInTheDocument()
    })

    it('should style ACTIVE status with green', () => {
      renderBillingPage()

      const activeBadge = screen.getByText('ACTIVE')
      expect(activeBadge).toHaveClass('bg-green-100')
      expect(activeBadge).toHaveClass('text-green-800')
    })

    it('should style TRIALING status with blue', () => {
      renderBillingPage()

      const trialingBadge = screen.getByText('TRIALING')
      expect(trialingBadge).toHaveClass('bg-blue-100')
      expect(trialingBadge).toHaveClass('text-blue-800')
    })

    it('should style CANCELED status with red', () => {
      renderBillingPage()

      const canceledBadge = screen.getByText('CANCELED')
      expect(canceledBadge).toHaveClass('bg-red-100')
      expect(canceledBadge).toHaveClass('text-red-800')
    })

    it('should show view all link', () => {
      renderBillingPage()

      const viewAllLink = screen.getByRole('link', { name: 'View all' })
      expect(viewAllLink).toHaveAttribute('href', '/admin/billing/subscriptions')
    })

    it('should show empty state when no subscriptions', () => {
      mockUseQuery.mockImplementation(query => {
        const queryString = query?.loc?.source?.body || ''
        if (queryString.includes('plans')) {
          return {
            data: mockPlansData,
            loading: false,
            error: null,
            refetch: vi.fn(),
          }
        } else if (queryString.includes('subscriptions')) {
          return {
            data: { subscriptions: [], subscriptionsCount: { total: 0, count: 0 } },
            loading: false,
            error: null,
          }
        }
        return { data: null, loading: false, error: null }
      })

      const ReactRouterStub = createTestRouter([
        {
          path: '/admin/billing',
          Component: AdminBillingOverview,
        },
      ])

      render(<ReactRouterStub initialEntries={['/admin/billing']} />)

      expect(screen.getByText('No subscriptions yet')).toBeInTheDocument()
    })
  })

  describe('Stripe Sync Functionality', () => {
    it('should show success alert after successful sync', async () => {
      const mockSyncProducts = vi.fn().mockResolvedValue({})
      const mockSyncPrices = vi.fn().mockResolvedValue({})

      mockUseMutation.mockImplementation(mutation => {
        const mutationString = mutation?.loc?.source?.body || ''
        if (mutationString.includes('syncStripeProducts')) {
          return [mockSyncProducts, { loading: false }]
        } else if (mutationString.includes('syncStripePrices')) {
          return [mockSyncPrices, { loading: false }]
        }
        return [vi.fn(), { loading: false }]
      })

      renderBillingPage()

      const syncButton = screen.getByRole('button', { name: /Sync from Stripe/ })
      await user.click(syncButton)

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith('Stripe data synced successfully!')
      })
    })

    it('should refetch plans after successful sync', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({ data: mockPlansData })
      const mockSyncProducts = vi.fn().mockResolvedValue({})
      const mockSyncPrices = vi.fn().mockResolvedValue({})

      mockUseQuery.mockImplementation(query => {
        const queryString = query?.loc?.source?.body || ''
        if (queryString.includes('plans')) {
          return {
            data: mockPlansData,
            loading: false,
            error: null,
            refetch: mockRefetch,
          }
        } else if (queryString.includes('subscriptions')) {
          return {
            data: mockSubscriptionsData,
            loading: false,
            error: null,
          }
        }
        return { data: null, loading: false, error: null }
      })

      mockUseMutation.mockImplementation(mutation => {
        const mutationString = mutation?.loc?.source?.body || ''
        if (mutationString.includes('syncStripeProducts')) {
          return [mockSyncProducts, { loading: false }]
        } else if (mutationString.includes('syncStripePrices')) {
          return [mockSyncPrices, { loading: false }]
        }
        return [vi.fn(), { loading: false }]
      })

      const ReactRouterStub = createTestRouter([
        {
          path: '/admin/billing',
          Component: AdminBillingOverview,
        },
      ])

      render(<ReactRouterStub initialEntries={['/admin/billing']} />)

      const syncButton = screen.getByRole('button', { name: /Sync from Stripe/ })
      await user.click(syncButton)

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })
  })

  describe('MRR Calculation', () => {
    it('should calculate MRR only from active subscriptions', () => {
      renderBillingPage()

      // Only ACTIVE subscription (49.99), not TRIALING or CANCELED
      expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0)
    })

    it('should show 0.00 MRR when no active subscriptions', () => {
      mockUseQuery.mockImplementation(query => {
        const queryString = query?.loc?.source?.body || ''
        if (queryString.includes('plans')) {
          return {
            data: mockPlansData,
            loading: false,
            error: null,
            refetch: vi.fn(),
          }
        } else if (queryString.includes('subscriptions')) {
          return {
            data: {
              subscriptions: [
                {
                  id: 'sub-1',
                  status: 'CANCELED',
                  organization: { id: 'org-1', name: 'Org 1' },
                  plan: { id: 'plan-1', name: 'Plan 1', price: '99.99' },
                },
              ],
              subscriptionsCount: { total: 1, count: 1 },
            },
            loading: false,
            error: null,
          }
        }
        return { data: null, loading: false, error: null }
      })

      const ReactRouterStub = createTestRouter([
        {
          path: '/admin/billing',
          Component: AdminBillingOverview,
        },
      ])

      render(<ReactRouterStub initialEntries={['/admin/billing']} />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })
  })

  describe('Grid Layout', () => {
    it('should render stats in grid layout', () => {
      const { container } = renderBillingPage()

      const statsGrid = container.querySelector('.grid')
      expect(statsGrid).toBeInTheDocument()
    })

    it('should render quick links in grid layout', () => {
      const { container } = renderBillingPage()

      const grids = container.querySelectorAll('.grid')
      expect(grids.length).toBeGreaterThan(0)
    })
  })
})

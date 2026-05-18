import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PricingPage from '../../app/routes/pricing'
import { useSubscription, useGlobalCtx } from '@nestled-template/web'
import { createTestRouter } from '../helpers/createTestRouter'

// Mock Apollo Client
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

// Mock SDK (for DocumentNode exports)
vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    ActivePlans: { kind: 'Document', definitions: [] },
    CreateCheckoutSession: { kind: 'Document', definitions: [] },
  }
})

vi.mock('@nestled-template/web', () => ({
  useSubscription: vi.fn(),
  useGlobalCtx: vi.fn(),
}))

describe('Pricing Page', () => {
  let mockCreateCheckoutSession: ReturnType<typeof vi.fn>
  const mockPlans = [
    {
      id: 'plan-free',
      name: 'Free',
      description: 'Perfect for getting started',
      price: '0',
      interval: 'month',
      stripePriceId: 'price_free',
      features: ['Basic features', 'Community support', 'Up to 10 users'],
      trialPeriodDays: 0,
    },
    {
      id: 'plan-pro',
      name: 'Pro',
      description: 'For growing teams',
      price: '29.99',
      interval: 'month',
      stripePriceId: 'price_pro',
      features: ['All Free features', 'Priority support', 'Unlimited users', 'Advanced analytics'],
      trialPeriodDays: 14,
    },
    {
      id: 'plan-enterprise',
      name: 'Enterprise',
      description: 'For large organizations',
      price: '99.99',
      interval: 'month',
      stripePriceId: 'price_enterprise',
      features: {
        advanced_analytics: true,
        priority_support: true,
        custom_integrations: true,
        sla: false,
      },
      trialPeriodDays: 30,
    },
  ]

  beforeEach(() => {
    mockUseQuery.mockClear()
    mockUseMutation.mockClear()

    mockCreateCheckoutSession = vi.fn()

    // Mock useQuery for ActivePlans
    mockUseQuery.mockReturnValue({
      data: { plans: mockPlans },
      loading: false,
      error: undefined,
    })

    // Mock useMutation for CreateCheckoutSession
    mockUseMutation.mockReturnValue([mockCreateCheckoutSession, { loading: false }])

    vi.mocked(useGlobalCtx).mockReturnValue({
      user: null,
    } as any)

    vi.mocked(useSubscription).mockReturnValue({
      subscription: null,
      plan: null,
    } as any)

    // Mock window.location
    delete (window as any).location
    ;(window as any).location = { href: '' }
  })

  const renderPricingPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/pricing',
        Component: PricingPage,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/pricing']} />)
  }

  describe('Page Header', () => {
    it('should render page title', () => {
      renderPricingPage()

      expect(screen.getByRole('heading', { name: /Choose Your Plan/i })).toBeInTheDocument()
    })

    it('should render page description', () => {
      renderPricingPage()

      expect(screen.getByText(/Select the perfect plan for your needs/i)).toBeInTheDocument()
      expect(screen.getByText(/All plans include our core features/i)).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show loading message while fetching plans', () => {
      mockUseQuery.mockClear()
      mockUseQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      })

      renderPricingPage()

      expect(screen.getByText(/Loading plans.../i)).toBeInTheDocument()
    })

    it('should not show plans grid while loading', () => {
      mockUseQuery.mockClear()
      mockUseQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      })

      renderPricingPage()

      expect(screen.queryByRole('button', { name: /Subscribe/i })).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should show "No Plans Available" when no plans exist', () => {
      mockUseQuery.mockClear()
      mockUseQuery.mockReturnValue({
        data: { plans: [] },
        loading: false,
        error: undefined,
      } as any)

      renderPricingPage()

      expect(screen.getByText(/No Plans Available/i)).toBeInTheDocument()
      expect(screen.getByText(/Plans are being configured/i)).toBeInTheDocument()
      expect(screen.getByText(/Site owners: configure Stripe pricing/i)).toBeInTheDocument()
      expect(screen.getByText(/Create products and recurring prices/i)).toBeInTheDocument()
      expect(screen.getByText(/stripePriceId/i)).toBeInTheDocument()
    })
  })

  describe('Plans Display', () => {
    it('should render all available plans', () => {
      renderPricingPage()

      expect(screen.getByText('Free')).toBeInTheDocument()
      expect(screen.getByText('Pro')).toBeInTheDocument()
      expect(screen.getByText('Enterprise')).toBeInTheDocument()
    })

    it('should display plan descriptions', () => {
      renderPricingPage()

      expect(screen.getByText('Perfect for getting started')).toBeInTheDocument()
      expect(screen.getByText('For growing teams')).toBeInTheDocument()
      expect(screen.getByText('For large organizations')).toBeInTheDocument()
    })

    it('should display plan prices with interval', () => {
      renderPricingPage()

      expect(screen.getByText('$0')).toBeInTheDocument()
      expect(screen.getByText('$30')).toBeInTheDocument()
      expect(screen.getByText('$100')).toBeInTheDocument()

      const intervalTexts = screen.getAllByText(/\/month/i)
      expect(intervalTexts.length).toBe(3)
    })

    it('should show trial period days when available', () => {
      renderPricingPage()

      expect(screen.getByText('14-day free trial')).toBeInTheDocument()
      expect(screen.getByText('30-day free trial')).toBeInTheDocument()
    })

    it('should not show trial text for plans without trial', () => {
      renderPricingPage()

      const freePlanSection = screen.getByText('Free').closest('div')
      expect(freePlanSection).not.toHaveTextContent('free trial')
    })
  })

  describe('Plan Features', () => {
    it('should render array-based features', () => {
      renderPricingPage()

      expect(screen.getByText('Basic features')).toBeInTheDocument()
      expect(screen.getByText('Community support')).toBeInTheDocument()
      expect(screen.getByText('Up to 10 users')).toBeInTheDocument()
    })

    it('should render object-based features', () => {
      renderPricingPage()

      // Features from Enterprise plan (object format)
      // Note: getAllByText because features may appear in multiple plans
      expect(screen.getAllByText(/Advanced Analytics/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Priority Support/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Custom Integrations/i).length).toBeGreaterThan(0)
    })

    it('should show checkmarks for included features', () => {
      const { container } = renderPricingPage()

      // Check for CheckIcon presence (Heroicons renders as svg)
      const checkIcons = container.querySelectorAll('.text-emerald-300')
      expect(checkIcons.length).toBeGreaterThan(0)
    })

    it('should show X marks for excluded features', () => {
      const { container } = renderPricingPage()

      // XMarkIcon should exist for excluded features
      const xMarkIcons = container.querySelectorAll('.text-zinc-600')
      expect(xMarkIcons.length).toBeGreaterThan(0)
    })
  })

  describe('Current Plan Badge', () => {
    it('should show "Current Plan" badge on active plan', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: { id: 'sub-1' },
        plan: mockPlans[1], // Pro plan
      } as any)

      renderPricingPage()

      // Multiple "Current Plan" texts exist (badge + button), verify at least one exists
      expect(screen.getAllByText('Current Plan').length).toBeGreaterThan(0)
    })

    it('should not show badge when no active subscription', () => {
      renderPricingPage()

      expect(screen.queryByText('Current Plan')).not.toBeInTheDocument()
    })

    it('should highlight current plan with special styling', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: { id: 'sub-1' },
        plan: mockPlans[1],
      } as any)

      const { container } = renderPricingPage()

      // Get the badge element (not the button), which is inside a span
      const currentPlanBadge = screen.getAllByText('Current Plan').find(el => el.tagName === 'SPAN')
      const currentPlanCard = currentPlanBadge?.closest('[class*="border-emerald-500"]')
      expect(currentPlanCard).toBeTruthy()
    })
  })

  describe('Subscribe Button Behavior', () => {
    it('should show "Subscribe Now" for authenticated users', () => {
      vi.mocked(useGlobalCtx).mockReturnValue({
        user: { id: '1', email: 'user@example.com' },
      } as any)

      renderPricingPage()

      expect(screen.getAllByRole('button', { name: /Subscribe Now/i }).length).toBeGreaterThan(0)
    })

    it('should show "Get Started" for unauthenticated users', () => {
      renderPricingPage()

      expect(screen.getAllByRole('button', { name: /Get Started/i }).length).toBeGreaterThan(0)
    })

    it('should disable button for current plan', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: { id: 'sub-1' },
        plan: mockPlans[1],
      } as any)

      renderPricingPage()

      const currentPlanButton = screen.getByRole('button', { name: /Current Plan/i })
      expect(currentPlanButton).toBeDisabled()
    })

    it('should show loading state when creating checkout', () => {
      mockUseMutation.mockClear()
      mockUseMutation.mockReturnValue([mockCreateCheckoutSession, { loading: true }])

      renderPricingPage()

      // Multiple loading buttons (one per plan)
      expect(screen.getAllByRole('button', { name: /Loading.../i }).length).toBeGreaterThan(0)
    })
  })

  describe('Checkout Flow', () => {
    it('should redirect to login for unauthenticated users', async () => {
      const user = userEvent.setup()
      renderPricingPage()

      const subscribeButton = screen.getAllByRole('button', { name: /Get Started/i })[1]
      await user.click(subscribeButton)

      expect(window.location.href).toBe('/login?returnTo=/pricing')
    })

    it('should create checkout session for authenticated users', async () => {
      const user = userEvent.setup()
      vi.mocked(useGlobalCtx).mockReturnValue({
        user: { id: '1', email: 'user@example.com' },
      } as any)

      mockCreateCheckoutSession.mockResolvedValue({
        data: {
          createCheckoutSession: 'https://checkout.stripe.com/session_123',
        },
      })

      renderPricingPage()

      const subscribeButton = screen.getAllByRole('button', { name: /Subscribe Now/i })[0]
      await user.click(subscribeButton)

      await waitFor(() => {
        expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
          variables: { priceId: mockPlans[0].stripePriceId },
        })
      })
    })

    it('should redirect to Stripe checkout URL on success', async () => {
      const user = userEvent.setup()
      vi.mocked(useGlobalCtx).mockReturnValue({
        user: { id: '1', email: 'user@example.com' },
      } as any)

      const checkoutUrl = 'https://checkout.stripe.com/session_123'
      mockCreateCheckoutSession.mockResolvedValue({
        data: { createCheckoutSession: checkoutUrl },
      })

      renderPricingPage()

      const subscribeButton = screen.getAllByRole('button', { name: /Subscribe Now/i })[0]
      await user.click(subscribeButton)

      await waitFor(() => {
        expect(window.location.href).toBe(checkoutUrl)
      })
    })

    it('should show error alert on checkout failure', async () => {
      const user = userEvent.setup()
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {
        // No-op for test
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // No-op for test
      })

      vi.mocked(useGlobalCtx).mockReturnValue({
        user: { id: '1', email: 'user@example.com' },
      } as any)

      mockCreateCheckoutSession.mockRejectedValue(new Error('Network error'))

      renderPricingPage()

      const subscribeButton = screen.getAllByRole('button', { name: /Subscribe Now/i })[0]
      await user.click(subscribeButton)

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to start checkout. Please try again.')
        expect(consoleErrorSpy).toHaveBeenCalled()
      })

      alertSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('FAQ Section', () => {
    it('should render FAQ section', () => {
      renderPricingPage()

      expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument()
    })

    it('should display all FAQ items', () => {
      renderPricingPage()

      expect(screen.getByText('Can I change plans later?')).toBeInTheDocument()
      expect(screen.getByText('What payment methods do you accept?')).toBeInTheDocument()
      expect(screen.getByText('Can I cancel anytime?')).toBeInTheDocument()
    })

    it('should show FAQ answers', () => {
      renderPricingPage()

      expect(screen.getByText(/upgrade or downgrade your plan at any time/i)).toBeInTheDocument()
      expect(screen.getByText(/all major credit cards and debit cards/i)).toBeInTheDocument()
      expect(
        screen.getByText(/retain access until the end of your billing period/i),
      ).toBeInTheDocument()
    })
  })

  describe('Login Prompt', () => {
    it('should show login prompt for unauthenticated users', () => {
      renderPricingPage()

      expect(screen.getByText('Already have an account?')).toBeInTheDocument()
    })

    it('should have login link', () => {
      renderPricingPage()

      const loginLink = screen.getByRole('link', { name: /Sign In/i })
      expect(loginLink).toBeInTheDocument()
      expect(loginLink).toHaveAttribute('href', '/login')
    })

    it('should not show login prompt for authenticated users', () => {
      vi.mocked(useGlobalCtx).mockReturnValue({
        user: { id: '1', email: 'user@example.com' },
      } as any)

      renderPricingPage()

      expect(screen.queryByText('Already have an account?')).not.toBeInTheDocument()
    })
  })

  describe('Visual Design', () => {
    it('should have gradient background', () => {
      const { container } = renderPricingPage()

      const mainContainer = container.querySelector('.bg-gradient-to-br')
      expect(mainContainer).toBeInTheDocument()
    })

    it('should use responsive grid layout for plans', () => {
      const { container } = renderPricingPage()

      const gridContainer = container.querySelector(String.raw`.grid.lg\:grid-cols-3`)
      expect(gridContainer).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderPricingPage()

      const mainHeading = screen.getByRole('heading', { level: 1 })
      expect(mainHeading).toHaveTextContent('Choose Your Plan')

      const faqHeading = screen.getByRole('heading', {
        level: 3,
        name: /Frequently Asked Questions/i,
      })
      expect(faqHeading).toBeInTheDocument()
    })

    it('should have accessible buttons', () => {
      renderPricingPage()

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName()
      })
    })
  })
})

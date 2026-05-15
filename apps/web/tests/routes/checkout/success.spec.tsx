import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { createTestRouter } from "../../helpers/createTestRouter"
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CheckoutSuccess from '../../../app/routes/checkout/success'
import { useSubscription } from '@nestled-template/web'

// Mock dependencies
vi.mock('@nestled-template/web', () => ({
  useSubscription: vi.fn(),
}))

describe('Checkout Success Page', () => {
  const mockPlan = {
    id: 'plan-pro',
    name: 'Pro Plan',
    price: '29.99',
    interval: 'month',
  }

  const mockSubscription = {
    id: 'sub-123',
    status: 'active',
    trialEnd: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useSubscription).mockReturnValue({
      subscription: mockSubscription,
      plan: mockPlan,
    } as any)

    // Mock window.gtag for analytics tracking
    ;(window as any).gtag = vi.fn()
  })

  const renderCheckoutSuccess = (sessionId = 'cs_test_123') => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/checkout/success',
        Component: CheckoutSuccess,
      },
    ])

    const url = sessionId
      ? `/checkout/success?session_id=${sessionId}`
      : '/checkout/success'

    return render(<ReactRouterStub initialEntries={[url]} />)
  }

  describe('Success Message', () => {
    it('should render success heading', () => {
      renderCheckoutSuccess()

      expect(screen.getByRole('heading', { name: /Welcome Aboard!/i })).toBeInTheDocument()
    })

    it('should display confirmation message', () => {
      renderCheckoutSuccess()

      expect(screen.getByText(/Your subscription has been successfully activated/i)).toBeInTheDocument()
    })

    it('should show success icon', () => {
      const { container } = renderCheckoutSuccess()

      // CheckCircleIcon should be rendered
      const successIcon = container.querySelector('.text-emerald-600')
      expect(successIcon).toBeInTheDocument()
    })
  })

  describe('URL Parameters', () => {
    it('should extract session_id from URL query params', () => {
      renderCheckoutSuccess('cs_test_abc123')

      expect(screen.getByText(/Session ID: cs_test_abc123/i)).toBeInTheDocument()
    })

    it('should handle missing session_id gracefully', () => {
      renderCheckoutSuccess(null as any)

      expect(screen.queryByText(/Session ID:/i)).not.toBeInTheDocument()
    })

    it('should display session ID at bottom of page', () => {
      renderCheckoutSuccess()

      const sessionIdText = screen.getByText(/Session ID: cs_test_123/i)
      expect(sessionIdText.className).toContain('text-xs')
      expect(sessionIdText.className).toContain('text-gray-400')
    })
  })

  describe('Subscription Details Section', () => {
    it('should show subscription details header', () => {
      renderCheckoutSuccess()

      expect(screen.getByRole('heading', { name: /Subscription Details/i })).toBeInTheDocument()
    })

    it('should display plan name', () => {
      renderCheckoutSuccess()

      expect(screen.getByText('Plan:')).toBeInTheDocument()
      expect(screen.getByText('Pro Plan')).toBeInTheDocument()
    })

    it('should display plan price with interval', () => {
      renderCheckoutSuccess()

      expect(screen.getByText('Price:')).toBeInTheDocument()
      expect(screen.getByText('$29.99/month')).toBeInTheDocument()
    })

    it('should format price to 2 decimal places', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: mockSubscription,
        plan: { ...mockPlan, price: '9' },
      } as any)

      renderCheckoutSuccess()

      expect(screen.getByText('$9.00/month')).toBeInTheDocument()
    })

    it('should not show details section when no plan', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: mockSubscription,
        plan: null,
      } as any)

      renderCheckoutSuccess()

      expect(screen.queryByRole('heading', { name: /Subscription Details/i })).not.toBeInTheDocument()
    })
  })

  describe('Trial Period', () => {
    it('should show trial end date when trial is active', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 14)

      vi.mocked(useSubscription).mockReturnValue({
        subscription: { ...mockSubscription, trialEnd: futureDate.toISOString() },
        plan: mockPlan,
      } as any)

      renderCheckoutSuccess()

      expect(screen.getByText('Trial Ends:')).toBeInTheDocument()
      expect(screen.getByText(futureDate.toLocaleDateString())).toBeInTheDocument()
    })

    it('should not show trial end date when trial has expired', () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      vi.mocked(useSubscription).mockReturnValue({
        subscription: { ...mockSubscription, trialEnd: pastDate.toISOString() },
        plan: mockPlan,
      } as any)

      renderCheckoutSuccess()

      expect(screen.queryByText('Trial Ends:')).not.toBeInTheDocument()
    })

    it('should not show trial info when no trial', () => {
      renderCheckoutSuccess()

      expect(screen.queryByText('Trial Ends:')).not.toBeInTheDocument()
    })
  })

  describe('Next Steps Section', () => {
    it('should show "What\'s Next?" heading', () => {
      renderCheckoutSuccess()

      expect(screen.getByRole('heading', { name: /What's Next?/i })).toBeInTheDocument()
    })

    it('should list all next steps', () => {
      renderCheckoutSuccess()

      expect(screen.getByText(/Explore all the premium features/i)).toBeInTheDocument()
      expect(screen.getByText(/Check your email for your receipt/i)).toBeInTheDocument()
      expect(screen.getByText(/Manage your subscription anytime/i)).toBeInTheDocument()
    })

    it('should number next steps sequentially', () => {
      renderCheckoutSuccess()

      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  describe('Navigation Buttons', () => {
    it('should render "Go to Dashboard" button', () => {
      renderCheckoutSuccess()

      const dashboardButton = screen.getByRole('link', { name: /Go to Dashboard/i })
      expect(dashboardButton).toBeInTheDocument()
      expect(dashboardButton).toHaveAttribute('href', '/members/dashboard')
    })

    it('should render "View Billing Settings" button', () => {
      renderCheckoutSuccess()

      const billingButton = screen.getByRole('link', { name: /View Billing Settings/i })
      expect(billingButton).toBeInTheDocument()
      expect(billingButton).toHaveAttribute('href', '/settings/billing')
    })

    it('should style dashboard button as primary', () => {
      renderCheckoutSuccess()

      const dashboardButton = screen.getByRole('link', { name: /Go to Dashboard/i })
      expect(dashboardButton.className).toContain('bg-emerald-600')
      expect(dashboardButton.className).toContain('text-white')
    })

    it('should style billing button as secondary', () => {
      renderCheckoutSuccess()

      const billingButton = screen.getByRole('link', { name: /View Billing Settings/i })
      expect(billingButton.className).toContain('border-2')
    })
  })

  describe('Analytics Tracking', () => {
    it('should track purchase event with gtag on mount', async () => {
      const gtagMock = vi.fn()
      ;(window as any).gtag = gtagMock

      renderCheckoutSuccess('cs_test_analytics')

      await waitFor(() => {
        expect(gtagMock).toHaveBeenCalledWith('event', 'purchase', {
          transaction_id: 'cs_test_analytics',
          value: mockPlan.price,
          currency: 'USD',
          items: [
            {
              item_id: mockPlan.id,
              item_name: mockPlan.name,
            },
          ],
        })
      })
    })

    it('should not track when gtag is unavailable', () => {
      ;(window as any).gtag = undefined

      expect(() => renderCheckoutSuccess()).not.toThrow()
    })

    it('should use plan price as event value', async () => {
      const gtagMock = vi.fn()
      ;(window as any).gtag = gtagMock

      vi.mocked(useSubscription).mockReturnValue({
        subscription: mockSubscription,
        plan: { ...mockPlan, price: '99.99' },
      } as any)

      renderCheckoutSuccess()

      await waitFor(() => {
        expect(gtagMock).toHaveBeenCalledWith(
          'event',
          'purchase',
          expect.objectContaining({
            value: '99.99',
          })
        )
      })
    })

    it('should handle missing plan in analytics', async () => {
      const gtagMock = vi.fn()
      ;(window as any).gtag = gtagMock

      vi.mocked(useSubscription).mockReturnValue({
        subscription: mockSubscription,
        plan: null,
      } as any)

      renderCheckoutSuccess()

      await waitFor(() => {
        expect(gtagMock).toHaveBeenCalledWith(
          'event',
          'purchase',
          expect.objectContaining({
            value: 0,
          })
        )
      })
    })
  })

  describe('Visual Design', () => {
    it('should have gradient background', () => {
      const { container } = renderCheckoutSuccess()

      const background = container.querySelector('.bg-gradient-to-br.from-emerald-50')
      expect(background).toBeInTheDocument()
    })

    it('should center content on page', () => {
      const { container } = renderCheckoutSuccess()

      const centerContainer = container.querySelector('.flex.items-center.justify-center')
      expect(centerContainer).toBeInTheDocument()
    })

    it('should use success-themed colors', () => {
      const { container } = renderCheckoutSuccess()

      // Check for emerald/green success colors
      const successElements = container.querySelectorAll('[class*="emerald"]')
      expect(successElements.length).toBeGreaterThan(0)
    })
  })

  describe('Responsive Layout', () => {
    it('should have responsive padding', () => {
      const { container } = renderCheckoutSuccess()

      const card = container.querySelector('.p-8.md\\:p-12')
      expect(card).toBeInTheDocument()
    })

    it('should stack buttons on mobile', () => {
      const { container } = renderCheckoutSuccess()

      const buttonContainer = container.querySelector('.flex-col.sm\\:flex-row')
      expect(buttonContainer).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderCheckoutSuccess()

      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent(/Welcome Aboard/i)

      const h2Elements = screen.getAllByRole('heading', { level: 2 })
      expect(h2Elements.length).toBeGreaterThan(0)
    })

    it('should have accessible navigation links', () => {
      renderCheckoutSuccess()

      const dashboardLink = screen.getByRole('link', { name: /Go to Dashboard/i })
      const billingLink = screen.getByRole('link', { name: /View Billing Settings/i })

      expect(dashboardLink).toHaveAccessibleName()
      expect(billingLink).toHaveAccessibleName()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long plan names', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: mockSubscription,
        plan: { ...mockPlan, name: 'Enterprise Ultra Premium Plus Plan' },
      } as any)

      renderCheckoutSuccess()

      expect(screen.getByText('Enterprise Ultra Premium Plus Plan')).toBeInTheDocument()
    })

    it('should handle zero price plans', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: mockSubscription,
        plan: { ...mockPlan, price: '0' },
      } as any)

      renderCheckoutSuccess()

      expect(screen.getByText('$0.00/month')).toBeInTheDocument()
    })

    it('should handle yearly interval', () => {
      vi.mocked(useSubscription).mockReturnValue({
        subscription: mockSubscription,
        plan: { ...mockPlan, interval: 'year' },
      } as any)

      renderCheckoutSuccess()

      expect(screen.getByText('$29.99/year')).toBeInTheDocument()
    })
  })
})

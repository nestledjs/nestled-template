import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import CheckoutCancel from '../../../app/routes/checkout/cancel'
import { createTestRouter } from "../../helpers/createTestRouter"

describe('Checkout Cancel Page', () => {
  beforeEach(() => {
    // No mocks needed - component is purely presentational
  })

  const renderCheckoutCancel = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/checkout/cancel',
        Component: CheckoutCancel,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/checkout/cancel']} />)
  }

  describe('Cancel Message', () => {
    it('should render cancellation heading', () => {
      renderCheckoutCancel()

      expect(screen.getByRole('heading', { name: /Checkout Canceled/i })).toBeInTheDocument()
    })

    it('should display cancellation explanation', () => {
      renderCheckoutCancel()

      expect(screen.getByText(/Your subscription purchase was not completed/i)).toBeInTheDocument()
      expect(screen.getByText(/No charges have been made/i)).toBeInTheDocument()
    })

    it('should show cancel icon', () => {
      const { container } = renderCheckoutCancel()

      // XCircleIcon should be rendered with orange color
      const cancelIcon = container.querySelector('.text-orange-600')
      expect(cancelIcon).toBeInTheDocument()
    })
  })

  describe('What Happened Section', () => {
    it('should explain what happened', () => {
      renderCheckoutCancel()

      expect(screen.getByText('What happened?')).toBeInTheDocument()
      expect(screen.getByText(/You closed the checkout page before completing your purchase/i)).toBeInTheDocument()
    })

    it('should list possible reasons for cancellation', () => {
      renderCheckoutCancel()

      expect(screen.getByText(/You decided to review the plans again/i)).toBeInTheDocument()
      expect(screen.getByText(/You needed to verify payment details/i)).toBeInTheDocument()
      expect(screen.getByText(/You accidentally closed the window/i)).toBeInTheDocument()
    })
  })

  describe('What Would You Like To Do Section', () => {
    it('should show action options header', () => {
      renderCheckoutCancel()

      expect(screen.getByText(/What would you like to do?/i)).toBeInTheDocument()
    })

    it('should display "Try Again" option', () => {
      renderCheckoutCancel()

      expect(screen.getByRole('heading', { level: 4, name: 'Try Again' })).toBeInTheDocument()
      expect(screen.getByText(/Ready to subscribe/i)).toBeInTheDocument()
      expect(screen.getByText(/View our plans and complete your purchase/i)).toBeInTheDocument()
    })

    it('should display "Need Help?" option', () => {
      renderCheckoutCancel()

      expect(screen.getByRole('heading', { level: 4, name: 'Need Help?' })).toBeInTheDocument()
      expect(screen.getByText(/Have questions about our plans or payment options?/i)).toBeInTheDocument()
    })

    it('should have link to view plans', () => {
      renderCheckoutCancel()

      const viewPlansLink = screen.getByRole('link', { name: /View Plans →/i })
      expect(viewPlansLink).toBeInTheDocument()
      expect(viewPlansLink).toHaveAttribute('href', '/pricing')
    })

    it('should have link to contact support', () => {
      renderCheckoutCancel()

      const supportLink = screen.getByRole('link', { name: /Contact Support →/i })
      expect(supportLink).toBeInTheDocument()
      expect(supportLink).toHaveAttribute('href', 'mailto:support@example.com')
    })
  })

  describe('Action Buttons', () => {
    it('should render "View Plans" primary button', () => {
      renderCheckoutCancel()

      const viewPlansButton = screen.getByRole('link', { name: 'View Plans' })
      expect(viewPlansButton).toBeInTheDocument()
      expect(viewPlansButton).toHaveAttribute('href', '/pricing')
    })

    it('should render "Go to Dashboard" secondary button', () => {
      renderCheckoutCancel()

      const dashboardButton = screen.getByRole('link', { name: /Go to Dashboard/i })
      expect(dashboardButton).toBeInTheDocument()
      expect(dashboardButton).toHaveAttribute('href', '/members/dashboard')
    })

    it('should style view plans button as primary', () => {
      renderCheckoutCancel()

      const viewPlansButton = screen.getByRole('link', { name: 'View Plans' })
      expect(viewPlansButton.className).toContain('bg-emerald-600')
      expect(viewPlansButton.className).toContain('text-white')
    })

    it('should style dashboard button as secondary', () => {
      renderCheckoutCancel()

      const dashboardButton = screen.getByRole('link', { name: /Go to Dashboard/i })
      expect(dashboardButton.className).toContain('border-2')
    })
  })

  describe('Reassurance Message', () => {
    it('should display reassurance message', () => {
      renderCheckoutCancel()

      expect(screen.getByText(/Don't worry!/i)).toBeInTheDocument()
      expect(screen.getByText(/You can subscribe at any time/i)).toBeInTheDocument()
      expect(screen.getByText(/All your data is safe and waiting for you/i)).toBeInTheDocument()
    })

    it('should style reassurance message distinctly', () => {
      const { container } = renderCheckoutCancel()

      const reassuranceBox = container.querySelector('.bg-gray-50.dark\\:bg-gray-900\\/50')
      expect(reassuranceBox).toBeInTheDocument()
    })
  })

  describe('Visual Design', () => {
    it('should have orange/red gradient background', () => {
      const { container } = renderCheckoutCancel()

      const background = container.querySelector('.bg-gradient-to-br.from-gray-50.via-orange-50.to-red-50')
      expect(background).toBeInTheDocument()
    })

    it('should center content on page', () => {
      const { container } = renderCheckoutCancel()

      const centerContainer = container.querySelector('.flex.items-center.justify-center')
      expect(centerContainer).toBeInTheDocument()
    })

    it('should use two-column grid for action cards', () => {
      const { container } = renderCheckoutCancel()

      const gridContainer = container.querySelector('.grid.sm\\:grid-cols-2')
      expect(gridContainer).toBeInTheDocument()
    })
  })

  describe('Information Box Styling', () => {
    it('should highlight "What happened?" box', () => {
      const { container } = renderCheckoutCancel()

      const infoBox = container.querySelector('.bg-blue-50')
      expect(infoBox).toBeInTheDocument()
    })

    it('should use list format for reasons', () => {
      const { container } = renderCheckoutCancel()

      const list = container.querySelector('ul.list-disc.list-inside')
      expect(list).toBeInTheDocument()
    })
  })

  describe('Responsive Layout', () => {
    it('should have responsive padding', () => {
      const { container } = renderCheckoutCancel()

      const card = container.querySelector('.p-8.md\\:p-12')
      expect(card).toBeInTheDocument()
    })

    it('should stack buttons on mobile', () => {
      const { container } = renderCheckoutCancel()

      const buttonContainer = container.querySelector('.flex-col.sm\\:flex-row')
      expect(buttonContainer).toBeInTheDocument()
    })

    it('should stack action cards on mobile', () => {
      const { container } = renderCheckoutCancel()

      const actionGrid = container.querySelector('.grid-cols-1.sm\\:grid-cols-2')
      expect(actionGrid).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderCheckoutCancel()

      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent(/Checkout Canceled/i)

      const h3Elements = screen.getAllByRole('heading', { level: 3 })
      expect(h3Elements.length).toBeGreaterThan(0)

      const h4Elements = screen.getAllByRole('heading', { level: 4 })
      expect(h4Elements.length).toBe(2) // "Try Again" and "Need Help?"
    })

    it('should have accessible navigation links', () => {
      renderCheckoutCancel()

      const links = screen.getAllByRole('link')
      expect(links.length).toBeGreaterThanOrEqual(4)

      links.forEach(link => {
        expect(link).toHaveAccessibleName()
      })
    })

    it('should have semantic list structure', () => {
      const { container } = renderCheckoutCancel()

      const list = container.querySelector('ul')
      expect(list).toBeInTheDocument()

      const listItems = container.querySelectorAll('li')
      expect(listItems.length).toBeGreaterThan(0)
    })
  })

  describe('Content Organization', () => {
    it('should display sections in logical order', () => {
      const { container } = renderCheckoutCancel()

      const allText = container.textContent || ''
      const cancelIndex = allText.indexOf('Checkout Canceled')
      const whatHappenedIndex = allText.indexOf('What happened?')
      const whatToDoIndex = allText.indexOf('What would you like to do?')
      const reassuranceIndex = allText.indexOf("Don't worry!")

      expect(cancelIndex).toBeLessThan(whatHappenedIndex)
      expect(whatHappenedIndex).toBeLessThan(whatToDoIndex)
      expect(whatToDoIndex).toBeLessThan(reassuranceIndex)
    })
  })

  describe('Navigation Paths', () => {
    it('should provide path back to pricing', () => {
      renderCheckoutCancel()

      const pricingLinks = screen.getAllByRole('link', { name: /View Plans|pricing/i })
      expect(pricingLinks.length).toBeGreaterThan(0)

      pricingLinks.forEach(link => {
        expect(link.getAttribute('href')).toMatch(/pricing/)
      })
    })

    it('should provide path to dashboard', () => {
      renderCheckoutCancel()

      const dashboardLink = screen.getByRole('link', { name: /Go to Dashboard/i })
      expect(dashboardLink).toHaveAttribute('href', '/members/dashboard')
    })

    it('should provide support contact method', () => {
      renderCheckoutCancel()

      const supportLink = screen.getByRole('link', { name: /Contact Support/i })
      expect(supportLink.getAttribute('href')).toContain('mailto:')
    })
  })

  describe('Dark Mode Support', () => {
    it('should include dark mode classes', () => {
      const { container } = renderCheckoutCancel()

      // Check for dark mode variants
      const darkModeElements = container.querySelectorAll('[class*="dark:"]')
      expect(darkModeElements.length).toBeGreaterThan(0)
    })
  })

  describe('User Experience', () => {
    it('should emphasize that no charges were made', () => {
      renderCheckoutCancel()

      const noChargesText = screen.getByText(/No charges have been made/i)
      expect(noChargesText).toBeInTheDocument()
    })

    it('should provide clear next steps', () => {
      renderCheckoutCancel()

      // Should have clear CTAs
      expect(screen.getByRole('link', { name: 'View Plans' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Go to Dashboard/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Contact Support/i })).toBeInTheDocument()
    })

    it('should maintain positive tone in messaging', () => {
      renderCheckoutCancel()

      // Check for reassuring language
      expect(screen.getByText(/Don't worry!/i)).toBeInTheDocument()
      expect(screen.getByText(/Ready to subscribe?/i)).toBeInTheDocument()
    })
  })

  describe('Card Borders', () => {
    it('should use borders to separate action cards', () => {
      const { container } = renderCheckoutCancel()

      const borderedCards = container.querySelectorAll('.border.border-gray-200')
      expect(borderedCards.length).toBe(2) // "Try Again" and "Need Help?" cards
    })
  })
})

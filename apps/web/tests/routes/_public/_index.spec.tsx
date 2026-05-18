import React from 'react'
import { render, screen } from '@testing-library/react'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PublicIndex from '../../../app/routes/_public/_index'

describe('Landing Page (_public/_index)', () => {
  const renderLandingPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/',
        Component: PublicIndex,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/']} />)
  }

  describe('Hero Section', () => {
    it('should render the hero section with headline', () => {
      renderLandingPage()

      expect(screen.getByText(/Your shiny new template is alive/i)).toBeInTheDocument()
    })

    it('should display the status badge with animation', () => {
      renderLandingPage()

      expect(screen.getByText(/Fresh install vibes/i)).toBeInTheDocument()
    })

    it('should show tagline/description', () => {
      renderLandingPage()

      expect(screen.getByText(/This is your public landing page/i)).toBeInTheDocument()
      expect(screen.getByText(/hottest sales copy/i)).toBeInTheDocument()
    })
  })

  describe('Quick Start Section', () => {
    it('should render quick start instructions', () => {
      renderLandingPage()

      expect(screen.getByText('Quick start')).toBeInTheDocument()
    })

    it('should list setup instructions', () => {
      renderLandingPage()

      expect(screen.getByText(/Replace this copy with your own/i)).toBeInTheDocument()
      expect(screen.getByText(/Drop in your product screenshots/i)).toBeInTheDocument()
      expect(screen.getByText(/wire this to your auth flow/i)).toBeInTheDocument()
    })

    it('should display file path for developers', () => {
      renderLandingPage()

      expect(screen.getByText(/apps\/web\/app\/routes\/public\/_index.tsx/i)).toBeInTheDocument()
    })
  })

  describe('Call-to-Action Buttons', () => {
    it('should render "Go to Login" button', () => {
      renderLandingPage()

      const loginButton = screen.getByRole('link', { name: /Go to Login/i })
      expect(loginButton).toBeInTheDocument()
      expect(loginButton).toHaveAttribute('href', '/login')
    })

    it('should apply correct styling classes to CTA buttons', () => {
      renderLandingPage()

      const loginButton = screen.getByRole('link', { name: /Go to Login/i })

      // Login button should have primary styling (emerald)
      expect(loginButton.className).toContain('bg-emerald-500')
    })
  })

  describe('Footer Message', () => {
    it('should display personalization encouragement', () => {
      renderLandingPage()

      expect(screen.getByText(/Not your vibe/i)).toBeInTheDocument()
      expect(screen.getByText(/Make it yours/i)).toBeInTheDocument()
    })
  })

  describe('Visual Design', () => {
    it('should have gradient background', () => {
      const { container } = renderLandingPage()

      const mainContainer = container.querySelector('.bg-gradient-to-b')
      expect(mainContainer).toBeInTheDocument()
    })

    it('should center content properly', () => {
      const { container } = renderLandingPage()

      const contentWrapper = container.querySelector('.flex.items-center.justify-center')
      expect(contentWrapper).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have semantic heading structure', () => {
      renderLandingPage()

      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toBeInTheDocument()
      expect(h1).toHaveTextContent(/Your shiny new template is alive/i)

      const h2 = screen.getByRole('heading', { level: 2 })
      expect(h2).toBeInTheDocument()
      expect(h2).toHaveTextContent('Quick start')
    })

    it('should have accessible navigation links', () => {
      renderLandingPage()

      const links = screen.getAllByRole('link')
      expect(links.length).toBeGreaterThanOrEqual(1)

      links.forEach(link => {
        expect(link).toHaveAccessibleName()
      })
    })
  })

  describe('Responsive Layout', () => {
    it('should have responsive text sizes', () => {
      const { container } = renderLandingPage()

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading.className).toContain('text-4xl')
      expect(heading.className).toContain('sm:text-5xl')
    })

    it('should have responsive padding', () => {
      const { container } = renderLandingPage()

      const mainContainer = container.querySelector('.px-4')
      expect(mainContainer).toBeInTheDocument()
    })

    it('should center the CTA button', () => {
      const { container } = renderLandingPage()

      const buttonContainer = container.querySelector('.flex.justify-center')
      expect(buttonContainer).toBeInTheDocument()
    })
  })
})

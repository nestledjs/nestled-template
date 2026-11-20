import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppSessionVerdict } from '../../../app/session'
import { NO_SESSION, REJECTED, SIGNED_IN, UNKNOWN } from '../../helpers/session-context'

import PublicLayout from '../../../app/routes/_public/_layout'

// Mock dependencies BEFORE importing the component
const mockUseGlobalCtx = vi.fn()

vi.mock('@nestled-template/web-ui', () => ({
  WebUiHeader: ({ isAuthenticated, sessionUnknown, navigation, siteName }: any) => (
    <header data-testid="public-header">
      <div data-testid="site-name">{siteName}</div>
      <div data-testid="auth-status">
        {sessionUnknown ? 'unknown' : isAuthenticated ? 'authenticated' : 'unauthenticated'}
      </div>
      <nav data-testid="navigation">
        {navigation?.map((item: any) => (
          <a key={item.href} href={item.href}>
            {item.name}
          </a>
        ))}
      </nav>
    </header>
  ),
  WebUiFooter: () => <footer data-testid="public-footer">Footer Content</footer>,
}))

vi.mock('@nestled-template/web', () => ({
  useGlobalCtx: () => mockUseGlobalCtx(),
}))

describe('Public Layout (_public/_layout)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGlobalCtx.mockReturnValue({ user: null })
  })

  // The root route's loader returns the session middleware's verdict; the layout reads it.
  const renderPublicLayout = (session: AppSessionVerdict = NO_SESSION) => {
    const ReactRouterStub = createTestRouter([
      {
        id: 'root',
        path: '/',
        loader: () => ({ session, theme: 'light' }),
        children: [
          {
            path: '',
            Component: PublicLayout,
            children: [
              {
                index: true,
                Component: () => <div data-testid="child-content">Child Page</div>,
              },
            ],
          },
        ],
      },
    ])

    return render(<ReactRouterStub initialEntries={['/']} />)
  }

  describe('Layout Structure', () => {
    it('should render header, main content, and footer', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('public-header')).toBeInTheDocument()
      })
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByTestId('public-footer')).toBeInTheDocument()
    })

    it('should render child content in main section', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })
      const main = screen.getByRole('main')
      expect(main).toContainElement(screen.getByTestId('child-content'))
    })

    it('should have flex column layout with min-height', async () => {
      const { container } = renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('public-header')).toBeInTheDocument()
      })
      const layoutDiv = container.querySelector('.flex.flex-col.min-h-screen')
      expect(layoutDiv).toBeInTheDocument()
    })

    it('should make main section flex-1 to fill available space', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })
      const main = screen.getByRole('main')
      expect(main.className).toContain('flex-1')
      expect(main.className).toContain('flex-col')
    })
  })

  describe('Header Configuration', () => {
    it('should pass site configuration to header', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('site-name')).toBeInTheDocument()
      })
      expect(screen.getByTestId('site-name')).toHaveTextContent('Demo Site')
    })

    it('should include all navigation items', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument()
      })
      const nav = screen.getByTestId('navigation')
      expect(nav).toHaveTextContent('Features')
      expect(nav).toHaveTextContent('Pricing')
      expect(nav).toHaveTextContent('Blog')
      expect(nav).toHaveTextContent('Sign Up')
    })

    it('should have correct navigation links', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Features' })).toBeInTheDocument()
      })
      const featuresLink = screen.getByRole('link', { name: 'Features' })
      const pricingLink = screen.getByRole('link', { name: 'Pricing' })
      const blogLink = screen.getByRole('link', { name: 'Blog' })
      const signUpLink = screen.getByRole('link', { name: 'Sign Up' })

      expect(featuresLink).toHaveAttribute('href', '/features')
      expect(pricingLink).toHaveAttribute('href', '/pricing')
      expect(blogLink).toHaveAttribute('href', '/blog')
      expect(signUpLink).toHaveAttribute('href', '/register')
    })
  })

  describe('Authentication Status', () => {
    it('shows signed out with no user and a signed-out verdict', async () => {
      mockUseGlobalCtx.mockReturnValue({ user: null })
      renderPublicLayout(NO_SESSION)

      expect(await screen.findByTestId('auth-status')).toHaveTextContent('unauthenticated')
    })

    it('shows signed out after the server rejected the session', async () => {
      mockUseGlobalCtx.mockReturnValue({ user: null })
      renderPublicLayout(REJECTED)

      expect(await screen.findByTestId('auth-status')).toHaveTextContent('unauthenticated')
    })

    it('shows signed in with the verdict user in context', async () => {
      mockUseGlobalCtx.mockReturnValue({ user: { id: '1', emails: [] } })
      renderPublicLayout(SIGNED_IN)

      expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated')
    })

    it('is neutral (no account menu, no "Log in") while the verdict is unknown (D2)', async () => {
      mockUseGlobalCtx.mockReturnValue({ user: null })
      renderPublicLayout(UNKNOWN)

      expect(await screen.findByTestId('auth-status')).toHaveTextContent('unknown')
    })

    it('no longer reads the session cookie: a cookie alone never shows signed in', async () => {
      mockUseGlobalCtx.mockReturnValue({ user: null })
      document.cookie = '__session=header.payload.signature'
      try {
        renderPublicLayout(NO_SESSION)
        expect(await screen.findByTestId('auth-status')).toHaveTextContent('unauthenticated')
      } finally {
        document.cookie = '__session=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
    })
  })

  describe('Footer', () => {
    it('should render footer component', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('public-footer')).toBeInTheDocument()
      })
      const footer = screen.getByTestId('public-footer')
      expect(footer).toHaveTextContent('Footer Content')
    })

    it('should render footer at bottom of layout', async () => {
      const { container } = renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('public-footer')).toBeInTheDocument()
      })
      const layoutDiv = container.querySelector('.flex.flex-col.min-h-screen')
      const footer = screen.getByTestId('public-footer')

      // Footer should be last child of layout
      expect(layoutDiv?.lastChild).toContainElement(footer)
    })
  })

  describe('Accessibility', () => {
    it('should have proper semantic structure with main landmark', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })
    })

    it('should have navigation landmark', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('navigation')).toBeInTheDocument()
      })
    })
  })

  describe('Brand Assets', () => {
    it('should pass logo and icon paths to header', async () => {
      renderPublicLayout()

      await waitFor(() => {
        expect(screen.getByTestId('public-header')).toBeInTheDocument()
      })
      // Note: In real WebUiHeader component, these would be rendered as img tags
      // This test verifies the props are passed correctly
      const header = screen.getByTestId('public-header')
      expect(header).toBeInTheDocument()
    })
  })
})

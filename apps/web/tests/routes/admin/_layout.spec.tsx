import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminLayout from '../../../app/routes/admin/_layout'
import { createTestRouter } from "../../helpers/createTestRouter"

// Mock the GlobalContext
const mockUseGlobalCtx = vi.fn()
vi.mock('@nestled-template/web', () => ({
  useGlobalCtx: () => mockUseGlobalCtx(),
}))

describe('Admin Layout', () => {
  const mockSuperAdmin = {
    id: 'super-admin-1',
    email: 'admin@example.com',
    firstName: 'Super',
    lastName: 'Admin',
    isSuperAdmin: true,
  }

  const mockRegularUser = {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Regular',
    lastName: 'User',
    isSuperAdmin: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderAdminLayout = (user: any, pathname = '/admin') => {
    mockUseGlobalCtx.mockReturnValue({ user })

    const ReactRouterStub = createTestRouter([
      {
        path: '/admin',
        Component: AdminLayout,
        children: [
          {
            index: true,
            Component: () => <div>Admin Dashboard Content</div>,
          },
          {
            path: 'users',
            Component: () => <div>Users Content</div>,
          },
        ],
      },
      {
        path: '/members/dashboard',
        Component: () => <div>Members Dashboard</div>,
      },
    ])

    return render(<ReactRouterStub initialEntries={[pathname]} />)
  }

  describe('Super Admin Guard', () => {
    it('should redirect non-super-admin users to members dashboard', () => {
      renderAdminLayout(mockRegularUser)
      expect(screen.getByText('Members Dashboard')).toBeInTheDocument()
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
    })

    it('should allow super admin users to access admin panel', () => {
      renderAdminLayout(mockSuperAdmin)
      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
      expect(screen.queryByText('Members Dashboard')).not.toBeInTheDocument()
    })

    it('should show loading state when user is not loaded yet', () => {
      mockUseGlobalCtx.mockReturnValue({ user: null })

      const ReactRouterStub = createTestRouter([
        {
          path: '/admin',
          Component: AdminLayout,
        },
      ])

      render(<ReactRouterStub initialEntries={['/admin']} />)
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('Admin Navigation', () => {
    it('should render all admin navigation sections', () => {
      renderAdminLayout(mockSuperAdmin)

      // Check Admin Operations section
      expect(screen.getByText('Admin Operations')).toBeInTheDocument()
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Users')).toBeInTheDocument()
      expect(screen.getByText('Organizations')).toBeInTheDocument()
      expect(screen.getByText('Security Events')).toBeInTheDocument()
      expect(screen.getByText('Audit Logs')).toBeInTheDocument()

      // Check System Administration section
      expect(screen.getByText('System Administration')).toBeInTheDocument()
      expect(screen.getByText('App Settings')).toBeInTheDocument()
      expect(screen.getByText('Billing')).toBeInTheDocument()
      expect(screen.getByText('Data Browser')).toBeInTheDocument()
      expect(screen.getByText('Analytics')).toBeInTheDocument()
    })

    it('should render navigation with correct descriptions', () => {
      renderAdminLayout(mockSuperAdmin)

      expect(screen.getByText('Overview and key metrics')).toBeInTheDocument()
      expect(screen.getByText('User management and emulation')).toBeInTheDocument()
      expect(screen.getByText('Organization management')).toBeInTheDocument()
      expect(screen.getByText('Login attempts and 2FA')).toBeInTheDocument()
      expect(screen.getByText('Activity and event tracking')).toBeInTheDocument()
      expect(screen.getByText('Application preferences')).toBeInTheDocument()
      expect(screen.getByText('Plans and subscriptions')).toBeInTheDocument()
      expect(screen.getByText('Database query tool')).toBeInTheDocument()
      expect(screen.getByText('Platform metrics and reporting')).toBeInTheDocument()
    })

    it('should have correct navigation links', () => {
      renderAdminLayout(mockSuperAdmin)

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/ })
      const usersLink = screen.getByRole('link', { name: /Users/ })
      const orgsLink = screen.getByRole('link', { name: /Organizations/ })

      expect(dashboardLink).toHaveAttribute('href', '/admin')
      expect(usersLink).toHaveAttribute('href', '/admin/users')
      expect(orgsLink).toHaveAttribute('href', '/admin/organizations')
    })

    it('should highlight active navigation item on dashboard', () => {
      renderAdminLayout(mockSuperAdmin, '/admin')

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/ })
      expect(dashboardLink).toHaveClass('bg-emerald-500')
    })

    it('should highlight active navigation item on users page', () => {
      renderAdminLayout(mockSuperAdmin, '/admin/users')

      const usersLink = screen.getByRole('link', { name: /Users/ })
      expect(usersLink).toHaveClass('bg-emerald-500')
    })
  })

  describe('Layout Structure', () => {
    it('should render header with title and description', () => {
      renderAdminLayout(mockSuperAdmin)

      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
      expect(screen.getByText('Platform administration and management')).toBeInTheDocument()
    })

    it('should render sidebar navigation', () => {
      renderAdminLayout(mockSuperAdmin)

      const nav = screen.getByRole('navigation')
      expect(nav).toBeInTheDocument()
    })

    it('should render outlet content area', () => {
      renderAdminLayout(mockSuperAdmin)

      expect(screen.getByText('Admin Dashboard Content')).toBeInTheDocument()
    })
  })

  describe('Navigation Icons', () => {
    it('should render icons for all navigation items', () => {
      renderAdminLayout(mockSuperAdmin)

      // All navigation items should have SVG icons
      const navItems = screen.getAllByRole('link')
      expect(navItems.length).toBeGreaterThan(0)

      // Check that each link contains an SVG
      navItems.forEach((link) => {
        const svg = link.querySelector('svg')
        expect(svg).toBeInTheDocument()
      })
    })
  })

  describe('Responsive Design', () => {
    it('should render navigation in sidebar layout', () => {
      renderAdminLayout(mockSuperAdmin)

      const nav = screen.getByRole('navigation')
      // The navigation itself has the lg:w-64 class
      expect(nav).toHaveClass('lg:w-64')
      expect(nav).toHaveClass('flex-shrink-0')
    })
  })
})

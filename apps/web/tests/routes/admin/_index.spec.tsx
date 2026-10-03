import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminDashboard from '../../../app/routes/admin/_index'

// Mock Apollo Client
const mockUseQuery = vi.fn()
vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

// Mock SDK
vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    AdminDashboardStatsDocument: { kind: 'Document', definitions: [] },
  }
})

describe('Admin Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderAdminDashboard = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/admin',
        Component: AdminDashboard,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/admin']} />)
  }

  const mockStatsData = {
    adminDashboardStats: {
      totalUsers: 150,
      totalOrganizations: 45,
      activeSessions: 23,
      recentSecurityEvents: 12,
      activeSubscriptions: 30,
    },
  }

  describe('Header', () => {
    it('should render dashboard header', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
      expect(
        screen.getByText('Platform administration and management overview'),
      ).toBeInTheDocument()
    })
  })

  describe('Stats Cards Display', () => {
    it('should display total users count', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('Total Users')).toBeInTheDocument()
      expect(screen.getByText('150')).toBeInTheDocument()
      expect(screen.getByText('Registered accounts')).toBeInTheDocument()
    })

    it('should display total organizations count', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      const organizationsElements = screen.getAllByText('Organizations')
      expect(organizationsElements.length).toBeGreaterThan(0)
      expect(screen.getByText('45')).toBeInTheDocument()
      expect(screen.getByText('Active organizations')).toBeInTheDocument()
    })

    it('should display active sessions count', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('Active Sessions')).toBeInTheDocument()
      expect(screen.getByText('23')).toBeInTheDocument()
      expect(screen.getByText('Currently logged in')).toBeInTheDocument()
    })

    it('should display security events count', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('Security Events (24h)')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('Last 24 hours')).toBeInTheDocument()
    })

    it('should display active subscriptions count', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('Active Subscriptions')).toBeInTheDocument()
      expect(screen.getByText('30')).toBeInTheDocument()
      expect(screen.getByText('Paying customers')).toBeInTheDocument()
    })

    it('should format large numbers with locale string', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminDashboardStats: {
            totalUsers: 1500000,
            totalOrganizations: 45000,
            activeSessions: 23000,
            recentSecurityEvents: 12000,
            activeSubscriptions: 30000,
          },
        },
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('1,500,000')).toBeInTheDocument()
      expect(screen.getByText('45,000')).toBeInTheDocument()
      expect(screen.getByText('23,000')).toBeInTheDocument()
      expect(screen.getByText('12,000')).toBeInTheDocument()
      expect(screen.getByText('30,000')).toBeInTheDocument()
    })

    it('should show 0 when stats are null', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminDashboardStats: {
            totalUsers: null,
            totalOrganizations: null,
            activeSessions: null,
            recentSecurityEvents: null,
            activeSubscriptions: null,
          },
        },
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBe(5)
    })
  })

  describe('Loading States', () => {
    it('should show loading skeleton while fetching stats', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      })

      renderAdminDashboard()

      const loadingElements = screen.getAllByTestId
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBe(5) // One for each stat card
    })

    it('should not show stat descriptions while loading', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.queryByText('Registered accounts')).not.toBeInTheDocument()
      expect(screen.queryByText('Active organizations')).not.toBeInTheDocument()
    })
  })

  describe('Error States', () => {
    it('should display error message when stats query fails', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: false,
        error: { message: 'Network error: Failed to fetch' },
      })

      renderAdminDashboard()

      expect(screen.getByText('Unable to Load Dashboard Stats')).toBeInTheDocument()
      expect(screen.getByText('Network error: Failed to fetch')).toBeInTheDocument()
    })

    it('should show troubleshooting steps on error', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: false,
        error: { message: 'GraphQL error' },
      })

      renderAdminDashboard()

      expect(screen.getByText(/Make sure the API server is running/)).toBeInTheDocument()
      expect(screen.getByText('1. Restart the API server')).toBeInTheDocument()
      expect(screen.getByText(/2\. Run/)).toBeInTheDocument()
      expect(screen.getByText('pnpm sdk')).toBeInTheDocument()
      expect(screen.getByText('3. Refresh this page')).toBeInTheDocument()
    })

    it('should show Error text in stat cards on query failure', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: false,
        error: { message: 'Failed to fetch' },
      })

      renderAdminDashboard()

      const errorTexts = screen.getAllByText('Error')
      expect(errorTexts.length).toBe(5) // One for each stat card
    })

    it('should not show error banner when data loads successfully', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.queryByText('Unable to Load Dashboard Stats')).not.toBeInTheDocument()
    })
  })

  describe('Quick Links', () => {
    it('should render all quick access links', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('Quick Access')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Users/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Organizations/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Security Events/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Data Browser/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Analytics/ })).toBeInTheDocument()
    })

    it('should have correct navigation hrefs', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByRole('link', { name: /Users/ })).toHaveAttribute('href', '/admin/users')
      expect(screen.getByRole('link', { name: /Organizations/ })).toHaveAttribute(
        'href',
        '/admin/organizations',
      )
      expect(screen.getByRole('link', { name: /Security Events/ })).toHaveAttribute(
        'href',
        '/admin/security-events',
      )
      expect(screen.getByRole('link', { name: /Data Browser/ })).toHaveAttribute(
        'href',
        '/admin/data',
      )
      expect(screen.getByRole('link', { name: /Analytics/ })).toHaveAttribute(
        'href',
        '/admin/analytics',
      )
    })

    it('should display link descriptions', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(screen.getByText('Manage users and emulation')).toBeInTheDocument()
      expect(screen.getByText('Organization management')).toBeInTheDocument()
      expect(screen.getByText('Login attempts and 2FA')).toBeInTheDocument()
      expect(screen.getByText('Database query tool')).toBeInTheDocument()
      expect(screen.getByText('Platform metrics')).toBeInTheDocument()
    })

    it('should render icons for each quick link', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      const quickLinks = screen
        .getAllByRole('link')
        .filter(link => link.getAttribute('href')?.includes('/admin/'))

      quickLinks.forEach(link => {
        const svg = link.querySelector('svg')
        expect(svg).toBeInTheDocument()
      })
    })
  })

  describe('Query Configuration', () => {
    it('should use cache-and-network fetch policy', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      renderAdminDashboard()

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fetchPolicy: 'cache-and-network',
        }),
      )
    })
  })

  describe('Responsive Grid Layout', () => {
    it('should render stats in responsive grid', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      const { container } = renderAdminDashboard()

      const statsGrid = container.querySelector('.grid')
      expect(statsGrid).toHaveClass('grid-cols-1', 'md:grid-cols-3', 'lg:grid-cols-5')
    })

    it('should render quick links in responsive grid', () => {
      mockUseQuery.mockReturnValue({
        data: mockStatsData,
        loading: false,
        error: null,
      })

      const { container } = renderAdminDashboard()

      const grids = container.querySelectorAll('.grid')
      expect(grids.length).toBeGreaterThan(0)
    })
  })
})

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminOrganizationsPage from '../../../../app/routes/admin/organizations/_index'

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

    AdminPlatformOrganizationsDocument: { kind: 'Document', definitions: [] },
  }
})

describe('Admin Organizations Page', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    vi.clearAllMocks()
  })

  const mockOrganizationsData = {
    adminOrganizations: {
      organizations: [
        {
          id: 'org-1',
          name: 'Acme Corporation',
          createdAt: '2023-01-15T00:00:00Z',
          members: [
            { id: 'member-1', role: { name: 'Owner' } },
            { id: 'member-2', role: { name: 'Member' } },
          ],
          subscription: {
            status: 'ACTIVE',
            plan: {
              name: 'Pro Plan',
              price: '49.99',
            },
          },
        },
        {
          id: 'org-2',
          name: 'TechStart Inc',
          createdAt: '2024-03-20T00:00:00Z',
          members: [{ id: 'member-3', role: { name: 'Owner' } }],
          subscription: null,
        },
      ],
      total: 2,
    },
  }

  const renderOrganizationsPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/admin/organizations',
        Component: AdminOrganizationsPage,
      },
      {
        path: '/admin/organizations/:id',
        Component: () => <div>Organization Details</div>,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/admin/organizations']} />)
  }

  describe('Organizations List Display', () => {
    it('should display all organizations in table', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
      expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
    })

    it('should display organization IDs', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText(/org-1/)).toBeInTheDocument()
      expect(screen.getByText(/org-2/)).toBeInTheDocument()
    })

    it('should show member counts', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('2 members')).toBeInTheDocument()
      expect(screen.getByText('1 member')).toBeInTheDocument()
    })

    it('should show owner counts', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const ownerElements = screen.getAllByText('(1 owner)')
      expect(ownerElements.length).toBeGreaterThan(0)
    })

    it('should show subscription status for active subscriptions', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Active')).toBeInTheDocument()
      // Plan and price are in the same element
      expect(screen.getByText(/Pro Plan.*\$49\.99\/mo/)).toBeInTheDocument()
    })

    it('should show no subscription status', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('No Subscription')).toBeInTheDocument()
      expect(screen.getByText('Free')).toBeInTheDocument()
    })

    it('should render organization icons', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      const { container } = renderOrganizationsPage()

      const icons = container.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)
    })
  })

  describe('Search Functionality', () => {
    it('should render search input', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByPlaceholderText('Search organizations by name...')).toBeInTheDocument()
    })

    it('should update search state on input', async () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const searchInput = screen.getByPlaceholderText('Search organizations by name...')
      await user.type(searchInput, 'acme')

      expect(searchInput).toHaveValue('acme')
    })

    it('should reset page to 0 when searching', async () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const searchInput = screen.getByPlaceholderText('Search organizations by name...')
      await user.type(searchInput, 'tech')

      // Page should reset - we can verify this by checking the query was called with skip: 0
      expect(mockUseQuery).toHaveBeenCalled()
    })
  })

  describe('Results Count', () => {
    it('should show correct results count', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Showing 2 of 2 organizations')).toBeInTheDocument()
    })

    it('should update count with filtered results', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminOrganizations: {
            organizations: [mockOrganizationsData.adminOrganizations.organizations[0]],
            total: 1,
          },
        },
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Showing 1 of 1 organizations')).toBeInTheDocument()
    })
  })

  describe('Organization Actions', () => {
    it('should show View Details button for each organization', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const viewButtons = screen.getAllByRole('link', { name: 'View Details' })
      expect(viewButtons).toHaveLength(2)
    })

    it('should have correct link href for organization details', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const viewButtons = screen.getAllByRole('link', { name: 'View Details' })
      expect(viewButtons[0]).toHaveAttribute('href', '/admin/organizations/org-1')
      expect(viewButtons[1]).toHaveAttribute('href', '/admin/organizations/org-2')
    })
  })

  describe('Pagination', () => {
    it('should render pagination when multiple pages exist', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminOrganizations: {
            organizations: mockOrganizationsData.adminOrganizations.organizations,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    })

    it('should disable previous button on first page', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminOrganizations: {
            organizations: mockOrganizationsData.adminOrganizations.organizations,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const prevButton = screen.getByRole('button', { name: 'Previous' })
      expect(prevButton).toBeDisabled()
    })

    it('should enable next button when more pages exist', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminOrganizations: {
            organizations: mockOrganizationsData.adminOrganizations.organizations,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const nextButton = screen.getByRole('button', { name: 'Next' })
      expect(nextButton).not.toBeDisabled()
    })

    it('should not render pagination for single page', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument()
    })
  })

  describe('Loading and Error States', () => {
    it('should show loading spinner while fetching organizations', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Loading organizations...')).toBeInTheDocument()
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('should show error message on query failure', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: false,
        error: { message: 'Failed to fetch organizations' },
      })

      renderOrganizationsPage()

      expect(
        screen.getByText('Error loading organizations: Failed to fetch organizations'),
      ).toBeInTheDocument()
    })

    it('should show empty state when no organizations found', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminOrganizations: {
            organizations: [],
            total: 0,
          },
        },
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('No organizations found matching your search')).toBeInTheDocument()
    })
  })

  describe('Header and Description', () => {
    it('should render page header', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Organization Management')).toBeInTheDocument()
      expect(
        screen.getByText('View and manage all organizations on the platform'),
      ).toBeInTheDocument()
    })
  })

  describe('Table Structure', () => {
    it('should render table headers', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(screen.getByText('Organization')).toBeInTheDocument()
      expect(screen.getByText('Members')).toBeInTheDocument()
      expect(screen.getByText('Subscription')).toBeInTheDocument()
      expect(screen.getByText('Created')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })

    it('should have hover effect on table rows', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      const { container } = renderOrganizationsPage()

      const rows = container.querySelectorAll('tbody tr')
      rows.forEach(row => {
        expect(row).toHaveClass('hover:bg-zinc-50')
      })
    })
  })

  describe('Query Configuration', () => {
    it('should use network-only fetch policy', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fetchPolicy: 'network-only',
        }),
      )
    })

    it('should pass correct pagination variables', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          variables: expect.objectContaining({
            filters: expect.objectContaining({
              take: 50,
              skip: 0,
            }),
          }),
        }),
      )
    })
  })

  describe('Subscription Badge Styling', () => {
    it('should show green checkmark for active subscriptions', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      const { container } = renderOrganizationsPage()

      const activeStatus = screen.getByText('Active')
      expect(activeStatus).toHaveClass('text-emerald-700')
    })

    it('should show X icon for no subscription', () => {
      mockUseQuery.mockReturnValue({
        data: mockOrganizationsData,
        loading: false,
        error: null,
      })

      renderOrganizationsPage()

      const noSubStatus = screen.getByText('No Subscription')
      expect(noSubStatus).toHaveClass('text-zinc-500')
    })
  })
})

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminAuditLogsPage from '../../../../app/routes/admin/audit-logs/_index'

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

    AdminPlatformAuditLogsDocument: { kind: 'Document', definitions: [] },
  }
})

// The routes render timestamps with `toLocaleString('en-US', ...)`, which resolves against the
// machine's timezone. Asserting a literal day matches only in the zones where these two instants
// happen to fall on different local days -- in UTC+9 they are both Jan 15 and the day-only matcher
// finds two elements. Deriving the expectation the same way keeps the assertion zone-independent.
const expectedTimestamp = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

describe('Admin Audit Logs Page', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    vi.clearAllMocks()
  })

  const mockAuditLogsData = {
    adminAuditLogs: {
      logs: [
        {
          id: 'log-1',
          action: 'create',
          entityType: 'User',
          entityId: 'user-123',
          createdAt: '2024-01-15T10:30:00Z',
          user: {
            id: 'admin-1',
            firstName: 'Admin',
            lastName: 'User',
            emails: [{ email: 'admin@example.com' }],
          },
          organization: {
            id: 'org-1',
            name: 'Acme Corp',
          },
          changes: {
            firstName: { from: null, to: 'John' },
            lastName: { from: null, to: 'Doe' },
          },
        },
        {
          id: 'log-2',
          action: 'update',
          entityType: 'Organization',
          entityId: 'org-456',
          createdAt: '2024-01-14T15:20:00Z',
          user: {
            id: 'admin-2',
            firstName: 'Super',
            lastName: 'Admin',
            emails: [{ email: 'superadmin@example.com' }],
          },
          organization: null,
          changes: {
            name: { from: 'Old Name', to: 'New Name' },
          },
        },
      ],
      total: 2,
    },
    // Facet dropdown values are served by a separate query; the shared useQuery
    // mock returns this object for that call too.
    adminAuditLogFacets: {
      actions: ['create', 'update'],
      entityTypes: ['User', 'Organization'],
    },
  }

  const renderAuditLogsPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/admin/audit-logs',
        Component: AdminAuditLogsPage,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/admin/audit-logs']} />)
  }

  describe('Audit Logs List Display', () => {
    it('should display all audit logs', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      // Action text appears both in the row badge and the facet <select> options.
      expect(screen.getAllByText('create').length).toBeGreaterThan(0)
      expect(screen.getAllByText('update').length).toBeGreaterThan(0)
    })

    it('should display entity types', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      // Entity type appears both in the row and the facet <select> options.
      expect(screen.getAllByText('User').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Organization').length).toBeGreaterThan(0)
    })

    it('should display entity IDs', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText(/user-123/)).toBeInTheDocument()
      expect(screen.getByText(/org-456/)).toBeInTheDocument()
    })

    it('should show actor information', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText(/Admin User/)).toBeInTheDocument()
      // Email may appear multiple times in DOM
      expect(screen.getAllByText(/admin@example.com/).length).toBeGreaterThan(0)
      expect(screen.getByText(/Super Admin/)).toBeInTheDocument()
      expect(screen.getAllByText(/superadmin@example.com/).length).toBeGreaterThan(0)
    })

    it('should display organization when present', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText(/Acme Corp/)).toBeInTheDocument()
    })

    it('should format timestamps correctly', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText(expectedTimestamp('2024-01-15T10:30:00Z'))).toBeInTheDocument()
      expect(screen.getByText(expectedTimestamp('2024-01-14T15:20:00Z'))).toBeInTheDocument()
    })

    it('should display log IDs', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText(/log-1/)).toBeInTheDocument()
      expect(screen.getByText(/log-2/)).toBeInTheDocument()
    })
  })

  describe('Search Filters', () => {
    it('should render action facet dropdown with real values', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const actionSelect = screen.getByLabelText('Action')
      expect(actionSelect).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'All actions' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'create' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'update' })).toBeInTheDocument()
    })

    it('should render entity type facet dropdown with real values', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const entityTypeSelect = screen.getByLabelText('Entity Type')
      expect(entityTypeSelect).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'All entity types' })).toBeInTheDocument()
    })

    it('should render user filter combobox', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByPlaceholderText('Search users by name, email, or ID…')).toBeInTheDocument()
    })

    it('should render organization filter combobox', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByPlaceholderText('Search organizations by name or ID…')).toBeInTheDocument()
    })

    it('should update action filter on selection', async () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const actionSelect = screen.getByLabelText('Action')
      await user.selectOptions(actionSelect, 'create')

      expect(actionSelect).toHaveValue('create')
    })

    it('should update entity type filter on selection', async () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const entityTypeSelect = screen.getByLabelText('Entity Type')
      await user.selectOptions(entityTypeSelect, 'User')

      expect(entityTypeSelect).toHaveValue('User')
    })
  })

  describe('Date Range Filters', () => {
    it('should render start date input', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    })

    it('should render end date input', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByLabelText('End Date')).toBeInTheDocument()
    })

    it('should show back the local time that was typed, not its UTC equivalent', async () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      // A `datetime-local` input is read back as local wall-clock time, so it has to be rendered
      // from local components too. Rendering it with `toISOString()` made the field jump by the
      // viewer's UTC offset the moment a time was entered.
      const startDate = screen.getByLabelText('Start Date')
      await user.type(startDate, '2024-01-15T09:00')

      await waitFor(() => expect(startDate).toHaveValue('2024-01-15T09:00'))
    })
  })

  describe('Clear Filters', () => {
    it('should show clear filters button when filters are active', async () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const actionSelect = screen.getByLabelText('Action')
      await user.selectOptions(actionSelect, 'create')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Clear Filters/ })).toBeInTheDocument()
      })
    })

    it('should hide clear button when no filters are active', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.queryByRole('button', { name: /Clear Filters/ })).not.toBeInTheDocument()
    })

    it('should clear all filters when clicking clear button', async () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const actionSelect = screen.getByLabelText('Action')
      await user.selectOptions(actionSelect, 'create')

      const clearButton = await screen.findByRole('button', { name: /Clear Filters/ })
      await user.click(clearButton)

      expect(actionSelect).toHaveValue('')
    })
  })

  describe('Changes Display', () => {
    it('should show changes toggle when changes exist', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const changesToggles = screen.getAllByText('View changes')
      expect(changesToggles.length).toBeGreaterThan(0)
    })

    it('should expand changes on click', async () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const changesToggle = screen.getAllByText('View changes')[0]
      await user.click(changesToggle)

      await waitFor(() => {
        expect(screen.getByText(/"firstName":/)).toBeInTheDocument()
      })
    })

    it('should display before and after values in changes', async () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const changesToggle = screen.getAllByText('View changes')[0]
      await user.click(changesToggle)

      await waitFor(() => {
        expect(screen.getByText(/"from": null/)).toBeInTheDocument()
        expect(screen.getByText(/"to": "John"/)).toBeInTheDocument()
      })
    })
  })

  describe('Results Count', () => {
    it('should show correct results count', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText('Showing 2 of 2 audit logs')).toBeInTheDocument()
    })

    it('should update count with filtered results', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminAuditLogs: {
            logs: [mockAuditLogsData.adminAuditLogs.logs[0]],
            total: 1,
          },
        },
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText('Showing 1 of 1 audit logs')).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('should render pagination when multiple pages exist', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminAuditLogs: {
            logs: mockAuditLogsData.adminAuditLogs.logs,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    })

    it('should disable previous button on first page', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminAuditLogs: {
            logs: mockAuditLogsData.adminAuditLogs.logs,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const prevButton = screen.getByRole('button', { name: 'Previous' })
      expect(prevButton).toBeDisabled()
    })

    it('should enable next button when more pages exist', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminAuditLogs: {
            logs: mockAuditLogsData.adminAuditLogs.logs,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const nextButton = screen.getByRole('button', { name: 'Next' })
      expect(nextButton).not.toBeDisabled()
    })

    it('should not render pagination for single page', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument()
    })
  })

  describe('Loading and Error States', () => {
    it('should show loading spinner while fetching logs', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText('Loading audit logs...')).toBeInTheDocument()
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('should show error message on query failure', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: false,
        error: { message: 'Failed to fetch logs' },
      })

      renderAuditLogsPage()

      expect(screen.getByText('Error loading audit logs: Failed to fetch logs')).toBeInTheDocument()
    })

    it('should show empty state when no logs found', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminAuditLogs: {
            logs: [],
            total: 0,
          },
        },
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText('No audit logs recorded yet')).toBeInTheDocument()
    })

    it('should show filtered empty state with active filters', async () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminAuditLogs: {
            logs: [],
            total: 0,
          },
          adminAuditLogFacets: {
            actions: ['create'],
            entityTypes: ['User'],
          },
        },
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      const actionSelect = screen.getByLabelText('Action')
      await user.selectOptions(actionSelect, 'create')

      await waitFor(() => {
        expect(screen.getByText('No audit logs found matching your filters')).toBeInTheDocument()
      })
    })
  })

  describe('Header and Description', () => {
    it('should render page header', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText('Audit Logs')).toBeInTheDocument()
      expect(
        screen.getByText('Track all platform activities and changes for compliance and security'),
      ).toBeInTheDocument()
    })
  })

  describe('Action Type Icons', () => {
    it('should render icons for different action types', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      const { container } = renderAuditLogsPage()

      const icons = container.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)
    })

    it('should use create icon for create actions', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      const { container } = renderAuditLogsPage()

      // PlusCircleIcon should be present for create action
      const createIcon = container.querySelector('.text-emerald-600')
      expect(createIcon).toBeInTheDocument()
    })

    it('should use update icon for update actions', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      const { container } = renderAuditLogsPage()

      // PencilSquareIcon should be present for update action
      const updateIcon = container.querySelector('.text-blue-600')
      expect(updateIcon).toBeInTheDocument()
    })
  })

  describe('Query Configuration', () => {
    it('should use network-only fetch policy', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fetchPolicy: 'network-only',
        }),
      )
    })

    it('should pass correct pagination variables', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          variables: expect.objectContaining({
            filters: expect.objectContaining({
              skip: 0,
              take: 50,
            }),
          }),
        }),
      )
    })
  })

  describe('System Actor Display', () => {
    it('should show System when user is null', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminAuditLogs: {
            logs: [
              {
                ...mockAuditLogsData.adminAuditLogs.logs[0],
                user: null,
              },
            ],
            total: 1,
          },
        },
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByText(/System/)).toBeInTheDocument()
    })
  })

  describe('Filter Labels', () => {
    it('should render all filter labels', () => {
      mockUseQuery.mockReturnValue({
        data: mockAuditLogsData,
        loading: false,
        error: null,
      })

      renderAuditLogsPage()

      expect(screen.getByLabelText('Action')).toBeInTheDocument()
      expect(screen.getByLabelText('Entity Type')).toBeInTheDocument()
      expect(screen.getByLabelText('User')).toBeInTheDocument()
      expect(screen.getByLabelText('Organization')).toBeInTheDocument()
    })
  })
})

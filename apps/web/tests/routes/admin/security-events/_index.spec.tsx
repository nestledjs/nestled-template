import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from "../../../helpers/createTestRouter"
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminSecurityEventsPage from '../../../../app/routes/admin/security-events/_index'

// Mock Apollo Client
const mockUseQuery = vi.fn()
vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

// Mock SDK
vi.mock('@nestled-template/shared/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    
  AdminPlatformSecurityEventsDocument: { kind: 'Document', definitions: [] },
  SecurityEventType: {
    PasswordChanged: 'PasswordChanged',
    EmailChanged: 'EmailChanged',
    TwoFactorEnabled: 'TwoFactorEnabled',
    TwoFactorDisabled: 'TwoFactorDisabled',
    RecoveryCodesGenerated: 'RecoveryCodesGenerated',
    AccountLocked: 'AccountLocked',
    AccountUnlocked: 'AccountUnlocked',
    SuspiciousLoginAttempt: 'SuspiciousLoginAttempt',
    PasswordResetRequested: 'PasswordResetRequested',
    LoginLocationChange: 'LoginLocationChange',
    ApiTokenCreated: 'ApiTokenCreated',
    ApiTokenRevoked: 'ApiTokenRevoked',
    ApiTokenRotated: 'ApiTokenRotated',
  },
  }
})

describe('Admin Security Events Page', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    vi.clearAllMocks()
  })

  const mockSecurityEventsData = {
    adminSecurityEvents: {
      events: [
        {
          id: 'event-1',
          eventType: 'PasswordChanged',
          createdAt: '2024-01-15T10:30:00Z',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          user: {
            id: 'user-1',
            firstName: 'John',
            lastName: 'Doe',
            emails: [{ email: 'john@example.com' }],
          },
          metadata: { reason: 'user_requested' },
        },
        {
          id: 'event-2',
          eventType: 'AccountLocked',
          createdAt: '2024-01-14T15:20:00Z',
          ipAddress: '10.0.0.1',
          userAgent: 'Chrome/120.0.0.0',
          user: {
            id: 'user-2',
            firstName: 'Jane',
            lastName: 'Smith',
            emails: [{ email: 'jane@example.com' }],
          },
          metadata: { attempts: 5 },
        },
      ],
      total: 2,
    },
  }

  const renderSecurityEventsPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/admin/security-events',
        Component: AdminSecurityEventsPage,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/admin/security-events']} />)
  }

  describe('Security Events List Display', () => {
    it('should display all security events', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      // Event type labels appear in both dropdown options and event badges
      expect(screen.getAllByText('Password Changed').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Account Locked').length).toBeGreaterThan(0)
    })

    it('should display event descriptions', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText('User changed their password')).toBeInTheDocument()
      expect(screen.getByText('Account was locked due to suspicious activity')).toBeInTheDocument()
    })

    it('should show user information', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText(/John Doe/)).toBeInTheDocument()
      expect(screen.getByText(/john@example.com/)).toBeInTheDocument()
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument()
      expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
    })

    it('should display IP addresses', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText(/192\.168\.1\.1/)).toBeInTheDocument()
      expect(screen.getByText(/10\.0\.0\.1/)).toBeInTheDocument()
    })

    it('should show user agent information', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText(/Mozilla\/5\.0/)).toBeInTheDocument()
      expect(screen.getByText(/Chrome\/120\.0\.0\.0/)).toBeInTheDocument()
    })

    it('should format timestamps correctly', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
      expect(screen.getByText(/Jan 14, 2024/)).toBeInTheDocument()
    })

    it('should render event type icons', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      const { container } = renderSecurityEventsPage()

      const icons = container.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)
    })

    it('should display event IDs', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText(/event-1/)).toBeInTheDocument()
      expect(screen.getByText(/event-2/)).toBeInTheDocument()
    })
  })

  describe('Event Type Filtering', () => {
    it('should render event type filter dropdown', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByLabelText('Event Type')).toBeInTheDocument()
    })

    it('should show all event type options', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const select = screen.getByLabelText('Event Type') as HTMLSelectElement
      const options = Array.from(select.options).map((opt) => opt.text)

      expect(options).toContain('All Event Types')
      expect(options).toContain('Password Changed')
      expect(options).toContain('Account Locked')
      expect(options).toContain('2FA Enabled')
    })

    it('should update filter on selection', async () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const select = screen.getByLabelText('Event Type')
      await user.selectOptions(select, 'PasswordChanged')

      expect(select).toHaveValue('PasswordChanged')
    })
  })

  describe('Search Filters', () => {
    it('should render user ID search input', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByPlaceholderText('Search by user ID...')).toBeInTheDocument()
    })

    it('should render IP address search input', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByPlaceholderText('Search by IP address...')).toBeInTheDocument()
    })

    it('should update user ID filter on input', async () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const userIdInput = screen.getByPlaceholderText('Search by user ID...')
      await user.type(userIdInput, 'user-123')

      expect(userIdInput).toHaveValue('user-123')
    })

    it('should update IP address filter on input', async () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const ipInput = screen.getByPlaceholderText('Search by IP address...')
      await user.type(ipInput, '192.168.1.1')

      expect(ipInput).toHaveValue('192.168.1.1')
    })
  })

  describe('Date Range Filters', () => {
    it('should render start date input', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    })

    it('should render end date input', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByLabelText('End Date')).toBeInTheDocument()
    })
  })

  describe('Clear Filters', () => {
    it('should show clear filters button when filters are active', async () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const userIdInput = screen.getByPlaceholderText('Search by user ID...')
      await user.type(userIdInput, 'user-123')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Clear Filters/ })).toBeInTheDocument()
      })
    })

    it('should hide clear button when no filters are active', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.queryByRole('button', { name: /Clear Filters/ })).not.toBeInTheDocument()
    })

    it('should clear all filters when clicking clear button', async () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const userIdInput = screen.getByPlaceholderText('Search by user ID...')
      await user.type(userIdInput, 'user-123')

      const clearButton = await screen.findByRole('button', { name: /Clear Filters/ })
      await user.click(clearButton)

      expect(userIdInput).toHaveValue('')
    })
  })

  describe('Event Metadata', () => {
    it('should show metadata toggle for events with metadata', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const metadataToggles = screen.getAllByText('View metadata')
      expect(metadataToggles.length).toBeGreaterThan(0)
    })

    it('should expand metadata on click', async () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const metadataToggle = screen.getAllByText('View metadata')[0]
      await user.click(metadataToggle)

      await waitFor(() => {
        expect(screen.getByText(/"reason": "user_requested"/)).toBeInTheDocument()
      })
    })
  })

  describe('Results Count', () => {
    it('should show correct results count', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText('Showing 2 of 2 security events')).toBeInTheDocument()
    })

    it('should update count with filtered results', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminSecurityEvents: {
            events: [mockSecurityEventsData.adminSecurityEvents.events[0]],
            total: 1,
          },
        },
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText('Showing 1 of 1 security events')).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('should render pagination when multiple pages exist', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminSecurityEvents: {
            events: mockSecurityEventsData.adminSecurityEvents.events,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    })

    it('should disable previous button on first page', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminSecurityEvents: {
            events: mockSecurityEventsData.adminSecurityEvents.events,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const prevButton = screen.getByRole('button', { name: 'Previous' })
      expect(prevButton).toBeDisabled()
    })

    it('should enable next button when more pages exist', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminSecurityEvents: {
            events: mockSecurityEventsData.adminSecurityEvents.events,
            total: 100,
          },
        },
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const nextButton = screen.getByRole('button', { name: 'Next' })
      expect(nextButton).not.toBeDisabled()
    })
  })

  describe('Loading and Error States', () => {
    it('should show loading spinner while fetching events', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText('Loading security events...')).toBeInTheDocument()
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('should show error message on query failure', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        loading: false,
        error: { message: 'Failed to fetch events' },
      })

      renderSecurityEventsPage()

      expect(screen.getByText('Error loading events: Failed to fetch events')).toBeInTheDocument()
    })

    it('should show empty state when no events found', () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminSecurityEvents: {
            events: [],
            total: 0,
          },
        },
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText('No security events recorded yet')).toBeInTheDocument()
    })

    it('should show filtered empty state with active filters', async () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminSecurityEvents: {
            events: [],
            total: 0,
          },
        },
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      const userIdInput = screen.getByPlaceholderText('Search by user ID...')
      await user.type(userIdInput, 'nonexistent')

      await waitFor(() => {
        expect(screen.getByText('No events found matching your filters')).toBeInTheDocument()
      })
    })
  })

  describe('Header and Description', () => {
    it('should render page header', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(screen.getByText('Security Events')).toBeInTheDocument()
      expect(
        screen.getByText('Monitor login attempts, 2FA events, and security incidents across the platform')
      ).toBeInTheDocument()
    })
  })


  describe('Query Configuration', () => {
    it('should use network-only fetch policy', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fetchPolicy: 'network-only',
        })
      )
    })

    it('should pass correct pagination variables', () => {
      mockUseQuery.mockReturnValue({
        data: mockSecurityEventsData,
        loading: false,
        error: null,
      })

      renderSecurityEventsPage()

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          variables: expect.objectContaining({
            filters: expect.objectContaining({
              skip: 0,
              take: 50,
            }),
          }),
        })
      )
    })
  })

})

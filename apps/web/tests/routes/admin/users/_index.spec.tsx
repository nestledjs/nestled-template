import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from "../../../helpers/createTestRouter"
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminUsersPage from '../../../../app/routes/admin/users/_index'

// Mock Apollo Client
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

// Mock SDK
vi.mock('@nestled-template/shared/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    
  AdminUserManagementDocument: { kind: 'Document', definitions: [] },
  EmulateUserDocument: { kind: 'Document', definitions: [] },
  AdminUserManagementDetailsDocument: { kind: 'Document', definitions: [] },
  }
})

// Mock navigation
const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('Admin Users Management Page', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    vi.clearAllMocks()
    delete (window as any).location
    ;(window as any).location = { href: '' }

    // Default mock for useMutation that calls onCompleted/onError callbacks
    mockUseMutation.mockImplementation((_document, options) => {
      const mutationFn = vi.fn().mockImplementation(async (args) => {
        try {
          const result = { data: {} }
          if (options?.onCompleted) {
            options.onCompleted(result.data)
          }
          return result
        } catch (error) {
          if (options?.onError) {
            options.onError(error)
          }
          throw error
        }
      })
      return [mutationFn, { loading: false, error: null, data: null }]
    })
  })

  const mockUsersData = {
    adminUsers: {
      users: [
        {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          emails: [{ email: 'john@example.com', primary: true, verified: true }],
          isSuperAdmin: false,
          twoFactorEnabled: true,
          lockedUntil: null,
          lastSuccessfulLogin: '2024-01-15T10:30:00Z',
          organizations: [
            {
              id: 'org-user-1',
              organization: { id: 'org-1', name: 'Acme Corp' },
              role: { name: 'Owner' },
            },
          ],
        },
        {
          id: 'user-2',
          firstName: 'Jane',
          lastName: 'Smith',
          emails: [{ email: 'jane@example.com', primary: true, verified: false }],
          isSuperAdmin: true,
          twoFactorEnabled: false,
          lockedUntil: '2099-12-31T23:59:59Z',
          lastSuccessfulLogin: null,
          organizations: [],
        },
      ],
      total: 2,
    },
  }

  const mockUserDetails = {
    adminUserDetails: {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: '2023-01-01T00:00:00Z',
      lastSuccessfulLogin: '2024-01-15T10:30:00Z',
      emails: [
        { id: 'email-1', email: 'john@example.com', primary: true, verified: true },
        { id: 'email-2', email: 'john.doe@example.com', primary: false, verified: false },
      ],
      twoFactorEnabled: true,
      lockedUntil: null,
      isSuperAdmin: false,
      organizations: [
        {
          id: 'org-user-1',
          organization: { id: 'org-1', name: 'Acme Corp', createdAt: '2023-01-01T00:00:00Z' },
          role: { name: 'Owner' },
        },
      ],
      activeSessions: [
        {
          id: 'session-1',
          isValid: true,
          deviceInfo: 'Chrome on MacOS',
          ipAddress: '192.168.1.1',
          lastActiveAt: '2024-01-15T10:30:00Z',
        },
      ],
      AuditLog: [
        {
          id: 'log-1',
          action: 'login',
          entityType: 'User',
          entityId: 'user-1',
          createdAt: '2024-01-15T10:30:00Z',
        },
      ],
    },
  }

  const renderUsersPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/admin/users',
        Component: AdminUsersPage,
      },
      {
        path: '/members/dashboard',
        Component: () => <div>Members Dashboard</div>,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/admin/users']} />)
  }

  describe('Users List Display', () => {
    it('should display all users in table', () => {
      mockUseQuery.mockImplementation((doc) => {
        if (doc === 'AdminUserManagementDocument' || doc.kind) {
          return {
            data: mockUsersData,
            loading: false,
            error: null,
            refetch: vi.fn(),
          }
        }
        return { data: null, loading: false, error: null }
      })

      renderUsersPage()

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    })

    it('should display user email addresses', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    })

    it('should show super admin badge', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Super Admin')).toBeInTheDocument()
    })

    it('should display email verification status', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Verified')).toBeInTheDocument()
      expect(screen.getByText('Not Verified')).toBeInTheDocument()
    })

    it('should show 2FA enabled indicator', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('2FA')).toBeInTheDocument()
    })

    it('should show account locked status', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Locked')).toBeInTheDocument()
    })

    it('should display organization memberships', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    it('should show truncated organization count', () => {
      const manyOrgsData = {
        adminUsers: {
          users: [
            {
              ...mockUsersData.adminUsers.users[0],
              organizations: [
                { id: 'org-1', organization: { id: 'o1', name: 'Org 1' }, role: { name: 'Owner' } },
                { id: 'org-2', organization: { id: 'o2', name: 'Org 2' }, role: { name: 'Member' } },
                { id: 'org-3', organization: { id: 'o3', name: 'Org 3' }, role: { name: 'Member' } },
              ],
            },
          ],
          total: 1,
        },
      }

      mockUseQuery.mockImplementation(() => ({
        data: manyOrgsData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('+1 more')).toBeInTheDocument()
    })

    it('should format last login date', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
    })

    it('should show Never for users who never logged in', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Never')).toBeInTheDocument()
    })
  })

  describe('Search and Filtering', () => {
    it('should render search input', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByPlaceholderText('Search by email, name, or ID...')).toBeInTheDocument()
    })

    it('should update search state on input', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const searchInput = screen.getByPlaceholderText('Search by email, name, or ID...')
      await user.type(searchInput, 'john')

      expect(searchInput).toHaveValue('john')
    })

    it('should render filter buttons', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByRole('button', { name: /Super Admins/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Email Verified/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /2FA Enabled/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Locked Accounts/ })).toBeInTheDocument()
    })

    it('should toggle filter when clicking filter button', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const superAdminFilter = screen.getByRole('button', { name: /Super Admins/ })
      await user.click(superAdminFilter)

      expect(superAdminFilter).toHaveClass('border-emerald-500')
    })

    it('should show clear filters button when filters are active', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const emailFilter = screen.getByRole('button', { name: /Email Verified/ })
      await user.click(emailFilter)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Clear All/ })).toBeInTheDocument()
      })
    })

    it('should clear all filters when clicking clear button', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const emailFilter = screen.getByRole('button', { name: /Email Verified/ })
      await user.click(emailFilter)

      const clearButton = await screen.findByRole('button', { name: /Clear All/ })
      await user.click(clearButton)

      expect(screen.queryByRole('button', { name: /Clear All/ })).not.toBeInTheDocument()
    })

    it('should show results count', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Showing 2 of 2 users')).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('should render pagination when multiple pages exist', () => {
      mockUseQuery.mockImplementation(() => ({
        data: {
          adminUsers: {
            users: mockUsersData.adminUsers.users,
            total: 100,
          },
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    })

    it('should disable previous button on first page', () => {
      mockUseQuery.mockImplementation(() => ({
        data: {
          adminUsers: {
            users: mockUsersData.adminUsers.users,
            total: 100,
          },
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const prevButton = screen.getByRole('button', { name: 'Previous' })
      expect(prevButton).toBeDisabled()
    })

    it('should enable next button when more pages exist', () => {
      mockUseQuery.mockImplementation(() => ({
        data: {
          adminUsers: {
            users: mockUsersData.adminUsers.users,
            total: 100,
          },
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const nextButton = screen.getByRole('button', { name: 'Next' })
      expect(nextButton).not.toBeDisabled()
    })
  })

  describe('User Emulation', () => {
    it('should show emulate button for each user', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const emulateButtons = screen.getAllByRole('button', { name: 'Emulate' })
      expect(emulateButtons).toHaveLength(2)
    })

    it('should open confirmation dialog when clicking emulate', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const emulateButton = screen.getAllByRole('button', { name: 'Emulate' })[0]
      await user.click(emulateButton)

      await waitFor(() => {
        expect(screen.getByText('Emulate User?')).toBeInTheDocument()
      })
    })

    it('should show user email in confirmation dialog', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const emulateButton = screen.getAllByRole('button', { name: 'Emulate' })[0]
      await user.click(emulateButton)

      await waitFor(() => {
        const dialog = screen.getByText(/You are about to emulate:/).closest('div[class*="fixed"]')
        expect(dialog).toBeInTheDocument()
        expect(within(dialog!).getByText('john@example.com')).toBeInTheDocument()
      })
    })

    it('should explain emulation consequences in dialog', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const emulateButton = screen.getAllByRole('button', { name: 'Emulate' })[0]
      await user.click(emulateButton)

      await waitFor(() => {
        expect(
          screen.getByText(/This will log you in as this user/)
        ).toBeInTheDocument()
      })
    })

    it('should allow cancelling emulation', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      const emulateButton = screen.getAllByRole('button', { name: 'Emulate' })[0]
      await user.click(emulateButton)

      const cancelButton = await screen.findByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Emulate User?')).not.toBeInTheDocument()
      })
    })

    it('should call emulate mutation on confirmation', async () => {
      const mockEmulate = vi.fn().mockResolvedValue({ data: {} })
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))
      mockUseMutation.mockReturnValue([mockEmulate, { loading: false }])

      renderUsersPage()

      const emulateButton = screen.getAllByRole('button', { name: 'Emulate' })[0]
      await user.click(emulateButton)

      const confirmButton = await screen.findByRole('button', { name: 'Start Emulation' })
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockEmulate).toHaveBeenCalledWith({
          variables: { input: { userId: 'user-1' } },
        })
      })
    })

    it('should redirect to dashboard on successful emulation', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      // Mock mutation that calls onCompleted callback
      mockUseMutation.mockImplementation((_document, options) => {
        const mutationFn = vi.fn().mockImplementation(async () => {
          const result = { data: {} }
          if (options?.onCompleted) {
            options.onCompleted(result.data)
          }
          return result
        })
        return [mutationFn, { loading: false }]
      })

      renderUsersPage()

      const emulateButton = screen.getAllByRole('button', { name: 'Emulate' })[0]
      await user.click(emulateButton)

      const confirmButton = await screen.findByRole('button', { name: 'Start Emulation' })
      await user.click(confirmButton)

      await waitFor(() => {
        expect(window.location.href).toBe('/members/dashboard')
      })
    })

    it('should show error message on emulation failure', async () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      // Mock mutation that calls onError callback
      mockUseMutation.mockImplementation((_document, options) => {
        const mutationFn = vi.fn().mockImplementation(async () => {
          const error = new Error('Emulation failed')
          if (options?.onError) {
            options.onError(error)
          }
          throw error
        })
        return [mutationFn, { loading: false }]
      })

      renderUsersPage()

      const emulateButton = screen.getAllByRole('button', { name: 'Emulate' })[0]
      await user.click(emulateButton)

      const confirmButton = await screen.findByRole('button', { name: 'Start Emulation' })
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Emulation failed')).toBeInTheDocument()
      })
    })

    it('should disable emulate button while emulation is in progress', async () => {
      const mockEmulate = vi.fn().mockImplementation(() => new Promise(() => {
        // Never resolves
      }))
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))
      mockUseMutation.mockReturnValue([mockEmulate, { loading: true }])

      renderUsersPage()

      const emulateButtons = screen.getAllByRole('button', { name: 'Emulate' })
      expect(emulateButtons[0]).toBeDisabled()
    })
  })

  describe('User Detail Modal', () => {
    it('should open modal when clicking View button', async () => {
      mockUseQuery.mockImplementation((doc) => {
        if (doc.kind || typeof doc === 'object') {
          return {
            data: mockUsersData,
            loading: false,
            error: null,
            refetch: vi.fn(),
          }
        }
        return { data: null, loading: false, error: null }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText('User Details')).toBeInTheDocument()
      })
    })

    it('should load and display user details', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.skip) {
          return { data: null, loading: false, error: null }
        }
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        const modal = screen.getByText('User Details').closest('div[class*="fixed"]')
        expect(modal).toBeInTheDocument()
        expect(within(modal!).getByText('John Doe')).toBeInTheDocument()
        expect(within(modal!).getByText('user-1')).toBeInTheDocument()
      })
    })

    it('should close modal when clicking close button', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      const closeButton = await screen.findByRole('button', { name: 'Close' })
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByText('User Details')).not.toBeInTheDocument()
      })
    })

    it('should show loading state while fetching details', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: null,
            loading: true,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin')
        expect(spinner).toBeInTheDocument()
      })
    })

    it('should display email addresses in modal', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getAllByText('john@example.com').length).toBeGreaterThan(0)
        expect(screen.getByText('john.doe@example.com')).toBeInTheDocument()
      })
    })

    it('should show primary email badge', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText('Primary')).toBeInTheDocument()
      })
    })

    it('should display security status', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText('Two-Factor Auth')).toBeInTheDocument()
        expect(screen.getByText('Account Status')).toBeInTheDocument()
      })
    })

    it('should display organizations with roles', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
        expect(screen.getByText('Owner')).toBeInTheDocument()
      })
    })

    it('should display active sessions', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText(/Active Sessions/)).toBeInTheDocument()
        expect(screen.getByText('Chrome on MacOS')).toBeInTheDocument()
        expect(screen.getByText('192.168.1.1')).toBeInTheDocument()
      })
    })

    it('should display recent activity', async () => {
      mockUseQuery.mockImplementation((doc, options) => {
        if (options?.variables?.userId) {
          return {
            data: mockUserDetails,
            loading: false,
            error: null,
          }
        }
        return {
          data: mockUsersData,
          loading: false,
          error: null,
          refetch: vi.fn(),
        }
      })
      mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])

      renderUsersPage()

      const viewButton = screen.getAllByRole('button', { name: /View/ })[0]
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText('Recent Activity')).toBeInTheDocument()
        expect(screen.getByText('login')).toBeInTheDocument()
      })
    })
  })

  describe('Loading and Error States', () => {
    it('should show loading spinner while fetching users', () => {
      mockUseQuery.mockImplementation(() => ({
        data: null,
        loading: true,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Loading users...')).toBeInTheDocument()
    })

    it('should show error message on query failure', () => {
      mockUseQuery.mockImplementation(() => ({
        data: null,
        loading: false,
        error: { message: 'Network error' },
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('Error loading users: Network error')).toBeInTheDocument()
    })

    it('should show empty state when no users match criteria', () => {
      mockUseQuery.mockImplementation(() => ({
        data: { adminUsers: { users: [], total: 0 } },
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('No users found matching your criteria')).toBeInTheDocument()
    })
  })

  describe('Header and Description', () => {
    it('should render page header', () => {
      mockUseQuery.mockImplementation(() => ({
        data: mockUsersData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      }))

      renderUsersPage()

      expect(screen.getByText('User Management')).toBeInTheDocument()
      expect(screen.getByText('Manage users, view activity, and emulate user sessions')).toBeInTheDocument()
    })
  })
})

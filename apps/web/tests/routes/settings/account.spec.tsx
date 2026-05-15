import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createTestRouter } from '../../helpers/createTestRouter'
import AccountSettings from '../../../app/routes/settings/account'

import { useLoaderData } from 'react-router'

// Mock Apollo Client
const mockUseReadQuery = vi.fn()
const mockUseMutation = vi.fn()
const mockUseLazyQuery = vi.fn()
const mockUseQuery = vi.fn()
vi.mock('@apollo/client/react', () => ({
  useReadQuery: (...args: unknown[]) => mockUseReadQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useLazyQuery: (...args: unknown[]) => mockUseLazyQuery(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

// Mock React Router
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useLoaderData: vi.fn(),
  }
})

// Mock SDK (for DocumentNode exports)
vi.mock('@nestled-template/shared/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    Me: { kind: 'Document', definitions: [] },
    DeleteUserAccount: { kind: 'Document', definitions: [] },
    ExportUserData: { kind: 'Document', definitions: [] },
    ResendVerificationEmail: { kind: 'Document', definitions: [] },
    MyOrganizationsWithMembers: { kind: 'Document', definitions: [] },
    TransferOrganizationOwnership: { kind: 'Document', definitions: [] },
  }
})

// Mock @nestled-template/web (for TransferOwnershipModal)
vi.mock('@nestled-template/web', async () => {
  const actual = await vi.importActual('@nestled-template/web')
  return {
    ...actual,
    TransferOwnershipModal: ({ isOpen, onClose }: any) =>
      isOpen ? (
        <div data-testid="transfer-modal">
          <h3>Transfer Ownership Modal</h3>
          <button onClick={onClose}>Close Modal</button>
        </div>
      ) : null,
  }
})

describe('AccountSettings', () => {
  const mockDeleteAccount = vi.fn()
  const mockExportUserData = vi.fn()
  const mockResendVerificationEmail = vi.fn()

  const mockUser = {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    emails: [{ email: 'john@example.com', primary: true }],
    emailValidated: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    isSuperAdmin: false,
  }

  beforeEach(() => {
    // Mock useLoaderData to return the QueryRef
    vi.mocked(useLoaderData).mockReturnValue({
      meQueryRef: {} as any,
    })

    // Clear and set up mocks
    mockUseReadQuery.mockReset()
    mockUseMutation.mockReset()
    mockUseLazyQuery.mockReset()
    mockUseQuery.mockReset()

    // Mock useReadQuery for Me query (used by AccountSettings)
    mockUseReadQuery.mockImplementation(() => ({
      data: { me: mockUser },
    }))

    // Mock useQuery for TransferOwnershipModal (Me + MyOrganizationsWithMembers)
    let queryCallCount = 0
    mockUseQuery.mockImplementation(() => {
      queryCallCount++
      if (queryCallCount % 2 === 1) {
        // Odd calls: Me query
        return {
          data: { me: mockUser },
          loading: false,
          error: null,
        }
      }
      // Even calls: MyOrganizationsWithMembers query
      return {
        data: { myOrganizations: [] },
        loading: false,
        error: null,
      }
    })

    // Mock useMutation - will be called twice (DeleteUserAccount, ResendVerificationEmail)
    let mutationCallCount = 0
    mockUseMutation.mockImplementation(() => {
      mutationCallCount++
      if (mutationCallCount % 2 === 1) {
        // Odd calls: DeleteUserAccount
        return [mockDeleteAccount, { loading: false }]
      }
      // Even calls: ResendVerificationEmail
      return [mockResendVerificationEmail, { loading: false }]
    })

    // Mock useLazyQuery for ExportUserData
    mockUseLazyQuery.mockReturnValue([mockExportUserData, { loading: false }])

    global.alert = vi.fn()
    Object.assign(window, {
      location: { href: '' },
    })
    URL.createObjectURL = vi.fn(() => 'mock-url')
  })

  const renderWithRouter = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/settings/account',
        Component: AccountSettings,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/settings/account']} />)
  }

  describe('Basic Rendering', () => {
    it('should render page header', () => {
      renderWithRouter()

      expect(screen.getByText('Account Settings')).toBeInTheDocument()
      expect(
        screen.getByText('Manage your personal account information and preferences')
      ).toBeInTheDocument()
    })

    it('should render user information', () => {
      renderWithRouter()

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
    })

    it('should render all main sections', () => {
      renderWithRouter()

      expect(screen.getByText('Personal Information')).toBeInTheDocument()
      expect(screen.getByText('Account Information')).toBeInTheDocument()
      expect(screen.getByText('Export Your Data')).toBeInTheDocument()
      expect(screen.getByText('Transfer Organization Ownership')).toBeInTheDocument()
      expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    })
  })

  describe('Email Verification', () => {
    it('should show verify button for unverified email', () => {
      mockUseReadQuery.mockReset()
      mockUseReadQuery.mockImplementation(() => ({
        data: {
          me: {
            ...mockUser,
            emailValidated: false,
          },
        },
      }))

      renderWithRouter()

      expect(screen.getByRole('button', { name: /verify email/i })).toBeInTheDocument()
    })

    it('should not show verify button for verified email', () => {
      renderWithRouter()

      expect(screen.queryByRole('button', { name: /verify email/i })).not.toBeInTheDocument()
    })
  })

  describe('Data Export', () => {
    it('should have export button', () => {
      renderWithRouter()

      expect(screen.getByRole('button', { name: /export personal data/i })).toBeInTheDocument()
    })

    it('should call export when button clicked', async () => {
      const user = userEvent.setup()
      mockExportUserData.mockResolvedValue({
        data: { exportUserData: { userData: {} } },
      })

      renderWithRouter()

      const exportButton = screen.getByRole('button', { name: /export personal data/i })
      await user.click(exportButton)

      expect(mockExportUserData).toHaveBeenCalled()
    })
  })

  describe('Transfer Ownership', () => {
    it('should have transfer ownership button', () => {
      renderWithRouter()

      expect(screen.getByRole('button', { name: /transfer ownership/i })).toBeInTheDocument()
    })

    it('should open modal when clicked', async () => {
      const user = userEvent.setup()

      renderWithRouter()

      const button = screen.getByRole('button', { name: /transfer ownership/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByTestId('transfer-modal')).toBeInTheDocument()
      })
    })
  })

  describe('Delete Account', () => {
    it('should have delete account button', () => {
      renderWithRouter()

      expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument()
    })

    it('should show confirmation when clicked', async () => {
      const user = userEvent.setup()

      renderWithRouter()

      const deleteButton = screen.getByRole('button', { name: /delete my account/i })
      await user.click(deleteButton)

      expect(screen.getByText(/are you absolutely sure/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/type delete to confirm/i)).toBeInTheDocument()
    })

    it('should require DELETE text to enable confirm button', async () => {
      const user = userEvent.setup()

      renderWithRouter()

      const deleteButton = screen.getByRole('button', { name: /delete my account/i })
      await user.click(deleteButton)

      const confirmButton = screen.getByRole('button', { name: /i understand, delete my account/i })
      expect(confirmButton).toBeDisabled()

      const input = screen.getByPlaceholderText(/type delete to confirm/i)
      await user.type(input, 'DELETE')

      expect(confirmButton).not.toBeDisabled()
    })
  })
})

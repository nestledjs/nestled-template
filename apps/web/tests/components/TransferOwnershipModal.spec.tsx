import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransferOwnershipModal } from '@nestled-template/web'

// Mock Apollo Client
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

// Mock SDK (for DocumentNode exports)
vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    Me: { kind: 'Document', definitions: [] },
    MyOrganizationsWithMembers: { kind: 'Document', definitions: [] },
    TransferOrganizationOwnership: { kind: 'Document', definitions: [] },
  }
})

function closestSelect(element: HTMLElement): HTMLSelectElement {
  const select = element.closest('select')
  if (!(select instanceof HTMLSelectElement)) {
    throw new TypeError('Expected element to be inside a select')
  }
  return select
}

function closestButton(element: Element): HTMLButtonElement {
  const button = element.closest('button')
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError('Expected element to be inside a button')
  }
  return button
}

function requiredElement(element: Element | null, message: string): Element {
  if (!element) {
    throw new Error(message)
  }
  return element
}

describe('TransferOwnershipModal Component', () => {
  let mockTransferOwnership: ReturnType<typeof vi.fn>
  let mockOnClose: ReturnType<typeof vi.fn>
  let mockOnSuccess: ReturnType<typeof vi.fn>

  const mockCurrentUser = {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
  }

  const mockOrganizations = [
    {
      id: 'org-1',
      name: 'Acme Corp',
      members: [
        {
          id: 'member-1',
          role: { name: 'Owner' },
          user: { id: 'user-1', firstName: 'John', lastName: 'Doe' },
        },
        {
          id: 'member-2',
          role: { name: 'Admin' },
          user: { id: 'user-2', firstName: 'Jane', lastName: 'Smith' },
        },
      ],
    },
    {
      id: 'org-2',
      name: 'Tech Solutions Inc',
      members: [
        {
          id: 'member-3',
          role: { name: 'Owner' },
          user: { id: 'user-1', firstName: 'John', lastName: 'Doe' },
        },
      ],
    },
  ]

  beforeEach(() => {
    mockUseQuery.mockClear()
    mockUseMutation.mockClear()

    mockTransferOwnership = vi.fn().mockResolvedValue({
      data: { transferOrganizationOwnership: { success: true } },
    })
    mockOnClose = vi.fn()
    mockOnSuccess = vi.fn()

    // Default mock setup - can be overridden in individual tests
    // Mock useQuery - will be called twice (Me, MyOrganizationsWithMembers)
    let callCount = 0
    mockUseQuery.mockImplementation(() => {
      callCount++
      if (callCount % 2 === 1) {
        // Odd calls (1, 3, 5...): Me query
        return {
          data: { me: mockCurrentUser },
          loading: false,
          error: null,
        }
      }
      // Even calls (2, 4, 6...): MyOrganizationsWithMembers query
      return {
        data: { myOrganizations: mockOrganizations },
        loading: false,
        error: null,
      }
    })

    // Mock useMutation
    mockUseMutation.mockReturnValue([mockTransferOwnership, { loading: false, error: null }])

    vi.stubGlobal('alert', vi.fn())
  })

  const renderModal = (isOpen = true) => {
    return render(
      <TransferOwnershipModal isOpen={isOpen} onClose={mockOnClose} onSuccess={mockOnSuccess} />,
    )
  }

  describe('Modal Visibility', () => {
    it('should render modal heading when isOpen is true', () => {
      renderModal(true)

      expect(screen.getByRole('heading', { name: 'Transfer Ownership' })).toBeInTheDocument()
    })

    it('should not render when isOpen is false', () => {
      renderModal(false)

      expect(screen.queryByRole('heading', { name: 'Transfer Ownership' })).not.toBeInTheDocument()
    })

    it('should render modal backdrop', () => {
      const { container } = renderModal(true)

      const backdrop = container.querySelector(String.raw`.fixed.inset-0.bg-black\/50`)
      expect(backdrop).toBeInTheDocument()
    })

    it('should render close button', () => {
      const { container } = renderModal(true)

      // Find close button by its icon container
      const closeButton = container
        .querySelector('button .h-5.w-5.text-zinc-500')
        ?.closest('button')
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('Data Loading', () => {
    it('should show loading state while data is loading', () => {
      // Clear and reset the mock for this specific test
      mockUseQuery.mockClear()

      let callCount = 0
      mockUseQuery.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // First call: Me query
          return {
            data: { me: mockCurrentUser },
            loading: false,
            error: null,
          }
        }
        // Second call: MyOrganizationsWithMembers query - loading
        return {
          data: null,
          loading: true,
          error: null,
        }
      })

      renderModal(true)

      expect(screen.getByText('Loading organizations...')).toBeInTheDocument()
    })

    it('should load user organizations on mount', () => {
      renderModal(true)

      expect(mockUseQuery).toHaveBeenCalled()
    })

    it('should load current user data on mount', () => {
      renderModal(true)

      expect(mockUseQuery).toHaveBeenCalled()
    })

    it('should show message when user has no owned organizations', () => {
      // Clear and reset the mock for this specific test
      mockUseQuery.mockClear()

      let callCount = 0
      mockUseQuery.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // First call: Me query
          return {
            data: { me: mockCurrentUser },
            loading: false,
            error: null,
          }
        }
        // Second call: MyOrganizationsWithMembers query - empty
        return {
          data: { myOrganizations: [] },
          loading: false,
          error: null,
        }
      })

      renderModal(true)

      expect(screen.getByText("You don't own any organizations to transfer.")).toBeInTheDocument()
    })

    it('should show organization dropdown when data is loaded', () => {
      renderModal(true)

      // Check for the first organization in the dropdown
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('Tech Solutions Inc')).toBeInTheDocument()
    })
  })

  describe('Transfer Flow', () => {
    it('should show new owner dropdown after selecting organization', async () => {
      const user = userEvent.setup()
      renderModal(true)

      // Select an organization
      const orgSelect = closestSelect(screen.getByText('Choose an organization...'))
      await user.selectOptions(orgSelect, 'org-1')

      // Should show new owner selection
      await waitFor(() => {
        expect(screen.getByText(/Select New Owner/)).toBeInTheDocument()
      })
    })

    it('should show warning when organization and owner selected', async () => {
      const user = userEvent.setup()
      renderModal(true)

      // Select organization
      const orgSelect = closestSelect(screen.getByText('Choose an organization...'))
      await user.selectOptions(orgSelect, 'org-1')

      // Select new owner
      const ownerSelect = await screen.findByText('Choose new owner...')
      await user.selectOptions(closestSelect(ownerSelect), 'user-2')

      // Should show warning
      await waitFor(() => {
        expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()
      })
    })

    it('should show confirmation input when selections are made', async () => {
      const user = userEvent.setup()
      renderModal(true)

      // Select organization and owner
      const orgSelect = closestSelect(screen.getByText('Choose an organization...'))
      await user.selectOptions(orgSelect, 'org-1')

      const ownerSelect = await screen.findByText('Choose new owner...')
      await user.selectOptions(closestSelect(ownerSelect), 'user-2')

      // Should show confirmation input
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type TRANSFER to confirm')).toBeInTheDocument()
      })
    })

    it('should disable transfer button until all fields are filled', async () => {
      const user = userEvent.setup()
      renderModal(true)

      const transferButton = screen.getByRole('button', { name: 'Transfer Ownership' })
      expect(transferButton).toBeDisabled()

      // Select organization
      const orgSelect = closestSelect(screen.getByText('Choose an organization...'))
      await user.selectOptions(orgSelect, 'org-1')
      expect(transferButton).toBeDisabled()

      // Select new owner
      const ownerSelect = await screen.findByText('Choose new owner...')
      await user.selectOptions(closestSelect(ownerSelect), 'user-2')
      expect(transferButton).toBeDisabled()

      // Type confirmation
      const confirmInput = await screen.findByPlaceholderText('Type TRANSFER to confirm')
      await user.type(confirmInput, 'TRANSFER')

      await waitFor(() => {
        expect(transferButton).not.toBeDisabled()
      })
    })

    it('should show message when organization has no other members', async () => {
      const user = userEvent.setup()
      renderModal(true)

      // Select org with no other members (org-2 only has current user)
      const orgSelect = closestSelect(screen.getByText('Choose an organization...'))
      await user.selectOptions(orgSelect, 'org-2')

      await waitFor(() => {
        expect(
          screen.getByText('No other members available to transfer ownership to.'),
        ).toBeInTheDocument()
      })
    })
  })

  describe('Modal Closing', () => {
    it('should close on cancel button click', async () => {
      const user = userEvent.setup()
      renderModal(true)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close on X button click', async () => {
      const user = userEvent.setup()
      const { container } = renderModal(true)

      const closeIcon = container.querySelector('button .h-5.w-5.text-zinc-500')
      const closeButton = closestButton(requiredElement(closeIcon, 'Expected close icon'))
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close on backdrop click', async () => {
      const user = userEvent.setup()
      const { container } = renderModal(true)

      const backdrop = requiredElement(
        container.querySelector(String.raw`.fixed.inset-0.bg-black\/50`),
        'Expected backdrop',
      )
      await user.click(backdrop)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      renderModal(true)

      const heading = screen.getByRole('heading', { name: 'Transfer Ownership' })
      expect(heading.tagName).toBe('H2')
    })

    it('should have descriptive button text', () => {
      renderModal(true)

      expect(screen.getByRole('button', { name: 'Transfer Ownership' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('should have input placeholders for guidance', async () => {
      const user = userEvent.setup()
      renderModal(true)

      // Select org and owner to reveal confirmation input
      const orgSelect = closestSelect(screen.getByText('Choose an organization...'))
      await user.selectOptions(orgSelect, 'org-1')

      const ownerSelect = await screen.findByText('Choose new owner...')
      await user.selectOptions(closestSelect(ownerSelect), 'user-2')

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type TRANSFER to confirm')).toBeInTheDocument()
      })
    })
  })
})

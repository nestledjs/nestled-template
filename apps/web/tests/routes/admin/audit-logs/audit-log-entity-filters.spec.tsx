import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  OrganizationFilterCombobox,
  UserFilterCombobox,
} from '../../../../app/components/audit-log-entity-filters'

// Mock Apollo Client — the picker components each call useQuery.
const mockUseQuery = vi.fn()
vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

describe('Audit log entity filter comboboxes', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    vi.clearAllMocks()
  })

  describe('UserFilterCombobox', () => {
    const withUser = () =>
      mockUseQuery.mockReturnValue({
        data: {
          adminUsers: {
            users: [
              {
                id: 'user-1',
                firstName: 'Ada',
                lastName: 'Lovelace',
                emails: [{ email: 'ada@example.com', primary: true }],
              },
            ],
            total: 1,
          },
        },
        loading: false,
      })

    it('renders matching users as options (id + primary email as sublabel)', async () => {
      withUser()
      render(<UserFilterCombobox value={null} onChange={vi.fn()} />)

      const input = screen.getByPlaceholderText('Search users by name, email, or ID…')
      await user.click(input)
      await user.type(input, 'ada')

      expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
      expect(screen.getByText(/ada@example.com · user-1/)).toBeInTheDocument()
    })

    it('does not query or render options until a search term is entered', async () => {
      withUser()
      render(<UserFilterCombobox value={null} onChange={vi.fn()} />)

      await user.click(screen.getByPlaceholderText('Search users by name, email, or ID…'))

      // Empty search term → the picker prompts to search and shows no options.
      expect(await screen.findByText('Type to search…')).toBeInTheDocument()
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
      // The Apollo hook must be skipped while the term is empty.
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ skip: true }),
      )
    })

    it('labels a user with no name using their email, never "null null"', async () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminUsers: {
            users: [
              {
                id: 'user-2',
                firstName: null,
                lastName: null,
                emails: [{ email: 'noname@example.com', primary: true }],
              },
            ],
            total: 1,
          },
        },
        loading: false,
      })
      render(<UserFilterCombobox value={null} onChange={vi.fn()} />)

      const input = screen.getByPlaceholderText('Search users by name, email, or ID…')
      await user.click(input)
      await user.type(input, 'noname')

      expect(await screen.findByText('noname@example.com')).toBeInTheDocument()
      expect(screen.queryByText(/null/)).not.toBeInTheDocument()
    })

    it('calls onChange with the selected user option', async () => {
      withUser()
      const onChange = vi.fn()
      render(<UserFilterCombobox value={null} onChange={onChange} />)

      const input = screen.getByPlaceholderText('Search users by name, email, or ID…')
      await user.click(input)
      await user.type(input, 'ada')
      await user.click(await screen.findByText('Ada Lovelace'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', label: 'Ada Lovelace' }),
      )
    })

    it('shows the selected label and clears the selection via the clear button', async () => {
      withUser()
      const onChange = vi.fn()
      render(
        <UserFilterCombobox value={{ id: 'user-1', label: 'Ada Lovelace' }} onChange={onChange} />,
      )

      expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument()
      await user.click(screen.getByLabelText('Clear user'))

      expect(onChange).toHaveBeenCalledWith(null)
    })
  })

  describe('OrganizationFilterCombobox', () => {
    it('renders matching organizations as options', async () => {
      mockUseQuery.mockReturnValue({
        data: {
          adminOrganizations: {
            organizations: [{ id: 'org-1', name: 'Acme Corp' }],
            total: 1,
          },
        },
        loading: false,
      })
      render(<OrganizationFilterCombobox value={null} onChange={vi.fn()} />)

      const input = screen.getByPlaceholderText('Search organizations by name or ID…')
      await user.click(input)
      await user.type(input, 'acme')

      expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
    })

    it('shows a loading state and an empty state', async () => {
      mockUseQuery.mockReturnValue({ data: undefined, loading: true })
      render(<OrganizationFilterCombobox value={null} onChange={vi.fn()} />)

      await user.click(screen.getByPlaceholderText('Search organizations by name or ID…'))
      expect(await screen.findByText('Searching…')).toBeInTheDocument()
    })
  })
})

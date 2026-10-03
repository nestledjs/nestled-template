import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestRouter } from '../../helpers/createTestRouter'
import MembersSettings from '../../../app/routes/settings/members'

const mockUseReadQuery = vi.fn()
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const mutationMocks = {
  invite: vi.fn(),
  resend: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  updateRole: vi.fn(),
}
const refetchMembers = vi.fn()
const refetchInvitations = vi.fn()
let mutationIndex = 0
let queryIndex = 0
let mockLastFormFields: any[] = []

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useLoaderData: () => ({
      myOrganizationsQueryRef: { query: 'orgs' },
      meQueryRef: { query: 'me' },
    }),
  }
})

vi.mock('@apollo/client/react', () => ({
  useReadQuery: (...args: unknown[]) => mockUseReadQuery(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

vi.mock('@nestled-template/web', () => ({
  RequirePermission: ({ children, fallback }: any) =>
    children === null || children === undefined ? fallback : <>{children}</>,
}))

vi.mock('@nestledjs/forms', () => ({
  Form: ({ fields, submit }: any) => {
    mockLastFormFields = fields
    return (
      <button
        type="button"
        onClick={() => submit({ email: 'new@example.com', roleId: 'role-member' })}
      >
        Submit Invite Form
      </button>
    )
  },
}))

vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  const doc = { kind: 'Document', definitions: [] }
  return {
    ...actual,
    Me: doc,
    MyOrganizationsWithMembers: doc,
    CreateOrganizationInvitation: doc,
    CancelOrganizationInvitation: doc,
    ResendOrganizationInvitation: doc,
    RemoveOrganizationMember: doc,
    UpdateOrganizationMemberRole: doc,
    UserOrganizationMembers: doc,
    OrganizationRoles: doc,
    OrganizationInvitations: doc,
  }
})

describe('MembersSettings', () => {
  const organization = {
    id: 'org-1',
    name: 'Acme',
    members: [{ id: 'member-current', userId: 'user-current', role: { name: 'Owner' } }],
  }
  const roles = [
    {
      id: 'role-owner',
      name: 'Owner',
      description: null,
      permissions: [{ id: 'perm-1', subject: 'member', action: 'read' }],
    },
    {
      id: 'role-admin',
      name: 'Admin',
      description: 'Admin access',
      permissions: [],
    },
    {
      id: 'role-member',
      name: 'Member',
      description: 'Standard access',
      permissions: [],
    },
  ]
  const members = [
    {
      id: 'member-current',
      userId: 'user-current',
      user: {
        id: 'user-current',
        firstName: 'Current',
        lastName: 'User',
        emails: [{ email: 'current@example.com', primary: true }],
      },
      role: { id: 'role-owner', name: 'Owner' },
    },
    {
      id: 'member-other',
      userId: 'user-other',
      user: {
        id: 'user-other',
        firstName: 'Other',
        lastName: 'Member',
        emails: [{ email: 'other@example.com', primary: true }],
      },
      role: { id: 'role-member', name: 'Member' },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mutationIndex = 0
    queryIndex = 0
    mockLastFormFields = []
    Object.values(mutationMocks).forEach(mock => mock.mockResolvedValue({ data: {} }))

    mockUseReadQuery.mockImplementation((queryRef: any) => {
      if (queryRef.query === 'orgs') return { data: { myOrganizations: [organization] } }
      return { data: { me: { id: 'user-current' } } }
    })

    mockUseMutation.mockImplementation(() => {
      const mutations = [
        mutationMocks.invite,
        mutationMocks.resend,
        mutationMocks.cancel,
        mutationMocks.remove,
        mutationMocks.updateRole,
      ]
      const mutation = mutations[mutationIndex % mutations.length]
      mutationIndex += 1
      return [mutation]
    })

    mockUseQuery.mockImplementation(() => {
      const currentQuery = queryIndex % 3
      queryIndex += 1

      if (currentQuery === 0) {
        return {
          data: { userOrganizationMembers: members },
          loading: false,
          error: null,
          refetch: refetchMembers,
        }
      }
      if (currentQuery === 1) {
        return { data: { organizationRoles: roles } }
      }
      return {
        data: {
          organizationInvitations: [
            {
              id: 'inv-1',
              email: 'pending@example.com',
              status: 'PENDING',
              expiresAt: '2026-06-01T00:00:00.000Z',
              inviter: { firstName: 'Current', lastName: 'User' },
              role: { name: 'Member' },
            },
            {
              id: 'inv-2',
              email: 'accepted@example.com',
              status: 'ACCEPTED',
              expiresAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        },
        loading: false,
        refetch: refetchInvitations,
      }
    })
  })

  function renderRoute() {
    const Router = createTestRouter([{ path: '/settings/members', Component: MembersSettings }])
    return render(<Router initialEntries={['/settings/members']} />)
  }

  it('renders members, invitations, and expandable role permissions', () => {
    renderRoute()

    expect(screen.getByText('Team Members')).toBeInTheDocument()
    expect(screen.getByText('Current User')).toBeInTheDocument()
    expect(screen.getByText('Other Member')).toBeInTheDocument()
    expect(screen.getByText('pending@example.com')).toBeInTheDocument()
    expect(screen.queryByText('accepted@example.com')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Owner/i }))
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('View organization members')).toBeInTheDocument()
  })

  it('submits invitations and refreshes member and invitation data', async () => {
    renderRoute()

    fireEvent.click(screen.getByRole('button', { name: /Invite Member/i }))
    fireEvent.click(screen.getByRole('button', { name: /Submit Invite Form/i }))

    await waitFor(() => {
      expect(mutationMocks.invite).toHaveBeenCalledWith({
        variables: {
          input: {
            organizationId: 'org-1',
            email: 'new@example.com',
            roleId: 'role-member',
          },
        },
      })
    })
    expect(refetchMembers).toHaveBeenCalled()
    expect(refetchInvitations).toHaveBeenCalled()
    expect(screen.getByText('Invitation sent successfully!')).toBeInTheDocument()
  })

  it('does not offer the Owner role to admins when inviting members', () => {
    mockUseReadQuery.mockImplementation((queryRef: any) => {
      if (queryRef.query === 'orgs') {
        return {
          data: {
            myOrganizations: [
              {
                ...organization,
                members: [
                  { id: 'member-current', userId: 'user-current', role: { name: 'Admin' } },
                ],
              },
            ],
          },
        }
      }
      return { data: { me: { id: 'user-current' } } }
    })

    renderRoute()

    fireEvent.click(screen.getByRole('button', { name: /Invite Member/i }))

    const roleField = mockLastFormFields.find(field => field.key === 'roleId')
    const roleLabels = roleField.options.options.map((option: { label: string }) => option.label)
    expect(roleLabels).toContain('Admin')
    expect(roleLabels).toContain('Member')
    expect(roleLabels).not.toContain('Owner')
  })

  it('resends invitations after confirmation', async () => {
    renderRoute()

    fireEvent.click(screen.getByTitle('Resend invitation'))
    expect(screen.getByText('Resend Invitation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))

    await waitFor(() => {
      expect(mutationMocks.resend).toHaveBeenCalledWith({
        variables: { input: { invitationId: 'inv-1' } },
      })
    })
    expect(screen.getByText('Invitation resent to pending@example.com')).toBeInTheDocument()
  })

  it('cancels invitations after confirmation', async () => {
    renderRoute()

    fireEvent.click(screen.getByTitle('Cancel invitation'))
    expect(screen.getByText('Cancel Invitation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))

    await waitFor(() => {
      expect(mutationMocks.cancel).toHaveBeenCalledWith({
        variables: { input: { invitationId: 'inv-1' } },
      })
    })
    expect(refetchInvitations).toHaveBeenCalled()
    expect(screen.getByText('Invitation cancelled for pending@example.com')).toBeInTheDocument()
  })

  it('removes members after confirmation', async () => {
    renderRoute()

    fireEvent.click(screen.getByTitle('Remove member'))
    expect(screen.getByText('Remove Member')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))

    await waitFor(() => {
      expect(mutationMocks.remove).toHaveBeenCalledWith({
        variables: { input: { organizationId: 'org-1', userId: 'user-other' } },
      })
    })
    expect(screen.getByText('Member removed successfully!')).toBeInTheDocument()
  })

  it('updates a member role from the edit dialog', async () => {
    renderRoute()

    fireEvent.click(screen.getByTitle('Edit role'))
    fireEvent.change(screen.getByLabelText('Select New Role'), {
      target: { value: 'role-owner' },
    })

    await waitFor(() => {
      expect(mutationMocks.updateRole).toHaveBeenCalledWith({
        variables: {
          input: {
            organizationId: 'org-1',
            userId: 'user-other',
            roleId: 'role-owner',
          },
        },
      })
    })
    expect(screen.getByText('Role updated successfully for Other Member')).toBeInTheDocument()
  })
})

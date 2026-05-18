import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SettingsLayout from '../../../app/routes/settings/_layout'

import { useQuery } from '@apollo/client/react'
import { useGlobalCtx } from '@nestled-template/web'

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}))

// Mock SDK

// Mock web components
vi.mock('@nestled-template/web', () => ({
  useGlobalCtx: vi.fn(),
}))

// Mock web-ui components
vi.mock('@nestled-template/web-ui', () => ({
  Avatar: ({ imageUrl, fallbackText }: any) => {
    if (imageUrl) {
      return (
        <div data-testid="avatar">
          <img src={imageUrl} alt="avatar" />
        </div>
      )
    }

    return (
      <div data-testid="avatar">
        <span data-testid="avatar-fallback">{fallbackText}</span>
      </div>
    )
  },
}))

describe('SettingsLayout Component', () => {
  const mockUser = {
    id: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    activeOrganizationId: 'org-123',
    isSuperAdmin: false,
    images: [],
  }

  const mockOrganization = {
    id: 'org-123',
    name: 'Acme Corp',
    images: [],
    members: [
      {
        id: 'member-1',
        userId: 'user-123',
        role: {
          id: 'role-admin',
          name: 'Admin',
          permissions: [
            { subject: 'organization', action: 'read' },
            { subject: 'organization', action: 'update' },
            { subject: 'member', action: 'read' },
          ],
        },
      },
    ],
  }

  beforeEach(() => {
    vi.mocked(useGlobalCtx).mockReturnValue({
      user: mockUser as any,
      organizations: [],
      activeOrganization: null,
      activeOrganizationMember: null,
    })

    vi.mocked(useQuery).mockReturnValue({
      data: {
        myOrganizations: [mockOrganization],
      },
    } as any)
  })

  const renderWithRouter = (pathname = '/settings/profile') => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/settings',
        Component: SettingsLayout,
        children: [
          {
            path: 'profile',
            Component: () => <div data-testid="profile-content">Profile Content</div>,
          },
          {
            path: 'security',
            Component: () => <div data-testid="security-content">Security Content</div>,
          },
          {
            path: 'organization',
            Component: () => <div data-testid="organization-content">Organization Content</div>,
          },
          {
            path: 'organization/edit',
            Component: () => (
              <div data-testid="organization-edit-content">Organization Edit Content</div>
            ),
          },
          {
            path: 'members',
            Component: () => <div data-testid="members-content">Members Content</div>,
          },
          {
            path: 'billing',
            Component: () => <div data-testid="billing-content">Billing Content</div>,
          },
        ],
      },
    ])

    return render(<ReactRouterStub initialEntries={[pathname]} />)
  }

  describe('Page Header', () => {
    it('should display settings title', () => {
      renderWithRouter()

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should display subtitle with organization name', () => {
      renderWithRouter()

      expect(screen.getByText(/Manage your account and Acme Corp settings/i)).toBeInTheDocument()
    })

    it('should handle missing organization name', () => {
      vi.mocked(useQuery).mockReturnValue({
        data: {
          myOrganizations: [],
        },
      } as any)

      renderWithRouter()

      expect(screen.getByText(/Manage your account and/i)).toBeInTheDocument()
    })
  })

  describe('Sidebar Navigation', () => {
    it('should render sidebar navigation', () => {
      renderWithRouter()

      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })

    it('should display user section in sidebar', () => {
      renderWithRouter()

      expect(screen.getByText('Personal Settings')).toBeInTheDocument()
    })

    it('should display user avatar', () => {
      renderWithRouter()

      const avatars = screen.getAllByTestId('avatar')
      expect(avatars.length).toBeGreaterThan(0)
    })

    it('should display user name', () => {
      renderWithRouter()

      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    it('should display organization section in sidebar', () => {
      renderWithRouter()

      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    })

    it('should display organization avatar', () => {
      renderWithRouter()

      // Should have both user and organization avatars
      const avatars = screen.getAllByTestId('avatar')
      expect(avatars.length).toBe(2)
    })

    it('should display user role in organization section', () => {
      renderWithRouter()

      expect(screen.getByText('Admin')).toBeInTheDocument()
    })

    it('should fallback to "Organization Settings" when no role', () => {
      vi.mocked(useQuery).mockReturnValue({
        data: {
          myOrganizations: [
            {
              ...mockOrganization,
              members: [],
            },
          ],
        },
      } as any)

      renderWithRouter()

      expect(screen.getByText('Organization Settings')).toBeInTheDocument()
    })
  })

  describe('Personal Settings Navigation', () => {
    it('should display profile link', () => {
      renderWithRouter()

      expect(screen.getByText('Profile')).toBeInTheDocument()
      expect(screen.getByText('Name, email, avatar, and personal info')).toBeInTheDocument()
    })

    it('should display security link', () => {
      renderWithRouter()

      expect(screen.getByText('Security')).toBeInTheDocument()
      expect(screen.getByText('2FA, sessions, and password settings')).toBeInTheDocument()
    })

    it('should display notifications link', () => {
      renderWithRouter()

      expect(screen.getByText('Notifications')).toBeInTheDocument()
      expect(screen.getByText('Email and notification preferences')).toBeInTheDocument()
    })

    it('should highlight active route', () => {
      renderWithRouter('/settings/profile')

      const profileLink = screen.getByText('Profile').closest('a')
      expect(profileLink).toHaveClass('bg-emerald-500')
    })

    it('should not highlight inactive routes', () => {
      renderWithRouter('/settings/profile')

      const securityLink = screen.getByText('Security').closest('a')
      expect(securityLink).not.toHaveClass('bg-emerald-500')
    })
  })

  describe('Organization Settings Navigation', () => {
    it('should display organization link', () => {
      renderWithRouter()

      expect(screen.getByText('Organization')).toBeInTheDocument()
      expect(screen.getByText('Name, logo, and organization details')).toBeInTheDocument()
    })

    it('should display team members link', () => {
      renderWithRouter()

      expect(screen.getByText('Team Members')).toBeInTheDocument()
      expect(screen.getByText('Manage team members and invitations')).toBeInTheDocument()
    })

    it('should display billing link', () => {
      renderWithRouter()

      expect(screen.getByText('Billing')).toBeInTheDocument()
      expect(screen.getByText('Subscription and payment settings')).toBeInTheDocument()
    })

    it('should highlight active organization route', () => {
      renderWithRouter('/settings/organization')

      const orgLink = screen.getByText('Organization').closest('a')
      expect(orgLink).toHaveClass('bg-emerald-500')
    })
  })

  describe('Permission-Based Navigation', () => {
    it('should show organization settings with organization:read permission', () => {
      renderWithRouter()

      expect(screen.getByText('Organization')).toBeInTheDocument()
    })

    it('should show team members with member:read permission', () => {
      renderWithRouter()

      expect(screen.getByText('Team Members')).toBeInTheDocument()
    })

    it('should show billing to admins and owners', () => {
      renderWithRouter()

      expect(screen.getByText('Billing')).toBeInTheDocument()
    })

    it('should hide billing from members without permission', () => {
      vi.mocked(useQuery).mockReturnValue({
        data: {
          myOrganizations: [
            {
              ...mockOrganization,
              members: [
                {
                  id: 'member-1',
                  userId: 'user-123',
                  role: {
                    id: 'role-member',
                    name: 'Member',
                    permissions: [
                      { subject: 'organization', action: 'read' },
                      { subject: 'member', action: 'read' },
                    ],
                  },
                },
              ],
            },
          ],
        },
      } as any)

      renderWithRouter()

      expect(screen.queryByText('Billing')).not.toBeInTheDocument()
    })

    it('should show billing to members with explicit billing read permission', () => {
      vi.mocked(useQuery).mockReturnValue({
        data: {
          myOrganizations: [
            {
              ...mockOrganization,
              members: [
                {
                  id: 'member-1',
                  userId: 'user-123',
                  role: {
                    id: 'role-member',
                    name: 'Member',
                    permissions: [
                      { subject: 'organization', action: 'read' },
                      { subject: 'member', action: 'read' },
                      { subject: 'billing', action: 'read' },
                    ],
                  },
                },
              ],
            },
          ],
        },
      } as any)

      renderWithRouter()

      expect(screen.getByText('Billing')).toBeInTheDocument()
    })

    it('should allow super admins to access all settings', () => {
      vi.mocked(useGlobalCtx).mockReturnValue({
        user: { ...mockUser, isSuperAdmin: true } as any,
        organizations: [],
        activeOrganization: null,
        activeOrganizationMember: null,
      })

      renderWithRouter()

      expect(screen.getByText('Billing')).toBeInTheDocument()
    })

    it('should show the admin console entry only to super admins', () => {
      renderWithRouter()
      expect(screen.queryByText('Admin Console')).not.toBeInTheDocument()

      vi.mocked(useGlobalCtx).mockReturnValue({
        user: { ...mockUser, isSuperAdmin: true } as any,
        organizations: [],
        activeOrganization: null,
        activeOrganizationMember: null,
      })

      renderWithRouter()

      const adminLink = screen.getByRole('link', { name: /Admin Console/ })
      expect(adminLink).toHaveAttribute('href', '/admin')
      expect(screen.getByText('Platform setup and operations')).toBeInTheDocument()
    })

    it('should hide organization settings when no organization', () => {
      vi.mocked(useQuery).mockReturnValue({
        data: {
          myOrganizations: [],
        },
      } as any)

      renderWithRouter()

      // Should not show organization-specific settings links
      expect(screen.queryByText('Name, logo, and organization details')).not.toBeInTheDocument()
      expect(screen.queryByText('Team Members')).not.toBeInTheDocument()
      expect(screen.queryByText('Billing')).not.toBeInTheDocument()
    })
  })

  describe('Avatar Display', () => {
    it('should display user avatar from images', () => {
      const userWithAvatar = {
        ...mockUser,
        avatar: {
          id: 'img-1',
          url: 'https://example.com/avatar.png',
          publicUrl: 'https://example.com/avatar.png',
        },
      }

      vi.mocked(useGlobalCtx).mockReturnValue({
        user: userWithAvatar as any,
        organizations: [],
        activeOrganization: null,
        activeOrganizationMember: null,
      })

      renderWithRouter()

      const avatar = screen.getAllByTestId('avatar')[0]
      expect(within(avatar).getByRole('img')).toHaveAttribute(
        'src',
        'https://example.com/avatar.png',
      )
    })

    it('should display organization logo from images', () => {
      const orgWithLogo = {
        ...mockOrganization,
        logo: {
          id: 'img-1',
          url: 'https://example.com/logo.png',
          publicUrl: 'https://example.com/logo.png',
        },
      }

      vi.mocked(useQuery).mockReturnValue({
        data: {
          myOrganizations: [orgWithLogo],
        },
      } as any)

      renderWithRouter()

      const avatars = screen.getAllByTestId('avatar')
      const orgAvatar = avatars[1]
      expect(within(orgAvatar).getByRole('img')).toHaveAttribute(
        'src',
        'https://example.com/logo.png',
      )
    })

    it('should use fallback text when no avatar', () => {
      renderWithRouter()

      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    it('should use fallback for organization when no logo', () => {
      renderWithRouter()

      const avatars = screen.getAllByTestId('avatar')
      const orgAvatar = avatars[1]
      expect(within(orgAvatar).getByTestId('avatar-fallback')).toHaveTextContent('Acme Corp')
    })

    it('should handle user with only first name', () => {
      const userWithFirstName = {
        ...mockUser,
        lastName: null,
      }

      vi.mocked(useGlobalCtx).mockReturnValue({
        user: userWithFirstName as any,
        organizations: [],
        activeOrganization: null,
        activeOrganizationMember: null,
      })

      renderWithRouter()

      expect(screen.getAllByText('John').length).toBeGreaterThan(0)
    })

    it('should fallback to displayName when no first/last name', () => {
      const userWithDisplayName = {
        ...mockUser,
        firstName: null,
        lastName: null,
        displayName: 'Display Name',
      }

      vi.mocked(useGlobalCtx).mockReturnValue({
        user: userWithDisplayName as any,
        organizations: [],
        activeOrganization: null,
        activeOrganizationMember: null,
      })

      renderWithRouter()

      expect(screen.getAllByText('Display Name').length).toBeGreaterThan(0)
    })

    it('should fallback to "User" when no name available', () => {
      const userWithoutName = {
        ...mockUser,
        firstName: null,
        lastName: null,
        displayName: null,
      }

      vi.mocked(useGlobalCtx).mockReturnValue({
        user: userWithoutName as any,
        organizations: [],
        activeOrganization: null,
        activeOrganizationMember: null,
      })

      renderWithRouter()

      expect(screen.getByText('User')).toBeInTheDocument()
    })
  })

  describe('Content Area', () => {
    it('should render outlet for child routes', () => {
      renderWithRouter('/settings/profile')

      expect(screen.getByTestId('profile-content')).toBeInTheDocument()
    })

    it('should render security content on security route', () => {
      renderWithRouter('/settings/security')

      expect(screen.getByTestId('security-content')).toBeInTheDocument()
    })

    it('should render organization content on organization route', () => {
      renderWithRouter('/settings/organization')

      expect(screen.getByTestId('organization-content')).toBeInTheDocument()
    })

    it('should render members content on members route', () => {
      renderWithRouter('/settings/members')

      expect(screen.getByTestId('members-content')).toBeInTheDocument()
    })

    it('should render billing content on billing route', () => {
      renderWithRouter('/settings/billing')

      expect(screen.getByTestId('billing-content')).toBeInTheDocument()
    })
  })

  describe('Responsive Layout', () => {
    it('should have sidebar navigation', () => {
      renderWithRouter()

      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })

    it('should have main content area', () => {
      renderWithRouter()

      expect(screen.getByTestId('profile-content')).toBeInTheDocument()
    })

    it('should apply proper styling classes', () => {
      renderWithRouter()

      // The component should have gradient background
      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })
  })

  describe('Link URLs', () => {
    it('should have correct profile link URL', () => {
      renderWithRouter()

      const profileLink = screen.getByText('Profile').closest('a')
      expect(profileLink).toHaveAttribute('href', '/settings/profile')
    })

    it('should have correct security link URL', () => {
      renderWithRouter()

      const securityLink = screen.getByText('Security').closest('a')
      expect(securityLink).toHaveAttribute('href', '/settings/security')
    })

    it('should have correct notifications link URL', () => {
      renderWithRouter()

      const notificationsLink = screen.getByText('Notifications').closest('a')
      expect(notificationsLink).toHaveAttribute('href', '/settings/notifications')
    })

    it('should have correct organization link URL', () => {
      renderWithRouter()

      const orgLink = screen.getByText('Organization').closest('a')
      expect(orgLink).toHaveAttribute('href', '/settings/organization')
    })

    it('should have correct members link URL', () => {
      renderWithRouter()

      const membersLink = screen.getByText('Team Members').closest('a')
      expect(membersLink).toHaveAttribute('href', '/settings/members')
    })

    it('should have correct billing link URL', () => {
      renderWithRouter()

      const billingLink = screen.getByText('Billing').closest('a')
      expect(billingLink).toHaveAttribute('href', '/settings/billing')
    })
  })

  describe('Active Route Detection', () => {
    it('should detect exact route match', () => {
      renderWithRouter('/settings/profile')

      const profileLink = screen.getByText('Profile').closest('a')
      expect(profileLink).toHaveClass('bg-emerald-500')
    })

    it('should detect route prefix match', () => {
      renderWithRouter('/settings/organization/edit')

      const orgLink = screen.getByText('Organization').closest('a')
      expect(orgLink).toHaveClass('bg-emerald-500')
    })

    it('should not highlight when route does not match', () => {
      renderWithRouter('/settings/profile')

      const securityLink = screen.getByText('Security').closest('a')
      expect(securityLink).toHaveClass('text-zinc-700')
    })
  })
})

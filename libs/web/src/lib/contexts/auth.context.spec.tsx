import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthProvider,
  useAuth,
  useHasAllPermissions,
  useHasAnyPermission,
  useHasPermission,
} from './auth.context'

const useQuery = vi.fn()
const useMutation = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: (...args: unknown[]) => useMutation(...args),
}))

vi.mock('@nestled-template/shared/sdk', () => ({
  MyOrganizationsWithMembers: {},
  SwitchActiveOrganization: {},
}))

const member = {
  userId: 'user-1',
  role: {
    permissions: [
      { subject: 'organization', action: 'read' },
      { subject: 'member', action: 'invite' },
    ],
  },
}

const organization = {
  id: 'org-1',
  name: 'Example Org',
  members: [member],
}

function wrapper(initialUser: any = { id: 'user-1', activeOrganizationId: 'org-1' }) {
  return ({ children }: { children: React.ReactNode }) => (
    <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useQuery.mockReturnValue({
      data: { myOrganizations: [organization] },
      loading: false,
      refetch: vi.fn().mockResolvedValue({ data: {} }),
    })
    useMutation.mockReturnValue([
      vi.fn().mockResolvedValue({
        data: { switchActiveOrganization: { activeOrganizationId: 'org-2' } },
      }),
    ])
  })

  it('provides authentication, organization, and permission state', () => {
    const { result } = renderHook(
      () => ({
        auth: useAuth(),
        canReadOrg: useHasPermission('organization:read'),
        canInviteOrDelete: useHasAnyPermission(['member:invite', 'organization:delete']),
        canReadAndInvite: useHasAllPermissions(['organization:read', 'member:invite']),
      }),
      { wrapper: wrapper() },
    )

    expect(result.current.auth.isAuthenticated).toBe(true)
    expect(result.current.auth.activeOrganization?.id).toBe('org-1')
    expect(result.current.auth.activeOrganizationMember).toEqual(member)
    expect(result.current.canReadOrg).toBe(true)
    expect(result.current.canInviteOrDelete).toBe(true)
    expect(result.current.canReadAndInvite).toBe(true)
    expect(localStorage.getItem('activeOrganizationId')).toBe('org-1')
  })

  it('logs in, switches organization, refreshes organizations, and logs out', async () => {
    const switchOrg = vi.fn().mockResolvedValue({
      data: { switchActiveOrganization: { activeOrganizationId: 'org-2' } },
    })
    const refetch = vi.fn().mockResolvedValue({ data: {} })
    useQuery.mockReturnValue({
      data: { myOrganizations: [organization] },
      loading: false,
      refetch,
    })
    useMutation.mockReturnValue([switchOrg])

    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(null) })

    act(() => result.current.login({ id: 'user-1', activeOrganizationId: 'org-1' } as any))
    await act(async () => result.current.switchOrganization('org-2'))
    await act(async () => result.current.refreshOrganizations())

    expect(switchOrg).toHaveBeenCalledWith({ variables: { input: { organizationId: 'org-2' } } })
    expect(refetch).toHaveBeenCalled()
    expect(result.current.user?.activeOrganizationId).toBe('org-2')

    act(() => result.current.logout())
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(localStorage.getItem('activeOrganizationId')).toBeNull()
  })

  it('handles emulation flags and super-admin permissions', async () => {
    const adminMember = {
      userId: 'user-1',
      role: { permissions: [{ subject: 'all', action: 'manage' }] },
    }
    useQuery.mockReturnValue({
      data: { myOrganizations: [{ ...organization, members: [adminMember] }] },
      loading: false,
      refetch: vi.fn(),
    })

    const { result } = renderHook(
      () => ({
        auth: useAuth(),
        canDelete: useHasPermission('organization:delete'),
        canDoAny: useHasAnyPermission(['billing:manage']),
        canDoAll: useHasAllPermissions(['billing:manage', 'member:remove']),
      }),
      {
        wrapper: wrapper({
          id: 'user-1',
          activeOrganizationId: 'org-1',
          isEmulating: true,
          originalUserId: 'admin-1',
          originalUser: { id: 'admin-1' },
        }),
      },
    )

    await waitFor(() => expect(result.current.auth.isEmulating).toBe(true))
    expect(result.current.auth.originalUser).toEqual({ id: 'admin-1' })
    expect(result.current.canDelete).toBe(true)
    expect(result.current.canDoAny).toBe(true)
    expect(result.current.canDoAll).toBe(true)
  })

  it('throws when auth hooks are used outside the provider', () => {
    const { result } = renderHook(() => {
      try {
        return useAuth()
      } catch (error) {
        return error
      }
    })

    expect(result.current).toBeInstanceOf(Error)
  })
})

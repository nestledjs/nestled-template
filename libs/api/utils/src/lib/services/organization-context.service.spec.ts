import { OrganizationContextService } from './organization-context.service'

describe('OrganizationContextService', () => {
  const membership = {
    userId: 'user-1',
    organizationId: 'org-1',
    roleId: 'role-1',
    role: {
      name: 'Owner',
      permissions: [{ subject: 'organization', action: 'update' }],
    },
  }

  function createService() {
    const data = {
      organizationMember: {
        findFirst: jest.fn().mockResolvedValue(membership),
      },
    }
    const authCache = {
      isEnabled: jest.fn().mockReturnValue(false),
      getMembership: jest.fn(),
      setMembership: jest.fn(),
      getUserActiveOrganization: jest.fn(),
    }

    return {
      authCache,
      data,
      service: new OrganizationContextService(data as never, authCache as never),
    }
  }

  it('loads organization context from the x-organization-id header after auth attaches user', async () => {
    const { data, service } = createService()
    const req = {
      headers: { 'x-organization-id': 'org-1' },
      user: { id: 'user-1', isSuperAdmin: false },
    }

    const context = await service.attach(req as never)

    expect(data.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', organizationId: 'org-1' },
      }),
    )
    expect(context).toEqual({
      organizationId: 'org-1',
      userId: 'user-1',
      roleId: 'role-1',
      roleName: 'Owner',
      permissions: [{ subject: 'organization', action: 'update' }],
    })
    expect(req).toHaveProperty('organizationContext', context)
  })

  it('falls back to the authenticated users active organization', async () => {
    const { data, service } = createService()
    const req = {
      headers: {},
      user: { id: 'user-1', activeOrganizationId: 'org-1', isSuperAdmin: false },
    }

    await service.attach(req as never)

    expect(data.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', organizationId: 'org-1' },
      }),
    )
  })

  it('adds all:manage for super admins without mutating cached permissions', async () => {
    const { authCache, service } = createService()
    const cachedContext = {
      organizationId: 'org-1',
      userId: 'user-1',
      roleId: 'role-1',
      roleName: 'Owner',
      permissions: [{ subject: 'organization', action: 'update' }],
    }
    authCache.isEnabled.mockReturnValue(true)
    authCache.getMembership.mockResolvedValue(cachedContext)

    const context = await service.attach({
      headers: { 'x-organization-id': 'org-1' },
      user: { id: 'user-1', isSuperAdmin: true },
    } as never)

    expect(context?.permissions).toContainEqual({ subject: 'all', action: 'manage' })
    expect(cachedContext.permissions).not.toContainEqual({ subject: 'all', action: 'manage' })
  })
})

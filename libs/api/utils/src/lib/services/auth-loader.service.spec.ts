import { AuthCacheService } from './auth-cache.service'
import { AuthLoaderService, createAuthLoaderService } from './auth-loader.service'
import { OrganizationContext } from '../types/nest-context-type'

function createAuthCacheMock(): jest.Mocked<
  Pick<
    AuthCacheService,
    'getUserActiveOrganization' | 'getMembership' | 'setMembership' | 'invalidateMembership'
  >
> {
  return {
    getUserActiveOrganization: jest.fn().mockResolvedValue(null),
    getMembership: jest.fn().mockResolvedValue(null),
    setMembership: jest.fn().mockResolvedValue(undefined),
    invalidateMembership: jest.fn().mockResolvedValue(undefined),
  }
}

const context: OrganizationContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  roleId: 'role-1',
  roleName: 'Admin',
  permissions: [
    { subject: 'User', action: 'read' },
    { subject: 'Organization', action: 'update' },
  ],
}

describe('AuthLoaderService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('returns null when neither an organization id nor an active organization is available', async () => {
    const authCache = createAuthCacheMock()
    const queryMemberships = jest.fn()
    const service = new AuthLoaderService(
      authCache as unknown as AuthCacheService,
      queryMemberships,
    )

    await expect(service.loadMembership('user-1')).resolves.toBeNull()

    expect(authCache.getUserActiveOrganization).toHaveBeenCalledWith('user-1')
    expect(queryMemberships).not.toHaveBeenCalled()
  })

  it('uses active organization and returns cached membership before batching', async () => {
    const authCache = createAuthCacheMock()
    authCache.getUserActiveOrganization.mockResolvedValue('org-1')
    authCache.getMembership.mockResolvedValue(context)
    const queryMemberships = jest.fn()
    const service = new AuthLoaderService(
      authCache as unknown as AuthCacheService,
      queryMemberships,
    )

    await expect(service.loadMembership('user-1')).resolves.toEqual(context)

    expect(authCache.getMembership).toHaveBeenCalledWith('user-1', 'org-1')
    expect(queryMemberships).not.toHaveBeenCalled()
  })

  it('batches membership lookups and maps results back to request order', async () => {
    const authCache = createAuthCacheMock()
    const queryMemberships = jest.fn().mockResolvedValue([
      {
        userId: 'user-2',
        organizationId: 'org-1',
        roleId: 'role-2',
        role: {
          name: 'Member',
          permissions: [{ subject: 'Project', action: 'read' }],
        },
      },
      {
        userId: 'user-1',
        organizationId: 'org-1',
        roleId: 'role-1',
        role: {
          name: 'Owner',
          permissions: [{ subject: 'Organization', action: 'manage' }],
        },
      },
    ])
    const service = new AuthLoaderService(
      authCache as unknown as AuthCacheService,
      queryMemberships,
    )

    const [first, second, missing] = await Promise.all([
      service.loadMembership('user-1', 'org-1'),
      service.loadMembership('user-2', 'org-1'),
      service.loadMembership('user-3', 'org-1'),
    ])

    expect(queryMemberships).toHaveBeenCalledTimes(1)
    expect(queryMemberships.mock.calls[0][0]).toEqual([
      { userId: 'user-1', organizationId: 'org-1' },
      { userId: 'user-2', organizationId: 'org-1' },
      { userId: 'user-3', organizationId: 'org-1' },
    ])
    expect(first).toMatchObject({ userId: 'user-1', roleName: 'Owner' })
    expect(second).toMatchObject({ userId: 'user-2', roleName: 'Member' })
    expect(missing).toBeNull()
    expect(authCache.setMembership).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({ roleName: 'Owner' }),
    )
  })

  it('returns nulls when no batch query function is configured or the query fails', async () => {
    const authCache = createAuthCacheMock()
    const serviceWithoutQuery = new AuthLoaderService(authCache as unknown as AuthCacheService)
    await expect(serviceWithoutQuery.loadMembership('user-1', 'org-1')).resolves.toBeNull()

    const failingService = new AuthLoaderService(
      authCache as unknown as AuthCacheService,
      jest.fn().mockRejectedValue(new Error('database unavailable')),
    )
    await expect(failingService.loadMembership('user-1', 'org-1')).resolves.toBeNull()
  })

  it('primes and clears both the request loader and Redis cache', async () => {
    const authCache = createAuthCacheMock()
    const queryMemberships = jest.fn()
    const service = new AuthLoaderService(
      authCache as unknown as AuthCacheService,
      queryMemberships,
    )

    service.primeMembership('user-1', 'org-1', context)
    await expect(service.loadMembership('user-1', 'org-1')).resolves.toEqual(context)

    service.clearMembership('user-1', 'org-1')
    service.clearAll()

    expect(authCache.setMembership).toHaveBeenCalledWith('user-1', 'org-1', context)
    expect(authCache.invalidateMembership).toHaveBeenCalledWith('user-1', 'org-1')
    expect(queryMemberships).not.toHaveBeenCalled()
  })

  it('creates a loader through the factory helper', async () => {
    const authCache = createAuthCacheMock()
    const queryMemberships = jest.fn().mockResolvedValue([])

    const service = createAuthLoaderService(
      authCache as unknown as AuthCacheService,
      queryMemberships,
    )

    await expect(service.loadMembership('user-1', 'org-1')).resolves.toBeNull()
    expect(queryMemberships).toHaveBeenCalled()
  })
})

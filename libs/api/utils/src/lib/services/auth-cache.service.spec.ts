import { AuthCacheService } from './auth-cache.service'
import { OrganizationContext } from '../types/nest-context-type'

type RedisMock = {
  setex: jest.Mock
  get: jest.Mock
  del: jest.Mock
  keys: jest.Mock
}

function createRedisMock(): RedisMock {
  return {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
  }
}

const membership: OrganizationContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  roleId: 'role-1',
  roleName: 'Owner',
  permissions: [{ subject: 'Organization', action: 'manage' }],
}

describe('AuthCacheService', () => {
  const originalRedisUrl = process.env['REDIS_URL']
  const originalRedisPrivateUrl = process.env['REDIS_PRIVATE_URL']

  afterEach(() => {
    jest.clearAllMocks()
    process.env['REDIS_URL'] = originalRedisUrl
    process.env['REDIS_PRIVATE_URL'] = originalRedisPrivateUrl
  })

  it('stays disabled when no Redis client or remote URL is available', async () => {
    delete process.env['REDIS_URL']
    delete process.env['REDIS_PRIVATE_URL']

    const service = new AuthCacheService()

    expect(service.isEnabled()).toBe(false)
    await expect(service.getSessionValid('session-1')).resolves.toBeNull()
    await expect(service.setSessionValid('session-1', true)).resolves.toBeUndefined()
  })

  it('stores, reads, and invalidates session validity', async () => {
    const redis = createRedisMock()
    const service = new AuthCacheService(redis as never)

    await service.setSessionValid('session-1', true)
    expect(redis.setex).toHaveBeenCalledWith('auth:session:session-1', 900, '1')

    redis.get.mockResolvedValueOnce('1').mockResolvedValueOnce('0').mockResolvedValueOnce(null)
    await expect(service.getSessionValid('session-1')).resolves.toBe(true)
    await expect(service.getSessionValid('session-1')).resolves.toBe(false)
    await expect(service.getSessionValid('session-1')).resolves.toBeNull()

    await service.invalidateSession('session-1')
    expect(redis.del).toHaveBeenCalledWith('auth:session:session-1')
  })

  it('stores and reads membership context as JSON', async () => {
    const redis = createRedisMock()
    const service = new AuthCacheService(redis as never)

    await service.setMembership('user-1', 'org-1', membership)
    expect(redis.setex).toHaveBeenCalledWith(
      'auth:membership:user-1:org-1',
      600,
      JSON.stringify(membership),
    )

    redis.get.mockResolvedValueOnce(JSON.stringify(membership))
    await expect(service.getMembership('user-1', 'org-1')).resolves.toEqual(membership)
  })

  it('invalidates user and organization membership groups only when matching keys exist', async () => {
    const redis = createRedisMock()
    const service = new AuthCacheService(redis as never)

    redis.keys
      .mockResolvedValueOnce(['auth:membership:user-1:org-1', 'auth:membership:user-1:org-2'])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['auth:membership:user-1:org-1'])

    await service.invalidateUserMemberships('user-1')
    await service.invalidateUserMemberships('user-2')
    await service.invalidateOrganizationMemberships('org-1')

    expect(redis.keys).toHaveBeenNthCalledWith(1, 'auth:membership:user-1:*')
    expect(redis.del).toHaveBeenNthCalledWith(
      1,
      'auth:membership:user-1:org-1',
      'auth:membership:user-1:org-2',
    )
    expect(redis.keys).toHaveBeenNthCalledWith(3, 'auth:membership:*:org-1')
    expect(redis.del).toHaveBeenNthCalledWith(2, 'auth:membership:user-1:org-1')
  })

  it('stores active organization and user payloads', async () => {
    const redis = createRedisMock()
    const service = new AuthCacheService(redis as never)

    await service.setUserActiveOrganization('user-1', 'org-1')
    redis.get.mockResolvedValueOnce('org-1')
    await expect(service.getUserActiveOrganization('user-1')).resolves.toBe('org-1')
    await service.invalidateUserActiveOrganization('user-1')

    const userPayload = { id: 'user-1', email: 'user@example.com' }
    await service.setUser('user-1', userPayload)
    redis.get.mockResolvedValueOnce(JSON.stringify(userPayload))
    await expect(service.getUser('user-1')).resolves.toEqual(userPayload)
    await service.invalidateUser('user-1')

    expect(redis.setex).toHaveBeenCalledWith('auth:user-active-org:user-1', 900, 'org-1')
    expect(redis.del).toHaveBeenCalledWith('auth:user-active-org:user-1')
    expect(redis.setex).toHaveBeenCalledWith('auth:user:user-1', 600, JSON.stringify(userPayload))
    expect(redis.del).toHaveBeenCalledWith('auth:user:user-1')
  })

  it('returns cache misses instead of throwing when Redis operations fail', async () => {
    const redis = createRedisMock()
    redis.setex.mockRejectedValue(new Error('write failed'))
    redis.get.mockRejectedValue(new Error('read failed'))
    redis.del.mockRejectedValue(new Error('delete failed'))
    redis.keys.mockRejectedValue(new Error('scan failed'))
    const service = new AuthCacheService(redis as never)

    await expect(service.setSessionValid('session-1', true)).resolves.toBeUndefined()
    await expect(service.getSessionValid('session-1')).resolves.toBeNull()
    await expect(service.invalidateSession('session-1')).resolves.toBeUndefined()
    await expect(service.invalidateUserMemberships('user-1')).resolves.toBeUndefined()
  })

  it('invalidates organization memberships when a role changes', async () => {
    const redis = createRedisMock()
    redis.keys.mockResolvedValue(['auth:membership:user-1:org-1'])
    const service = new AuthCacheService(redis as never)

    await service.invalidateRole('org-1')

    expect(redis.keys).toHaveBeenCalledWith('auth:membership:*:org-1')
    expect(redis.del).toHaveBeenCalledWith('auth:membership:user-1:org-1')
  })
})

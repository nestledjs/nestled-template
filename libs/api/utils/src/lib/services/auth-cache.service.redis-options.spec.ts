import { Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { AUTH_CACHE_REDIS_TIMEOUTS, AuthCacheService } from './auth-cache.service'

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }))

const RedisMock = Redis as unknown as jest.Mock

// Built at runtime so secret scanners do not read a fixture as a credential.
const fixturePassword = ['fixture', 'pw', String(process.pid)].join('-')
const remoteUrl = `redis://default:${fixturePassword}@cache.internal.example:6379`

function mockClient(connect: () => Promise<void>) {
  const client = { on: jest.fn(), connect: jest.fn(connect) }
  RedisMock.mockImplementationOnce(() => client)
  return client
}

const flush = () => new Promise(resolve => setImmediate(resolve))

describe('AuthCacheService Redis client options', () => {
  const originalRedisUrl = process.env['REDIS_URL']
  let log: jest.SpyInstance
  let warn: jest.SpyInstance

  beforeEach(() => {
    process.env['REDIS_URL'] = remoteUrl
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    RedisMock.mockReset()
    if (originalRedisUrl === undefined) delete process.env['REDIS_URL']
    else process.env['REDIS_URL'] = originalRedisUrl
  })

  it('fails fast: one retry, a 2s connect timeout and a 3s command timeout', () => {
    mockClient(() => Promise.resolve())

    const service = new AuthCacheService()

    expect(service.isEnabled()).toBe(true)
    expect(AUTH_CACHE_REDIS_TIMEOUTS).toEqual({
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 3000,
    })
    expect(RedisMock).toHaveBeenCalledWith(
      remoteUrl,
      expect.objectContaining({
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        commandTimeout: 3000,
        lazyConnect: true,
      }),
    )
  })

  it('logs once that the cache connected', async () => {
    const client = mockClient(() => Promise.resolve())

    new AuthCacheService()
    await flush()

    expect(client.connect).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('Auth cache Redis connected')
  })

  it('logs the connection failure reason without the URL or password', async () => {
    const client = mockClient(() => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:6379')))

    const service = new AuthCacheService()
    await flush()

    expect(client.connect).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      'Auth cache Redis connection failed: connect ECONNREFUSED 10.0.0.5:6379',
    )
    const printed = [...log.mock.calls, ...warn.mock.calls].flat().join('\n')
    expect(printed).not.toContain(fixturePassword)
    expect(printed).not.toContain(remoteUrl)
    // A failed connect only means cache misses; the service keeps its client and falls through.
    expect(service.isEnabled()).toBe(true)
  })

  it('logs a non-Error connection rejection as an unknown error', async () => {
    mockClient(() => Promise.reject({ host: 'redis.internal' }))

    new AuthCacheService()
    await flush()

    expect(warn).toHaveBeenCalledWith('Auth cache Redis connection failed: unknown error')
  })

  it('creates no client for a local or missing URL', () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379'

    const service = new AuthCacheService()

    expect(RedisMock).not.toHaveBeenCalled()
    expect(service.isEnabled()).toBe(false)
  })
})

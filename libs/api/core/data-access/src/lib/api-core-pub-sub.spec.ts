import { Logger } from '@nestjs/common'

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }))

const remoteUrl = 'redis://cache.internal.example:6379'

type PubSubModule = typeof import('./api-core-pub-sub')

function loadWithRedisUrl(url: string | undefined): {
  module: PubSubModule
  RedisMock: jest.Mock
} {
  const saved = {
    REDIS_URL: process.env['REDIS_URL'],
    REDIS_PRIVATE_URL: process.env['REDIS_PRIVATE_URL'],
    REDIS_TLS_URL: process.env['REDIS_TLS_URL'],
  }
  delete process.env['REDIS_PRIVATE_URL']
  delete process.env['REDIS_TLS_URL']
  if (url === undefined) delete process.env['REDIS_URL']
  else process.env['REDIS_URL'] = url
  let loaded: { module: PubSubModule; RedisMock: jest.Mock } | undefined
  try {
    jest.isolateModules(() => {
      const RedisMock = jest.requireMock('ioredis').default as jest.Mock
      RedisMock.mockImplementation(() => ({ on: jest.fn() }))
      loaded = { module: require('./api-core-pub-sub') as PubSubModule, RedisMock }
    })
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  if (!loaded) throw new Error('module did not load')
  return loaded
}

describe('apiCorePubSub Redis client options', () => {
  beforeEach(() => {
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('gives the publisher one retry, a 2s connect timeout and a 3s command timeout', () => {
    const { module } = loadWithRedisUrl(undefined)

    expect(module.redisPubSubClientOptions('publisher')).toEqual(
      expect.objectContaining({
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        commandTimeout: 3000,
        lazyConnect: true,
      }),
    )
  })

  it('gives the subscriber a connect timeout but no command timeout', () => {
    const { module } = loadWithRedisUrl(undefined)
    const options = module.redisPubSubClientOptions('subscriber')

    expect(options).toEqual(
      expect.objectContaining({ maxRetriesPerRequest: 3, connectTimeout: 2000, lazyConnect: true }),
    )
    expect(options).not.toHaveProperty('commandTimeout')
  })

  it('creates the publisher and subscriber with their own options', () => {
    const { module, RedisMock } = loadWithRedisUrl(remoteUrl)

    expect(RedisMock).toHaveBeenCalledTimes(2)
    const [publisherCall, subscriberCall] = RedisMock.mock.calls
    expect(publisherCall[0]).toBe(remoteUrl)
    expect(publisherCall[1]).toEqual(expect.objectContaining({ commandTimeout: 3000 }))
    expect(subscriberCall[1]).not.toHaveProperty('commandTimeout')
    expect(module.apiCorePubSub.constructor.name).toBe('RedisPubSub')
  })

  it('falls back to in-memory PubSub without a remote URL', () => {
    const { module, RedisMock } = loadWithRedisUrl(undefined)

    expect(RedisMock).not.toHaveBeenCalled()
    expect(module.apiCorePubSub.constructor.name).toBe('PubSub')
  })
})

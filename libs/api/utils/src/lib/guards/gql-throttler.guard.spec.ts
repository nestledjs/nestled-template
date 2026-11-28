import { GqlThrottlerGuard, GqlUserThrottlerGuard } from './gql-throttler.guard'
import { GqlExecutionContext } from '@nestjs/graphql'
import { ExecutionContext, Logger } from '@nestjs/common'
import type { ThrottlerLimitDetail } from '@nestjs/throttler'

jest.mock('@nestjs/graphql', () => ({
  GqlExecutionContext: { create: jest.fn() },
}))

const gqlCreate = GqlExecutionContext.create as jest.MockedFunction<
  typeof GqlExecutionContext.create
>

/** Reaches the protected members under test without standing up the whole throttler storage. */
class TestableGuard extends GqlThrottlerGuard {
  publicGetTracker(req: Record<string, any>) {
    return this.getTracker(req)
  }
}

describe('GqlThrottlerGuard', () => {
  const guard = Object.create(TestableGuard.prototype) as TestableGuard

  describe('getRequestResponse', () => {
    it('reads req/res off the GraphQL context, where Apollo puts them', () => {
      const req = { ip: '203.0.113.5' }
      const res = { locals: {} }
      gqlCreate.mockReturnValue({ getContext: () => ({ req, res }) } as any)

      expect(guard.getRequestResponse({} as ExecutionContext)).toEqual({ req, res })
    })
  })

  describe('getTracker', () => {
    it('tracks by req.ip', async () => {
      await expect(guard.publicGetTracker({ ip: '203.0.113.5' })).resolves.toBe('203.0.113.5')
    })

    it('ignores X-Forwarded-For in favour of req.ip', async () => {
      // The whole point of the guard. X-Forwarded-For is attacker-controlled, so keying off it
      // would hand out a fresh bucket per forged header. req.ip is what Express derives using the
      // trusted `trust proxy` hop count.
      const req = {
        ip: '203.0.113.5',
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      }

      await expect(guard.publicGetTracker(req)).resolves.toBe('203.0.113.5')
    })

    it('falls back to the socket address when req.ip is absent', async () => {
      const req = { socket: { remoteAddress: '198.51.100.9' } }
      await expect(guard.publicGetTracker(req)).resolves.toBe('198.51.100.9')
    })

    it('returns a stable key when no address can be determined', async () => {
      // Must never return undefined: the throttler would then bucket every anonymous caller
      // together under one key by accident rather than by design.
      await expect(guard.publicGetTracker({})).resolves.toBe('unknown')
    })
  })
})

/** Same approach as above: reach the protected tracker without the throttler storage. */
class TestableUserGuard extends GqlUserThrottlerGuard {
  publicGetTracker(req: Record<string, unknown>) {
    return this.getTracker(req)
  }

  publicThrowThrottlingException() {
    return this.throwThrottlingException({} as ExecutionContext, {} as ThrottlerLimitDetail)
  }
}

describe('GqlUserThrottlerGuard', () => {
  let guard: TestableUserGuard
  let warnings: string[]

  beforeEach(() => {
    guard = Object.create(TestableUserGuard.prototype) as TestableUserGuard
    // `userKeyLogger` is a field initialiser, which Object.create skips.
    Object.defineProperty(guard, 'userKeyLogger', { value: new Logger('test'), configurable: true })

    warnings = []
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(message => {
      warnings.push(typeof message === 'string' ? message : JSON.stringify(message))
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('keys by the authenticated user, not the client address', async () => {
    // Behind GqlAuthGuard the account is the subject: an IP key is too loose (a user rotating
    // addresses gets a fresh bucket) and too tight (everyone behind one NAT shares one bucket).
    const req = { ip: '203.0.113.5', user: { id: 'user-1' } }

    await expect(guard.publicGetTracker(req)).resolves.toBe('user:user-1')
  })

  it('namespaces the user key so it cannot collide with an address key', async () => {
    const byUser = await guard.publicGetTracker({ user: { id: '203.0.113.5' } })
    const byIp = await guard.publicGetTracker({ ip: '203.0.113.5' })

    expect(byUser).not.toBe(byIp)
  })

  it('gives two accounts separate buckets behind one shared address', async () => {
    const first = await guard.publicGetTracker({ ip: '203.0.113.5', user: { id: 'user-1' } })
    const second = await guard.publicGetTracker({ ip: '203.0.113.5', user: { id: 'user-2' } })

    expect(first).not.toBe(second)
  })

  it('still throttles by address when no user is present, and warns', async () => {
    // Reached only when the guard is declared before GqlAuthGuard, or on an unguarded resolver.
    // The limit still applies, but the weaker key is a misconfiguration, so it must not be silent.
    await expect(guard.publicGetTracker({ ip: '203.0.113.5' })).resolves.toBe('ip:203.0.113.5')
    expect(warnings.join(' ')).toContain('no authenticated user')
    expect(warnings.join(' ')).toContain('Declare it after GqlAuthGuard')
  })

  it('never returns an empty key, with neither a user nor an address', async () => {
    await expect(guard.publicGetTracker({})).resolves.toBe('ip:unknown')
  })

  it('does not warn on the authenticated path', async () => {
    await guard.publicGetTracker({ ip: '203.0.113.5', user: { id: 'user-1' } })

    expect(warnings).toEqual([])
  })

  it('names the account, not the address, when the limit is hit', async () => {
    await expect(guard.publicThrowThrottlingException()).rejects.toThrow(
      'Too many requests from this account',
    )
  })
})

import { GqlThrottlerGuard } from './gql-throttler.guard'
import { GqlExecutionContext } from '@nestjs/graphql'
import { ExecutionContext } from '@nestjs/common'

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

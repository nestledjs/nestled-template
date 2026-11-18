import { ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { OrganizationContextService } from '../services/organization-context.service'
import { GqlAuthGuard } from './gql-auth.guard'

describe('GqlAuthGuard organization context', () => {
  const req = { user: { id: 'user-1' }, headers: {} }
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext
  let attach: jest.Mock
  let guard: GqlAuthGuard

  beforeEach(() => {
    // The session itself is valid: passport has already authenticated the request.
    jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockResolvedValue(true)
    attach = jest.fn()
    guard = new GqlAuthGuard({ attach } as unknown as OrganizationContextService)
  })

  afterEach(() => jest.restoreAllMocks())

  it('lets a user with no organization through (a plain authenticated operation)', async () => {
    attach.mockResolvedValue(undefined)

    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('lets a refusal of the organization through without context, as before', async () => {
    attach.mockRejectedValue(new ForbiddenException('not a member'))

    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  // A failed lookup (database or Redis down) is an outage. Swallowing it left the request with no
  // organization, and the user saw the organization picker instead of the outage screen.
  it('answers a failed organization lookup with a 503', async () => {
    attach.mockRejectedValue(new Error('database unavailable'))

    const failure = guard.canActivate(context)

    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toMatchObject({ status: 503 })
  })
})

import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { AUTH_LEVEL_KEY } from './auth-level.decorator'
import { GlobalAuthGuard } from './global-auth.guard'

class GqlAuthAdminGuard {}
class GqlAuthGuard {}
class GqlThrottlerGuard {}

class SomeResolver {
  operation() {
    return null
  }
}

const contextFor = (): ExecutionContext =>
  ({
    getHandler: () => SomeResolver.prototype.operation,
    getClass: () => SomeResolver,
  }) as unknown as ExecutionContext

const guardWith = (metadata: { level?: string; handlerGuards?: unknown[] }) => {
  const reflector = new Reflector()
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation(key => (key === AUTH_LEVEL_KEY ? metadata.level : undefined) as never)
  jest
    .spyOn(reflector, 'get')
    .mockImplementation(
      key => (key === GUARDS_METADATA ? metadata.handlerGuards : undefined) as never,
    )
  return new GlobalAuthGuard(reflector)
}

describe('GlobalAuthGuard', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('refuses an operation that declares nothing', () => {
    // The whole point: a new resolver with no decorator must not ship reachable.
    expect(() => guardWith({}).canActivate(contextFor())).toThrow(ForbiddenException)
  })

  it('logs the internal target without exposing it in the response', () => {
    let thrown: unknown

    try {
      guardWith({}).canActivate(contextFor())
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe(
      'Access level is not configured. Add @Public(), @Authenticated(), or @AdminOnly().',
    )
    expect((thrown as ForbiddenException).message).not.toContain('SomeResolver')
    expect((thrown as ForbiddenException).message).not.toContain('operation')
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'SomeResolver.operation declares no access level; add @Public(), @Authenticated(), or @AdminOnly().',
    )
  })

  it('allows an explicitly public operation', () => {
    expect(guardWith({ level: 'public' }).canActivate(contextFor())).toBe(true)
  })

  it('defers to the declared guard for authenticated and admin levels', () => {
    // This guard runs before method guards, so req.user is not populated yet. It only refuses the
    // undeclared; the attached guard performs the actual check.
    expect(guardWith({ level: 'authenticated' }).canActivate(contextFor())).toBe(true)
    expect(guardWith({ level: 'admin' }).canActivate(contextFor())).toBe(true)
  })

  it('does not accept an attached guard in place of a declaration', () => {
    // The bridge that allowed this existed only until generators 1.1.6 emitted decorators on
    // generated CRUD. Inferring intent from whichever guards are attached is what let a throttler
    // read as authentication, so no guard substitutes for saying what the operation is.
    expect(() =>
      guardWith({ handlerGuards: [GqlAuthAdminGuard] }).canActivate(contextFor()),
    ).toThrow(ForbiddenException)
    expect(() => guardWith({ handlerGuards: [GqlAuthGuard] }).canActivate(contextFor())).toThrow(
      ForbiddenException,
    )
    expect(() =>
      guardWith({ handlerGuards: [GqlThrottlerGuard] }).canActivate(contextFor()),
    ).toThrow(ForbiddenException)
  })

  it('honours a declaration regardless of which guards are attached', () => {
    expect(
      guardWith({ level: 'admin', handlerGuards: [GqlThrottlerGuard] }).canActivate(contextFor()),
    ).toBe(true)
  })
})

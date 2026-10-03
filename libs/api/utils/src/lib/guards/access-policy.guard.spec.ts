import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ModuleRef, Reflector } from '@nestjs/core'
import { OrganizationContextService } from '../services/organization-context.service'
import { AccessPolicyGuard, permissionGrantMatches } from './access-policy.guard'
import { ACCESS_CONTROL_SERVICE, ACCESS_POLICY_KEY, AccessPolicy } from './access-policy.types'

class TestController {
  operation() {
    return null
  }
}

function httpContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => TestController.prototype.operation,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
  } as unknown as ExecutionContext
}

function createGuard(options: {
  policy?: AccessPolicy
  platformPermissions?: string[]
  organizationContext?: {
    organizationId: string
    userId: string
    roleId: string
    roleName: string
    permissions: Array<{ subject: string; action: string }>
  }
}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === ACCESS_POLICY_KEY ? options.policy : undefined,
    ),
  } as unknown as Reflector
  const evaluator = {
    getUserPlatformPermissions: jest.fn().mockResolvedValue(options.platformPermissions ?? []),
  }
  const moduleRef = {
    get: jest.fn((token: string) => (token === ACCESS_CONTROL_SERVICE ? evaluator : undefined)),
  } as unknown as ModuleRef
  const organizationContextService = {
    attach: jest.fn().mockResolvedValue(options.organizationContext),
  } as unknown as OrganizationContextService

  return {
    guard: new AccessPolicyGuard(reflector, moduleRef, organizationContextService),
    evaluator,
    organizationContextService,
  }
}

describe('permissionGrantMatches', () => {
  it('matches exact, namespace wildcard, and universal grants', () => {
    expect(permissionGrantMatches('platform.users.read', 'platform.users.read')).toBe(true)
    expect(permissionGrantMatches('platform.*', 'platform.users.read')).toBe(true)
    expect(permissionGrantMatches('*', 'member:update')).toBe(true)
  })

  it('does not treat a sibling namespace as a match', () => {
    expect(permissionGrantMatches('platform.users.*', 'platform.billing.read')).toBe(false)
  })
})

describe('AccessPolicyGuard', () => {
  it('passes when no access policy is declared', async () => {
    const { guard } = createGuard({})
    await expect(guard.canActivate(httpContext({}))).resolves.toBe(true)
  })

  it('refuses a declared policy without an authenticated principal', async () => {
    const { guard } = createGuard({
      policy: { scope: 'platform', permissions: ['platform.users.read'], match: 'any' },
    })
    await expect(guard.canActivate(httpContext({}))).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('allows legacy super administrators without querying role assignments', async () => {
    const { guard, evaluator } = createGuard({
      policy: { scope: 'platform', permissions: ['platform.users.read'], match: 'any' },
    })
    const request = { user: { id: 'root', isSuperAdmin: true } }

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true)
    expect(evaluator.getUserPlatformPermissions).not.toHaveBeenCalled()
  })

  it('allows legacy super administrators to target any organization without membership', async () => {
    const { guard, organizationContextService } = createGuard({
      policy: {
        scope: 'organization',
        permissions: ['role:update'],
        match: 'any',
        organizationIdPath: 'organizationId',
      },
    })
    const request = {
      user: { id: 'root', isSuperAdmin: true },
      body: { organizationId: 'org-target' },
    }

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true)
    expect(organizationContextService.attach).not.toHaveBeenCalled()
  })

  it('memoizes platform grants for every guarded operation on one request', async () => {
    const { guard, evaluator } = createGuard({
      policy: { scope: 'platform', permissions: ['platform.users.read'], match: 'any' },
      platformPermissions: ['platform.users.read'],
    })
    const request = { user: { id: 'user-1', isSuperAdmin: false } }

    await guard.canActivate(httpContext(request))
    await guard.canActivate(httpContext(request))

    expect(evaluator.getUserPlatformPermissions).toHaveBeenCalledTimes(1)
  })

  it('supports all-of platform policies', async () => {
    const { guard } = createGuard({
      policy: {
        scope: 'platform',
        permissions: ['platform.users.read', 'platform.users.manage'],
        match: 'all',
      },
      platformPermissions: ['platform.users.read'],
    })

    await expect(
      guard.canActivate(httpContext({ user: { id: 'user-1', isSuperAdmin: false } })),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('loads the organization named by the policy instead of trusting active context', async () => {
    const policy: AccessPolicy = {
      scope: 'organization',
      permissions: ['member:update'],
      match: 'any',
      organizationIdPath: 'input.organizationId',
    }
    const { guard, organizationContextService } = createGuard({
      policy,
      organizationContext: {
        organizationId: 'org-target',
        userId: 'user-1',
        roleId: 'role-1',
        roleName: 'Manager',
        permissions: [{ subject: 'member', action: 'update' }],
      },
    })
    const request = {
      user: { id: 'user-1', isSuperAdmin: false },
      body: { input: { organizationId: 'org-target' } },
    }

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true)
    expect(organizationContextService.attach).toHaveBeenCalledWith(request, 'org-target')
  })

  it('fails closed when a declared organization target path does not resolve', async () => {
    const { guard, organizationContextService } = createGuard({
      policy: {
        scope: 'organization',
        permissions: ['member:update'],
        match: 'any',
        organizationIdPath: 'input.organizationId',
      },
    })
    const request = {
      user: { id: 'user-1', isSuperAdmin: false },
      body: { input: {} },
    }

    await expect(guard.canActivate(httpContext(request))).rejects.toBeInstanceOf(ForbiddenException)
    expect(organizationContextService.attach).not.toHaveBeenCalled()
  })
})

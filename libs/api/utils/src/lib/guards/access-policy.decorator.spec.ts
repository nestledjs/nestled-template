import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AUTH_LEVEL_KEY } from './auth-level.decorator'
import { AccessPolicyGuard } from './access-policy.guard'
import {
  RequireAllOrganizationPermissions,
  RequirePlatformPermission,
} from './access-policy.decorator'
import { ACCESS_POLICY_KEY } from './access-policy.types'
import { GqlAuthGuard } from './gql-auth.guard'

function metadataWrittenBy(decorator: MethodDecorator) {
  class Target {
    operation() {
      return null
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(Target.prototype, 'operation')
  if (!descriptor) throw new Error('Expected operation descriptor')
  decorator(Target.prototype, 'operation', descriptor)
  return {
    auth: Reflect.getMetadata(AUTH_LEVEL_KEY, Target.prototype.operation),
    policy: Reflect.getMetadata(ACCESS_POLICY_KEY, Target.prototype.operation),
    guards: Reflect.getMetadata(GUARDS_METADATA, Target.prototype.operation),
  }
}

describe('access policy decorators', () => {
  it('composes authentication and enforcement with platform policy metadata', () => {
    const metadata = metadataWrittenBy(
      RequirePlatformPermission('platform.users.read', 'platform.users.manage'),
    )

    expect(metadata.auth).toBe('authenticated')
    expect(metadata.policy).toEqual({
      scope: 'platform',
      permissions: ['platform.users.read', 'platform.users.manage'],
      match: 'any',
    })
    expect(metadata.guards).toEqual([GqlAuthGuard, AccessPolicyGuard])
  })

  it('records organization target selection and all-of semantics', () => {
    const metadata = metadataWrittenBy(
      RequireAllOrganizationPermissions(['role:read', 'role:update'], {
        organizationIdPath: 'input.organizationId',
      }),
    )

    expect(metadata.policy).toEqual({
      scope: 'organization',
      permissions: ['role:read', 'role:update'],
      match: 'all',
      organizationIdPath: 'input.organizationId',
    })
  })
})

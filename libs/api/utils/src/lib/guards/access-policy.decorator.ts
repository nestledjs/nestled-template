import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { Authenticated } from './auth-level.decorator'
import { AccessPolicyGuard } from './access-policy.guard'
import { GqlAuthGuard } from './gql-auth.guard'
import { ACCESS_POLICY_KEY, AccessPolicy } from './access-policy.types'

export * from './access-policy.types'

interface OrganizationPolicyOptions {
  organizationIdPath?: string
}

function policyDecorators(policy: AccessPolicy) {
  return applyDecorators(
    Authenticated(),
    SetMetadata(ACCESS_POLICY_KEY, policy),
    UseGuards(GqlAuthGuard, AccessPolicyGuard),
  )
}

/** Admit a caller who holds at least one of the listed platform permissions. */
export const RequirePlatformPermission = (...permissions: string[]) =>
  policyDecorators({ scope: 'platform', permissions, match: 'any' })

/** Admit a caller only when every listed platform permission is held. */
export const RequireAllPlatformPermissions = (...permissions: string[]) =>
  policyDecorators({ scope: 'platform', permissions, match: 'all' })

/** Admit a caller who holds at least one listed permission in the target organization. */
export const RequireOrganizationPermission = (
  permissions: string[],
  options: OrganizationPolicyOptions = {},
) =>
  policyDecorators({
    scope: 'organization',
    permissions,
    match: 'any',
    organizationIdPath: options.organizationIdPath,
  })

/** Admit a caller only when every listed permission is held in the target organization. */
export const RequireAllOrganizationPermissions = (
  permissions: string[],
  options: OrganizationPolicyOptions = {},
) =>
  policyDecorators({
    scope: 'organization',
    permissions,
    match: 'all',
    organizationIdPath: options.organizationIdPath,
  })

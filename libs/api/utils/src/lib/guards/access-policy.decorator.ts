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

/**
 * The same policy, for a method whose CLASS already authenticates.
 *
 * `RequirePlatformPermission` composes `Authenticated()` and `UseGuards(GqlAuthGuard, ...)`, which
 * is right on a bare resolver and wrong on one already carrying `@UseGuards(GqlAuthAdminGuard)` +
 * `@AdminOnly()`. There it costs a second JWT verification and an organization-context preload per
 * call -- a database round trip for platform-scoped work that has no organization to preload -- and
 * the method-level `Authenticated()` overrides the class's `AdminOnly()` under
 * `getAllAndOverride([handler, controller])`, so the operation ends up DECLARING `authenticated`
 * while the class guard still ENFORCES admin. Enforcement holds; the declaration lies.
 *
 * This variant sets the policy and adds only `AccessPolicyGuard`. That guard authenticates nothing
 * -- it throws `UnauthorizedException` when `request.user` is absent -- so it is only correct where
 * a class-level guard has already established the user. Do not reach for it anywhere else.
 */
function policyDecoratorsUnderClassGuard(policy: AccessPolicy) {
  return applyDecorators(SetMetadata(ACCESS_POLICY_KEY, policy), UseGuards(AccessPolicyGuard))
}

/**
 * Platform permission for a method on an already-authenticating class.
 *
 * Generated CRUD resolvers are the case this exists for: the class carries the admin guard, and
 * every method needs its own permission without re-running authentication 138 times.
 */
export const RequirePlatformPermissionUnderClassGuard = (...permissions: string[]) =>
  policyDecoratorsUnderClassGuard({ scope: 'platform', permissions, match: 'any' })

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

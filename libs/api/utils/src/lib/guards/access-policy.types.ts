export const ACCESS_POLICY_KEY = 'nestled:accessPolicy'
export const ACCESS_CONTROL_SERVICE = 'NESTLED_ACCESS_CONTROL_SERVICE'

export type AccessPolicyScope = 'platform' | 'organization'
export type AccessPolicyMatch = 'any' | 'all'

export interface AccessPolicy {
  scope: AccessPolicyScope
  permissions: string[]
  match: AccessPolicyMatch
  /** Dot-separated path in GraphQL args or REST params/body containing the target organization. */
  organizationIdPath?: string
}

export interface PlatformPermissionEvaluator {
  getUserPlatformPermissions(userId: string): Promise<readonly string[]>
}

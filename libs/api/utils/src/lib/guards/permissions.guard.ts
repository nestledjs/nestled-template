import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'
import { OrganizationContext } from '../types/nest-context-type'

export const PERMISSIONS_KEY = 'permissions'

export interface PermissionRequirement {
  subject: string
  action: string
}

/**
 * Decorator to require specific permissions for a resolver/mutation
 * Usage: @RequirePermissions({ subject: 'organization', action: 'update' })
 */
export const RequirePermissions = (...permissions: PermissionRequirement[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)

/**
 * Guard that checks if the user has required permissions in their current organization
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    )

    if (!requiredPermissions || requiredPermissions.length === 0) {
      // No permissions required
      return true
    }

    const gqlContext = GqlExecutionContext.create(context).getContext()
    const organizationContext: OrganizationContext | undefined = gqlContext.req.organizationContext

    if (!organizationContext) {
      throw new ForbiddenException('Organization context required for this operation')
    }

    // Check if user has ALL required permissions
    const hasAllPermissions = requiredPermissions.every(required =>
      organizationContext.permissions.some(
        p => p.subject === required.subject && p.action === required.action
      )
    )

    if (!hasAllPermissions) {
      const missingPermissions = requiredPermissions
        .filter(
          required =>
            !organizationContext.permissions.some(
              p => p.subject === required.subject && p.action === required.action
            )
        )
        .map(p => `${p.subject}:${p.action}`)

      throw new ForbiddenException(
        `Missing required permissions: ${missingPermissions.join(', ')}. Current role: ${organizationContext.roleName}`
      )
    }

    return true
  }
}

/**
 * Helper function to check permissions programmatically in services
 */
export function hasPermission(
  organizationContext: OrganizationContext | undefined,
  subject: string,
  action: string
): boolean {
  if (!organizationContext) {
    return false
  }

  return organizationContext.permissions.some(
    p => p.subject === subject && p.action === action
  )
}

/**
 * Helper function to require permission or throw
 */
export function requirePermission(
  organizationContext: OrganizationContext | undefined,
  subject: string,
  action: string
): void {
  if (!hasPermission(organizationContext, subject, action)) {
    throw new ForbiddenException(
      `Missing required permission: ${subject}:${action}${
        organizationContext ? `. Current role: ${organizationContext.roleName}` : ''
      }`
    )
  }
}

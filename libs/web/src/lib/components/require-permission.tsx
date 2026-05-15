import React, { ReactNode } from 'react'
import { useGlobalCtx } from '../contexts'

interface RequirePermissionProps {
  children: ReactNode
  permission?: string
  anyOf?: string[]
  allOf?: string[]
  fallback?: ReactNode
}

function checkPermission(permissions: any[], permissionString: string): boolean {
  if (!permissions || !Array.isArray(permissions)) return false

  // Check for super admin permission (all:manage grants access to everything)
  const hasAllManage = permissions.some(
    (p: any) => p.subject === 'all' && p.action === 'manage'
  )
  if (hasAllManage) return true

  // Check specific permission
  const [subject, action] = permissionString.split(':')
  return permissions.some(
    (p: any) => p.subject === subject && p.action === action
  )
}

export function RequirePermission({
  children,
  permission,
  anyOf,
  allOf,
  fallback = null,
}: Readonly<RequirePermissionProps>) {
  const { activeOrganizationMember } = useGlobalCtx()
  const permissions = activeOrganizationMember?.role?.permissions || []

  let hasAccess = false

  if (permission) {
    hasAccess = checkPermission(permissions, permission)
  } else if (anyOf && anyOf.length > 0) {
    hasAccess = anyOf.some(perm => checkPermission(permissions, perm))
  } else if (allOf && allOf.length > 0) {
    hasAccess = allOf.every(perm => checkPermission(permissions, perm))
  }

  if (!hasAccess) {
    if (fallback) {
      return fallback
    }
    return null
  }

  return children
}

// Convenience component for showing content to organization owners only
export function RequireOwner({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) {
  return (
    <RequirePermission permission="organization:delete" fallback={fallback}>
      {children}
    </RequirePermission>
  )
}

// Convenience component for showing content to admins and above
export function RequireAdmin({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) {
  return (
    <RequirePermission anyOf={['member:invite', 'member:update']} fallback={fallback}>
      {children}
    </RequirePermission>
  )
}

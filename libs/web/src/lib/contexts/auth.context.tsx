import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react'
import { useQuery, useMutation } from '@apollo/client/react'
import {
  MyOrganizationsWithMembers,
  SwitchActiveOrganization,
  type MyOrganizationsWithMembersQuery,
  type SwitchActiveOrganizationMutation,
  type User,
} from '@nestled-template/shared/sdk'

type OrganizationContextItem = MyOrganizationsWithMembersQuery['myOrganizations'][number]
type OrganizationMemberContextItem = NonNullable<OrganizationContextItem['members']>[number]
type PermissionContextItem = NonNullable<
  NonNullable<OrganizationMemberContextItem['role']>['permissions']
>[number]

export interface AuthUser extends User {
  activeOrganizationId?: string | null
  activeOrganization?: OrganizationContextItem | null
}

type EmulatedAuthUser = AuthUser & {
  isEmulating?: boolean | null
  originalUserId?: string | null
  originalUser?: AuthUser | null
}

export interface AuthContextType {
  // User state
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean

  // Organization state
  organizations: OrganizationContextItem[]
  activeOrganization: OrganizationContextItem | null
  activeOrganizationMember: OrganizationMemberContextItem | null

  // Emulation state
  isEmulating: boolean
  originalUser: AuthUser | null

  // Actions
  login: (user: AuthUser) => void
  logout: () => void
  switchOrganization: (organizationId: string) => Promise<void>
  refreshOrganizations: () => Promise<void>
  setUser: (user: AuthUser | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  readonly children: ReactNode
  readonly initialUser?: AuthUser | null
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser)
  const [isEmulating, setIsEmulating] = useState(false)
  const [originalUser, setOriginalUser] = useState<AuthUser | null>(null)

  // Fetch user's organizations with member details including roles and permissions
  const {
    data: orgsData,
    loading: orgsLoading,
    refetch: refetchOrgs,
  } = useQuery<MyOrganizationsWithMembersQuery>(MyOrganizationsWithMembers, {
    skip: !user?.id,
  })

  const [switchOrgMutation] =
    useMutation<SwitchActiveOrganizationMutation>(SwitchActiveOrganization)

  const organizations = orgsData?.myOrganizations || []
  const activeOrganization = user
    ? organizations.find(org => org.id === user.activeOrganizationId) || organizations[0] || null
    : null

  // Find the current user's membership in the active organization
  const activeOrganizationMember =
    activeOrganization?.members?.find(member => member.userId === user?.id) || null

  const isAuthenticated = !!user?.id
  const isLoading = orgsLoading

  const login = (newUser: AuthUser) => {
    setUser(newUser)
  }

  const logout = () => {
    setUser(null)
    setIsEmulating(false)
    setOriginalUser(null)
    // Clear organization context from localStorage
    if (globalThis.window !== undefined) {
      localStorage.removeItem('activeOrganizationId')
    }
    // The actual logout mutation should be called from the logout page
    // This just clears the local state
  }

  const switchOrganization = async (organizationId: string) => {
    if (!user) return

    try {
      const { data } = await switchOrgMutation({
        variables: {
          input: { organizationId },
        },
      })

      if (data?.switchActiveOrganization) {
        setUser({
          ...user,
          activeOrganizationId: data.switchActiveOrganization.activeOrganizationId,
        })
      }
    } catch (error) {
      console.error('Failed to switch organization:', error)
      throw error
    }
  }

  const refreshOrganizations = async () => {
    await refetchOrgs()
  }

  // Check for emulation state in JWT (if backend supports it)
  useEffect(() => {
    if (user) {
      // Check if user object has emulation flags
      const emulatedUser = user as EmulatedAuthUser
      if (emulatedUser.isEmulating && emulatedUser.originalUserId) {
        setIsEmulating(true)
        setOriginalUser(emulatedUser.originalUser || null)
      }
    }
  }, [user])

  // Sync activeOrganizationId to localStorage for Apollo client X-Organization-ID header
  useEffect(() => {
    if (globalThis.window === undefined) return

    const orgId = user?.activeOrganizationId || activeOrganization?.id
    if (orgId) {
      localStorage.setItem('activeOrganizationId', orgId)
    } else {
      localStorage.removeItem('activeOrganizationId')
    }
  }, [user, activeOrganization])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      organizations,
      activeOrganization,
      activeOrganizationMember,
      isEmulating,
      originalUser,
      login,
      logout,
      switchOrganization,
      refreshOrganizations,
      setUser,
    }),
    [
      user,
      isAuthenticated,
      isLoading,
      organizations,
      activeOrganization,
      activeOrganizationMember,
      isEmulating,
      originalUser,
      login,
      logout,
      switchOrganization,
      refreshOrganizations,
      setUser,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper to check if permissions array contains super admin (all:manage)
function hasSuperAdminPermission(permissions: PermissionContextItem[] | undefined): boolean {
  if (!permissions || !Array.isArray(permissions)) return false
  return permissions.some(p => p.subject === 'all' && p.action === 'manage')
}

// Hook to check if user has a specific permission
export function useHasPermission(permission: string): boolean {
  const { activeOrganizationMember } = useAuth()

  if (!activeOrganizationMember?.role?.permissions) {
    return false
  }

  // Super admin has all permissions
  if (hasSuperAdminPermission(activeOrganizationMember.role.permissions)) {
    return true
  }

  // Parse permission string (e.g., "organization:update")
  const [subject, action] = permission.split(':')

  return activeOrganizationMember.role.permissions.some(
    p => p.subject === subject && p.action === action,
  )
}

// Hook to check if user has any of the specified permissions
export function useHasAnyPermission(permissions: string[]): boolean {
  const { activeOrganizationMember } = useAuth()

  if (!activeOrganizationMember?.role?.permissions) {
    return false
  }

  // Super admin has all permissions
  if (hasSuperAdminPermission(activeOrganizationMember.role.permissions)) {
    return true
  }

  return permissions.some(permission => {
    const [subject, action] = permission.split(':')
    return activeOrganizationMember.role?.permissions?.some(
      p => p.subject === subject && p.action === action,
    )
  })
}

// Hook to check if user has all of the specified permissions
export function useHasAllPermissions(permissions: string[]): boolean {
  const { activeOrganizationMember } = useAuth()

  if (!activeOrganizationMember?.role?.permissions) {
    return false
  }

  // Super admin has all permissions
  if (hasSuperAdminPermission(activeOrganizationMember.role.permissions)) {
    return true
  }

  return permissions.every(permission => {
    const [subject, action] = permission.split(':')
    return activeOrganizationMember.role?.permissions?.some(
      p => p.subject === subject && p.action === action,
    )
  })
}

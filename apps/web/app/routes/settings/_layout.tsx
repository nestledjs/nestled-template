import React from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import {
  BellIcon,
  BuildingOfficeIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  KeyIcon,
  RectangleGroupIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { useGlobalCtx } from '@nestled-template/web'
import {
  MyOrganizationsWithMembers,
  type MeQuery,
  type MyOrganizationsWithMembersQuery,
} from '@nestled-template/shared/sdk'
import { Avatar } from '@nestled-template/web-ui'
import { cn } from '@nestled-template/shared/utils'
import { useQuery } from '@apollo/client/react'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  permission?: string
  superAdminOnly?: boolean
  description: string
}

type UserWithActiveOrganization = NonNullable<MeQuery['me']> & {
  activeOrganizationId?: string | null
}

type ActiveOrganizationMember = NonNullable<
  NonNullable<MyOrganizationsWithMembersQuery['myOrganizations'][number]['members']>[number]
>

function hasBillingAccess(
  user: MeQuery['me'] | null | undefined,
  member: ActiveOrganizationMember | null,
) {
  if (user?.isSuperAdmin) return true
  if (!member) return false

  const roleName = member.role?.name
  if (roleName === 'Owner' || roleName === 'Admin') return true

  return !!member.role?.permissions?.some(p => p.subject === 'billing' && p.action === 'read')
}

function hasRolePermission(member: ActiveOrganizationMember | null, permission: string) {
  const [subject, action] = permission.split(':')
  return !!member?.role?.permissions?.some(p => p.subject === subject && p.action === action)
}

function canViewSetting(
  permission: string | undefined,
  user: MeQuery['me'] | null | undefined,
  hasActiveOrganization: boolean,
  activeOrganizationMember: ActiveOrganizationMember | null,
) {
  if (!permission) return true
  if (!hasActiveOrganization) return false
  if (permission === 'organization:read' || permission === 'member:read') return true
  if (permission === 'billing:read') return hasBillingAccess(user, activeOrganizationMember)

  return hasRolePermission(activeOrganizationMember, permission)
}

export default function SettingsLayout() {
  const location = useLocation()
  const { user } = useGlobalCtx()

  // Fetch user's organizations with member data
  const { data: orgsData } = useQuery<MyOrganizationsWithMembersQuery>(MyOrganizationsWithMembers)
  const organizations = orgsData?.myOrganizations || []
  const userWithActiveOrganization: UserWithActiveOrganization | null | undefined = user
  const activeOrganization =
    organizations.find(org => org.id === userWithActiveOrganization?.activeOrganizationId) ||
    organizations[0] ||
    null
  const activeOrganizationMember =
    activeOrganization?.members?.find(member => member.userId === user?.id) || null

  const personalSettings: NavItem[] = [
    {
      name: 'Profile',
      href: '/settings/profile',
      icon: UserCircleIcon,
      description: 'Name, email, avatar, and personal info',
    },
    {
      name: 'Security',
      href: '/settings/security',
      icon: ShieldCheckIcon,
      description: '2FA, sessions, and password settings',
    },
    {
      name: 'API Tokens',
      href: '/settings/api-tokens',
      icon: KeyIcon,
      description: 'Personal API tokens and client access',
    },
    {
      name: 'Notifications',
      href: '/settings/notifications',
      icon: BellIcon,
      description: 'Email and notification preferences',
    },
  ]

  const organizationSettings: NavItem[] = [
    {
      name: 'Organization',
      href: '/settings/organization',
      icon: BuildingOfficeIcon,
      permission: 'organization:read',
      description: 'Name, logo, and organization details',
    },
    {
      name: 'Team Members',
      href: '/settings/members',
      icon: UsersIcon,
      permission: 'member:read',
      description: 'Manage team members and invitations',
    },
    {
      name: 'Roles & Permissions',
      href: '/settings/roles',
      icon: RectangleGroupIcon,
      permission: 'role:read',
      description: 'Customize organization access',
    },
    {
      name: 'Billing',
      href: '/settings/billing',
      icon: CreditCardIcon,
      permission: 'billing:read',
      description: 'Subscription and payment settings',
    },
    {
      name: 'AI & MCP',
      href: '/settings/ai',
      icon: SparklesIcon,
      permission: 'organization:update',
      description: 'Organization-scoped AI assistant tokens',
    },
  ]

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(`${href}/`)
  }

  const hasPermission = (permission?: string) => {
    return canViewSetting(permission, user, !!activeOrganization, activeOrganizationMember)
  }

  const userAvatar = user?.avatar
  const organizationLogo = activeOrganization?.logo
  const adminConsoleItem: NavItem = {
    name: 'Admin Console',
    href: '/admin',
    icon: Cog6ToothIcon,
    superAdminOnly: true,
    description: 'Platform setup and operations',
  }

  return (
    <div className="flex-1 bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Settings
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage your account and {activeOrganization?.name} settings
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <nav className="lg:w-64 flex-shrink-0">
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 backdrop-blur">
              {/* Personal Settings Section */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4 p-2 rounded-lg bg-zinc-50 dark:bg-white/5">
                  <Avatar
                    imageUrl={userAvatar?.publicUrl ?? userAvatar?.url ?? undefined}
                    fallbackText={
                      `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
                      user?.displayName ||
                      'User'
                    }
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                      {`${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
                        user?.displayName ||
                        'Personal'}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Personal Settings
                    </div>
                  </div>
                </div>
                <ul className="space-y-1">
                  {personalSettings.map(item => {
                    // Skip super admin only items for non-super admins
                    if (item.superAdminOnly && !user?.isSuperAdmin) {
                      return null
                    }

                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive(item.href)
                              ? 'bg-emerald-500 text-white'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10',
                          )}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{item.name}</div>
                            <div
                              className={cn(
                                'text-xs truncate',
                                isActive(item.href)
                                  ? 'text-emerald-100'
                                  : 'text-zinc-500 dark:text-zinc-400',
                              )}
                            >
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* Organization Settings Section */}
              <div>
                <button
                  onClick={() => {
                    /* FUTURE: Organization switcher */
                  }}
                  className="flex items-center gap-3 mb-4 p-2 rounded-lg bg-zinc-50 dark:bg-white/5 w-full hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                >
                  <Avatar
                    imageUrl={organizationLogo?.publicUrl ?? organizationLogo?.url ?? undefined}
                    fallbackText={activeOrganization?.name || 'Org'}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                      {activeOrganization?.name || 'Organization'}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {activeOrganizationMember?.role?.name || 'Organization Settings'}
                    </div>
                  </div>
                </button>
                <ul className="space-y-1">
                  {organizationSettings.map(item => {
                    // Skip items that require permissions the user doesn't have
                    if (item.permission && !hasPermission(item.permission)) {
                      return null
                    }

                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive(item.href)
                              ? 'bg-emerald-500 text-white'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10',
                          )}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{item.name}</div>
                            <div
                              className={cn(
                                'text-xs truncate',
                                isActive(item.href)
                                  ? 'text-emerald-100'
                                  : 'text-zinc-500 dark:text-zinc-400',
                              )}
                            >
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {user?.isSuperAdmin && (
                <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-white/10">
                  <Link
                    to={adminConsoleItem.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive(adminConsoleItem.href)
                        ? 'bg-emerald-500 text-white'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10',
                    )}
                  >
                    <adminConsoleItem.icon className="h-5 w-5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{adminConsoleItem.name}</div>
                      <div
                        className={cn(
                          'truncate text-xs',
                          isActive(adminConsoleItem.href)
                            ? 'text-emerald-100'
                            : 'text-zinc-500 dark:text-zinc-400',
                        )}
                      >
                        {adminConsoleItem.description}
                      </div>
                    </div>
                  </Link>
                </div>
              )}
            </div>
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}

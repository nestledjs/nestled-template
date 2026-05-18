import React from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import {
  ArrowLeftIcon,
  BuildingOfficeIcon,
  ChartBarSquareIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  DocumentMagnifyingGlassIcon,
  HomeIcon,
  ShieldCheckIcon,
  TableCellsIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { useGlobalCtx } from '@nestled-template/web'
import { cn } from '@nestled-template/shared/utils'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  description: string
}

interface NavSection {
  name: string
  items: NavItem[]
}

export default function AdminLayout() {
  const location = useLocation()
  const { user } = useGlobalCtx()

  // Show loading if no user data yet
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  // Redirect non-super admins
  if (!user.isSuperAdmin) {
    return <Navigate to="/members/dashboard" replace />
  }

  const navigationSections: NavSection[] = [
    {
      name: 'Admin Operations',
      items: [
        {
          name: 'Dashboard',
          href: '/admin',
          icon: HomeIcon,
          description: 'Overview and key metrics',
        },
        {
          name: 'Users',
          href: '/admin/users',
          icon: UsersIcon,
          description: 'User management and emulation',
        },
        {
          name: 'Organizations',
          href: '/admin/organizations',
          icon: BuildingOfficeIcon,
          description: 'Organization management',
        },
        {
          name: 'Security Events',
          href: '/admin/security-events',
          icon: ShieldCheckIcon,
          description: 'Login attempts and 2FA',
        },
        {
          name: 'Audit Logs',
          href: '/admin/audit-logs',
          icon: DocumentMagnifyingGlassIcon,
          description: 'Activity and event tracking',
        },
      ],
    },
    {
      name: 'System Administration',
      items: [
        {
          name: 'App Settings',
          href: '/admin/settings',
          icon: Cog6ToothIcon,
          description: 'Application preferences',
        },
        {
          name: 'Billing',
          href: '/admin/billing',
          icon: CreditCardIcon,
          description: 'Plans and subscriptions',
        },
        {
          name: 'Data Browser',
          href: '/admin/data',
          icon: TableCellsIcon,
          description: 'Database query tool',
        },
        {
          name: 'Analytics',
          href: '/admin/analytics',
          icon: ChartBarSquareIcon,
          description: 'Platform metrics and reporting',
        },
      ],
    },
  ]

  const isActive = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* Sidebar Navigation */}
        <nav className="border-b border-zinc-200 bg-white/95 p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950/95 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:flex-shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6">
            <div>
              <Link
                to="/members/dashboard"
                className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back to app
              </Link>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                Admin Console
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Platform administration and setup
              </p>
            </div>

            <div className="space-y-6">
              {/* Navigation Sections */}
              {navigationSections.map((section, sectionIdx) => (
                <div key={section.name}>
                  {sectionIdx > 0 && (
                    <div className="border-t border-zinc-200 dark:border-white/10 mb-4" />
                  )}
                  <div className="mb-3">
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      {section.name}
                    </h3>
                  </div>
                  <ul className="space-y-1">
                    {section.items.map(item => (
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
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}

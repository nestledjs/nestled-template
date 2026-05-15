import React from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import {
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
    <div className="flex-1 bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Admin Panel
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Platform administration and management
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <nav className="lg:w-64 flex-shrink-0">
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 backdrop-blur space-y-6">
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
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 overflow-x-auto">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}

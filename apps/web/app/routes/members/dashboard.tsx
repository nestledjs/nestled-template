import React from 'react'
import { Link } from 'react-router'
import { ChartBarIcon, UsersIcon, CogIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

export default function MembersDashboard() {
  const quickLinks = [
    {
      name: 'Analytics',
      description: 'View your usage stats',
      icon: ChartBarIcon,
      href: '/members/analytics',
      color: 'emerald',
    },
    {
      name: 'Team',
      description: 'Manage your team members',
      icon: UsersIcon,
      href: '/members/team',
      color: 'sky',
    },
    {
      name: 'Settings',
      description: 'Configure your account',
      icon: CogIcon,
      href: '/members/settings',
      color: 'violet',
    },
    {
      name: 'Documentation',
      description: 'Learn how to use the platform',
      icon: DocumentTextIcon,
      href: '/docs',
      color: 'amber',
    },
  ]

  return (
    <div className="flex-1 bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Welcome back!
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Here's what's happening with your account today.
          </p>
        </div>

        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Users</p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">1,234</p>
              </div>
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-500/10 p-3">
                <UsersIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              +12% from last month
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Revenue</p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">$12.5k</p>
              </div>
              <div className="rounded-lg bg-sky-100 dark:bg-sky-500/10 p-3">
                <ChartBarIcon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <p className="mt-2 text-xs text-sky-600 dark:text-sky-400">+8% from last month</p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Active Projects
                </p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">42</p>
              </div>
              <div className="rounded-lg bg-violet-100 dark:bg-violet-500/10 p-3">
                <DocumentTextIcon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
            <p className="mt-2 text-xs text-violet-600 dark:text-violet-400">3 new this week</p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Completion Rate
                </p>
                <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">94%</p>
              </div>
              <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-3">
                <ChartBarIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Above target</p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 backdrop-blur">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Quick Actions</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Get started with these common tasks
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map(link => (
              <Link
                key={link.name}
                to={link.href}
                className="group relative overflow-hidden rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-6 transition hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-lg"
              >
                <link.icon className="h-8 w-8 text-zinc-400 dark:text-zinc-500 transition group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
                <h3 className="mt-4 font-semibold text-zinc-900 dark:text-white">{link.name}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-emerald-500 to-sky-500 p-8 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Ready to do more?</h2>
              <p className="mt-2 text-emerald-50">
                Upgrade to Pro for unlimited access to all features
              </p>
            </div>
            <button className="rounded-lg bg-white px-6 py-3 font-semibold text-emerald-600 shadow-lg transition hover:bg-emerald-50">
              Upgrade Now
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p>
            This is a placeholder dashboard. Customize it at{' '}
            <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-900 dark:text-zinc-100">
              apps/web/app/routes/members/dashboard.tsx
            </code>
          </p>
        </div>
      </div>
    </div>
  )
}

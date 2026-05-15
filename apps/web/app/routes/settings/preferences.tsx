import React from 'react'
import { useLoaderData } from 'react-router'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { apolloLoader, ReadQueryDataState } from '@nestled-template/shared/apollo'
import { Me, MeQuery } from '@nestled-template/shared/sdk'
import { useReadQuery } from '@apollo/client/react'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const meQueryRef = preloadQuery<MeQuery>(Me)
  return { meQueryRef }
})

export default function ApplicationPreferences() {
  const loaderData = useLoaderData()
  const { data } = useReadQuery<MeQuery, ReadQueryDataState>(loaderData.meQueryRef)
  const user = data?.me

  // Only super admins can access this page
  if (!user?.isSuperAdmin) {
    throw new Response('Not Found', { status: 404 })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-100 dark:bg-violet-500/10 p-3">
            <Cog6ToothIcon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
              Application Preferences
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Global application settings and configurations (Super Admin Only)
            </p>
          </div>
        </div>
      </div>

      {/* Coming Soon Message */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="text-center py-8">
          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Cog6ToothIcon className="h-8 w-8 text-zinc-500 dark:text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
            Application Preferences
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            Global application settings, feature flags, and system configurations will be available
            here soon.
          </p>
        </div>
      </div>

      {/* Future Features Placeholder */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Planned Features
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
            <div className="h-2 w-2 rounded-full bg-zinc-400"></div>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Feature flags and toggles
            </span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
            <div className="h-2 w-2 rounded-full bg-zinc-400"></div>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              System-wide notification settings
            </span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
            <div className="h-2 w-2 rounded-full bg-zinc-400"></div>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Application maintenance mode
            </span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
            <div className="h-2 w-2 rounded-full bg-zinc-400"></div>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Global user defaults and limits
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

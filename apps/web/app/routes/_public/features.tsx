import React from 'react'
import { Link } from 'react-router'

const routeFiles = [
  {
    label: 'Route table',
    path: 'apps/web/app/routes.tsx',
    detail: 'Register, move, or remove routes here. React Router routes are not file-discovered.',
  },
  {
    label: 'Public layout',
    path: 'apps/web/app/routes/_public/_layout.tsx',
    detail: 'Update public navigation links here when a public page is added or removed.',
  },
  {
    label: 'Shared header',
    path: 'libs/web-ui/src/lib/web-ui-header.tsx',
    detail: 'Keep the fallback navigation aligned for consumers that do not pass custom links.',
  },
]

export default function FeaturesRouteGuidePage() {
  return (
    <div className="flex-1 bg-zinc-50 px-4 py-16 text-zinc-900 dark:bg-zinc-950 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-sky-300">
            Routing guide
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Features is a placeholder route you can replace or remove
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-700 dark:text-zinc-300">
            This template uses an explicit React Router route table. Creating a file is not enough
            to make a page live, and deleting a page file is not enough to remove a navigation path.
            Use this page as a reminder of where routes and public links are wired together.
          </p>
        </div>

        <div className="mt-10 grid gap-4">
          {routeFiles.map(item => (
            <section
              key={item.path}
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-white/5 dark:shadow-2xl dark:shadow-black/20"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    {item.label}
                  </h2>
                  <p className="mt-2 text-zinc-700 dark:text-zinc-300">{item.detail}</p>
                </div>
                <code className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-emerald-700 dark:border-white/10 dark:bg-black/30 dark:text-emerald-300">
                  {item.path}
                </code>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-sky-200 bg-sky-50 p-6 dark:border-sky-400/20 dark:bg-sky-400/10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            When you customize this template
          </h2>
          <p className="mt-3 text-zinc-700 dark:text-zinc-200">
            Replace this route with your real features page, or delete it if you do not need one. If
            you delete it, also remove the Features link from the public navigation and shared
            header fallback so users never land on a missing route.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/blog"
              className="inline-flex items-center justify-center rounded-lg bg-sky-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-sky-200"
            >
              See add-ons example
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white dark:border-white/15 dark:text-white dark:hover:bg-white/10"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

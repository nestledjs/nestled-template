import React from 'react'
import { Link } from 'react-router'

export default function PublicIndex() {
  return (
    <div className="flex-1 w-full bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-900 dark:from-zinc-900 dark:to-zinc-950 dark:text-white flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Fresh
          install vibes
        </span>

        <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-sky-300 to-fuchsia-300 bg-clip-text text-transparent">
            Your shiny new template is alive
          </span>{' '}
          ✨
        </h1>

        <p className="mt-4 text-lg text-zinc-700 dark:text-zinc-300">
          This is your public landing page. Put your hottest sales copy here — the kind that makes
          investors nod dramatically and customers say “shut up and take my money.”
        </p>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This site was designed by AI and looks relatively terrible on purpose. We thought if we
          made a nice design, everyone would just use it, and the market would get flooded with
          similar sites. So, don't be a loser - take the time to create your own brand and design
          and apply it across the board - if you publish this as is everyone will know you are crazy
          lazy.
        </p>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 text-left shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-2xl">
          <h2 className="text-zinc-900 dark:text-zinc-200 font-semibold">Quick start</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-zinc-700 dark:text-zinc-300">
            <li>
              Replace this copy with your own. File:{' '}
              <code className="text-emerald-300">apps/web/app/routes/public/_index.tsx</code>
            </li>
            <li>Drop in your product screenshots, features, and a compelling call‑to‑action.</li>
            <li>
              When you’re ready, wire this to your auth flow and send folks on their merry way.
            </li>
          </ul>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
            >
              Go to Login
            </Link>
            <Link
              to="/public/about"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              About this Template
            </Link>
          </div>
        </div>

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Not your vibe? No worries — this screen is just a placeholder. Make it yours.{' '}
          <span role="img" aria-label="nail polish">
            💅
          </span>
        </p>
      </div>
    </div>
  )
}

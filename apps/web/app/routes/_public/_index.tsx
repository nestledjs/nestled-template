import React from 'react'
import { Link } from 'react-router'

export default function PublicIndex() {
  return (
    <div className="flex-1 w-full bg-gradient-to-b from-zinc-900 to-zinc-950 text-white flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Fresh install vibes
        </span>

        <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-sky-300 to-fuchsia-300 bg-clip-text text-transparent">
            Your shiny new template is alive
          </span>
          ✨
        </h1>

        <p className="mt-4 text-lg text-zinc-300">
          This is your public landing page. Put your hottest sales copy here — the kind that makes
          investors nod dramatically and customers say “shut up and take my money.”
        </p>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-left shadow-2xl backdrop-blur">
          <h2 className="text-zinc-200 font-semibold">Quick start</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-zinc-300">
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
              className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10"
            >
              About this Template
            </Link>
          </div>
        </div>

        <p className="mt-6 text-sm text-zinc-400">
          Not your vibe? No worries — this screen is just a placeholder. Make it yours. 💅
        </p>
      </div>
    </div>
  )
}

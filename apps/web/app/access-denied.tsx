import { Link } from 'react-router'

export function AccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          Access denied
        </p>
        <h1 className="mt-3 text-3xl font-bold">You don’t have permission to view this page</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-300">
          Your session is active, but your account does not have the required access. If you think
          this is a mistake, contact an administrator.
        </p>
        <Link
          to="/members/dashboard"
          className="mt-6 inline-flex rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  )
}

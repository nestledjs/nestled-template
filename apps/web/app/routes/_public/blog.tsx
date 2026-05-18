import React from 'react'
import { Link } from 'react-router'

const addOnSteps = [
  'Read the add-on spec to understand the product shape, schema, and implementation plan.',
  'Copy the full prompt into your coding assistant when you are ready to build the feature.',
  'Review the generated changes, run the relevant checks, and adapt the result to your product.',
]

export default function BlogAddOnPage() {
  return (
    <div className="flex-1 bg-zinc-50 px-4 py-16 text-zinc-900 dark:bg-zinc-950 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
            Optional add-on
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Blog publishing is available as an add-on
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-700 dark:text-zinc-300">
            Nestled keeps the base template focused on the features most SaaS projects need on day
            one. A production blog is useful for some teams, but it also brings schema, authoring,
            SEO, RSS, sitemap, and moderation decisions. Instead of shipping a half-built blog, this
            page points you to a detailed implementation spec.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-white/5 dark:shadow-2xl dark:shadow-black/20">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              How add-ons work
            </h2>
            <ol className="mt-5 space-y-4">
              {addOnSteps.map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold text-zinc-950">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-zinc-700 dark:text-zinc-300">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <aside className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 shadow-xl dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:shadow-2xl dark:shadow-black/20">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              Blog Publishing spec
            </h2>
            <p className="mt-4 text-sm leading-6 text-emerald-900/80 dark:text-emerald-50/90">
              The spec covers Prisma models, generated CRUD, public GraphQL queries, SDK operations,
              React Router pages, RSS, sitemap integration, tests, and acceptance criteria.
            </p>
            <a
              href="https://nestledjs.com/docs/blog"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300"
            >
              Open the Blog add-on spec
            </a>
          </aside>
        </div>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Why this page exists
          </h2>
          <p className="mt-3 text-zinc-700 dark:text-zinc-300">
            This route gives users a working destination for the public Blog navigation while making
            the add-on model visible. Replace this page with your real blog once you implement the
            Blog Publishing add-on, or delete it if you don't need a blog.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

import React from 'react'

interface AuthLayoutProps {
  readonly title: string
  readonly subtitle?: string
  readonly children: React.ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16 bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 shadow-2xl backdrop-blur">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white text-center mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-center text-zinc-600 dark:text-zinc-300 mb-8">{subtitle}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

import React, { ReactNode } from 'react'
import { Navigate, useLoaderData } from 'react-router'

interface RequireAuthProps {
  readonly children: ReactNode
  readonly redirectTo?: string
}

type RequireAuthLoaderData = {
  meQueryRef?: unknown
  user?: unknown
}

export function RequireAuth({ children, redirectTo = '/login' }: RequireAuthProps) {
  const loaderData = useLoaderData() as RequireAuthLoaderData | null

  // Check if we have user data from the loader (meQueryRef or similar)
  const isAuthenticated = !!loaderData?.meQueryRef || !!loaderData?.user

  if (!isAuthenticated) {
    // No `state` prop on purpose. <Navigate> re-runs navigate() whenever its props change, and a
    // `state={{ from: location }}` object is new on every render. In framework mode each
    // navigation passes through the loading state, so every re-render aborted the pending redirect
    // and started another: thousands of aborted `.data` requests a second. Nothing reads
    // `location.state.from`; pass the return path in the URL (`?redirectTo=`) if you need one.
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}

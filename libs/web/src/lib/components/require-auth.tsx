import React, { ReactNode } from 'react'
import { Navigate, useLocation, useLoaderData } from 'react-router'

interface RequireAuthProps {
  readonly children: ReactNode
  readonly redirectTo?: string
}

export function RequireAuth({ children, redirectTo = '/login' }: RequireAuthProps) {
  const location = useLocation()
  const loaderData = useLoaderData() as any

  // Check if we have user data from the loader (meQueryRef or similar)
  const isAuthenticated = !!loaderData?.meQueryRef || !!loaderData?.user

  if (!isAuthenticated) {
    // Redirect to login, but save the location they were trying to access
    return <Navigate to={redirectTo} state={{ from: location }} replace />
  }

  return <>{children}</>
}

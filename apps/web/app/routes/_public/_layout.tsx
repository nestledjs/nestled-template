import { LoaderFunctionArgs, Outlet, useLoaderData } from 'react-router'
import React from 'react'
import { WebUiFooter, WebUiHeader } from '@nestled-template/web-ui'
import { getCookie, getSessionCookieName } from '@nestled-template/shared/utils'
import { useGlobalCtx } from '@nestled-template/web'

export async function loader({ request }: LoaderFunctionArgs) {
  const token = getCookie(request.headers, getSessionCookieName())
  if (token) {
    return { isAuthenticated: true }
  }
  return { isAuthenticated: false }
}

export default function PublicLayout() {
  const loaderData = useLoaderData<typeof loader>()
  const { user } = useGlobalCtx()
  const isAuthenticated = !!user || !!loaderData?.isAuthenticated
  const primaryEmail = user?.emails?.find(email => email.primary)?.email ?? user?.emails?.[0]?.email
  const userName =
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.displayName || primaryEmail
  return (
    <div className="flex flex-col min-h-screen">
      <WebUiHeader
        logo={'/logo.png'}
        icon={'/icon.png'}
        siteName={'Demo Site'}
        navigation={[
          { name: 'Features', href: '/features' },
          { name: 'Pricing', href: '/pricing' },
          { name: 'Blog', href: '/blog' },
          { name: 'Sign Up', href: '/register' },
        ]}
        isAuthenticated={isAuthenticated}
        userName={userName}
        userEmail={primaryEmail}
        userAvatarUrl={user?.avatar?.publicUrl ?? user?.avatar?.url ?? null}
        isSuperAdmin={user?.isSuperAdmin}
        canViewBilling={!!user?.isSuperAdmin}
      />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      <WebUiFooter />
    </div>
  )
}

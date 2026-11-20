import { Outlet, useRouteLoaderData } from 'react-router'
import React from 'react'
import { WebUiFooter, WebUiHeader } from '@nestled-template/web-ui'
import { useGlobalCtx } from '@nestled-template/web'
import type { RootLoaderData } from '../../root'

export default function PublicLayout() {
  const { user } = useGlobalCtx()
  // The header follows the server's verdict: signed in with the user, signed out without one, and,
  // while the verdict is `unknown` (a session cookie the API could not confirm), neutral: no
  // account menu and no "Log in" (owner decision D2). App recovers it quietly.
  const session = useRouteLoaderData<RootLoaderData>('root')?.session
  const sessionUnknown = session?.kind === 'unknown'
  const isAuthenticated = !!user
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
        sessionUnknown={sessionUnknown}
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

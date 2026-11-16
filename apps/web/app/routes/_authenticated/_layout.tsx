import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router'
import {
  GlobalContextProvider,
  useGlobalCtx,
  SubscriptionProvider,
  SubscriptionStatusBanner,
  EmulationBanner,
} from '@nestled-template/web'
import { WebUiFooter, WebUiHeader } from '@nestled-template/web-ui'
import {
  apolloLoader,
  rememberActiveOrganization,
  resolveActiveOrganization,
} from '@nestled-template/shared/apollo'
import {
  MyOrganizationsWithMembers,
  type MyOrganizationsWithMembersQuery,
} from '@nestled-template/shared/sdk'
import { useReadQuery, type QueryRef } from '@apollo/client/react'
import { browserIsOffline } from '../../api-availability'
import { ApiUnavailableScreen } from '../../api-unavailable'
import { useSessionRecheck } from '../../session-recheck'
import { useRootLoaderOutage } from '../../loader-outage'
import { OrganizationRequired } from '../../organization-required'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const myOrganizationsQueryRef = preloadQuery<MyOrganizationsWithMembersQuery>(
    MyOrganizationsWithMembers,
    {
      fetchPolicy: 'network-only', // Always fetch fresh data, bypass cache
    },
  )
  return { myOrganizationsQueryRef }
})

export default function AuthenticatedLayout() {
  const { user: contextUser } = useGlobalCtx()
  const location = useLocation()
  const loaderData = useLoaderData() as {
    myOrganizationsQueryRef: QueryRef<MyOrganizationsWithMembersQuery>
  }

  // Read organizations from preloaded query
  const { data: orgsData } = useReadQuery(loaderData.myOrganizationsQueryRef)

  // No user is not proof of a dead session (a Me preload on a public route may have failed for
  // another reason, and the root loader does not run again on a client-side navigation here), so
  // Me is asked again. Only a real 401 with no outage goes through force-logout, which clears the
  // session cookie (and appends `expired=1`, so /login renders the form instead of looping). The
  // root loader's outage flag counts as outage evidence: a 401 while it stands is retried.
  const recheck = useSessionRecheck(!contextUser, useRootLoaderOutage())
  const user = contextUser ?? (recheck.status === 'signed-in' ? recheck.user : null)

  // The re-checked user is a snapshot (the re-check skips the cache), so once it recovers, run the
  // root loader again for a Me query of its own: the user then comes from the cache like any other
  // query and follows later changes (a profile edit, an organization switch). Once per recovery;
  // if the loader still brings no Me, the snapshot stays.
  const revalidator = useRevalidator()
  const recoveredUserRef = useRef<unknown>(null)
  const recheckedUser = !contextUser && recheck.status === 'signed-in' ? recheck.user : null
  useEffect(() => {
    if (!recheckedUser || recoveredUserRef.current === recheckedUser) return
    recoveredUserRef.current = recheckedUser
    void revalidator.revalidate()
  }, [recheckedUser, revalidator])

  if (!user) {
    if (recheck.status === 'rejected') {
      const returnUrl = `${location.pathname}${location.search}`
      return <Navigate to={`/force-logout?return_url=${encodeURIComponent(returnUrl)}`} replace />
    }
    if (recheck.status === 'organization-required') return <OrganizationRequired />
    if (recheck.status === 'retrying') {
      return (
        <ApiUnavailableScreen
          reason={browserIsOffline() ? 'offline' : 'server'}
          onRetry={recheck.retryNow}
        />
      )
    }
    return null
  }

  const organizations = orgsData?.myOrganizations || []
  // The server's active organization (from Me, the re-checked one included), else the stored one,
  // and stored before the pages below send a request: the organization on screen is the one every
  // request is sent for (`x-organization-id`).
  const activeOrganization = resolveActiveOrganization(organizations, user.activeOrganizationId)
  rememberActiveOrganization(activeOrganization?.id)
  const activeOrganizationMember =
    activeOrganization?.members?.find(member => member.userId === user?.id) || null

  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  const primaryEmail = user.emails?.find(email => email.primary)?.email ?? user.emails?.[0]?.email
  const userName =
    `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName || primaryEmail
  const userAvatarUrl = user.avatar?.publicUrl ?? user.avatar?.url ?? null
  const activeOrganizationRoleName = activeOrganizationMember?.role?.name
  const canViewBilling =
    user.isSuperAdmin ||
    activeOrganizationRoleName === 'Owner' ||
    activeOrganizationRoleName === 'Admin' ||
    !!activeOrganizationMember?.role?.permissions?.some(
      permission => permission.subject === 'billing' && permission.action === 'read',
    )

  return (
    <GlobalContextProvider
      user={user}
      organizations={organizations}
      activeOrganization={activeOrganization}
      activeOrganizationMember={activeOrganizationMember}
    >
      <SubscriptionProvider>
        {isAdminRoute ? (
          <div className="flex min-h-screen flex-col bg-zinc-950">
            <EmulationBanner />
            <main className="flex-1">
              <Outlet />
            </main>
          </div>
        ) : (
          <div className="flex flex-col min-h-screen">
            <EmulationBanner />
            <WebUiHeader
              logo={'/logo.png'}
              icon={'/icon.png'}
              siteName={activeOrganization?.name || 'Demo Site'}
              navigation={[]}
              isAuthenticated={true}
              userName={userName}
              userEmail={primaryEmail}
              userAvatarUrl={userAvatarUrl}
              isSuperAdmin={user.isSuperAdmin}
              canViewBilling={canViewBilling}
            />
            <SubscriptionStatusBanner />
            <main className="flex-1 flex flex-col">
              <Outlet />
            </main>
            <WebUiFooter />
          </div>
        )}
      </SubscriptionProvider>
    </GlobalContextProvider>
  )
}

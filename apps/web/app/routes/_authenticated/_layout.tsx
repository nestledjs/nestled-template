import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router'
import {
  GlobalContextProvider,
  useActiveOrganization,
  useGlobalCtx,
  SubscriptionProvider,
  SubscriptionStatusBanner,
  EmulationBanner,
} from '@nestled-template/web'
import { WebUiFooter, WebUiHeader } from '@nestled-template/web-ui'
import { apolloLoader } from '@nestled-template/shared/apollo'
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

  // The organization shown, and every request's `x-organization-id`: the server's active one (from
  // Me, the re-checked one included), else the first, identical in the server render and the
  // hydrating one. A choice this browser stored is restored after hydration, through the shared
  // switch, and the loaders run again for it; organization-scoped content waits meanwhile.
  const organizations = orgsData?.myOrganizations || []
  const { activeOrganization, reconciling } = useActiveOrganization(
    organizations,
    user?.activeOrganizationId,
    { enabled: !!user, sessionKey: user?.id, afterSwitch: () => revalidator.revalidate() },
  )

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

  const activeOrganizationMember =
    activeOrganization?.members?.find(member => member.userId === user?.id) || null

  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  // Held back while the active organization is being reconciled: the page and the subscription
  // queries are organization-scoped, and would be sent for an organization about to change.
  const shell = (
    <SignedInShell
      user={user}
      activeOrganizationName={activeOrganization?.name}
      activeOrganizationMember={activeOrganizationMember}
      isAdminRoute={isAdminRoute}
      reconciling={reconciling}
    />
  )

  return (
    <GlobalContextProvider
      user={user}
      organizations={organizations}
      activeOrganization={activeOrganization}
      activeOrganizationMember={activeOrganizationMember}
    >
      {reconciling ? shell : <SubscriptionProvider>{shell}</SubscriptionProvider>}
    </GlobalContextProvider>
  )
}

type ShellUser = NonNullable<ReturnType<typeof useGlobalCtx>['user']>
type ShellMember = NonNullable<
  MyOrganizationsWithMembersQuery['myOrganizations'][number]['members']
>[number]

function canViewBilling(user: ShellUser, member: ShellMember | null): boolean {
  const roleName = member?.role?.name
  return (
    !!user.isSuperAdmin ||
    roleName === 'Owner' ||
    roleName === 'Admin' ||
    !!member?.role?.permissions?.some(
      permission => permission.subject === 'billing' && permission.action === 'read',
    )
  )
}

/** The signed-in chrome around the page; the page is held back while `reconciling`. */
function SignedInShell({
  user,
  activeOrganizationName,
  activeOrganizationMember,
  isAdminRoute,
  reconciling,
}: Readonly<{
  user: ShellUser
  activeOrganizationName: string | undefined
  activeOrganizationMember: ShellMember | null
  isAdminRoute: boolean
  reconciling: boolean
}>) {
  const content = reconciling ? <ActiveOrganizationPending /> : <Outlet />
  if (isAdminRoute) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-950">
        <EmulationBanner />
        <main className="flex-1">{content}</main>
      </div>
    )
  }
  const primaryEmail = user.emails?.find(email => email.primary)?.email ?? user.emails?.[0]?.email
  const userName =
    `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName || primaryEmail
  return (
    <div className="flex flex-col min-h-screen">
      <EmulationBanner />
      <WebUiHeader
        logo={'/logo.png'}
        icon={'/icon.png'}
        siteName={activeOrganizationName || 'Demo Site'}
        navigation={[]}
        isAuthenticated={true}
        userName={userName}
        userEmail={primaryEmail}
        userAvatarUrl={user.avatar?.publicUrl ?? user.avatar?.url ?? null}
        isSuperAdmin={user.isSuperAdmin}
        canViewBilling={canViewBilling(user, activeOrganizationMember)}
      />
      {reconciling ? null : <SubscriptionStatusBanner />}
      <main className="flex-1 flex flex-col">{content}</main>
      <WebUiFooter />
    </div>
  )
}

/** Shown in place of the page while the active organization is being reconciled. */
function ActiveOrganizationPending() {
  return (
    <div className="flex flex-1 items-center justify-center p-8" aria-busy="true">
      <span className="sr-only">Loading your organization…</span>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Outlet, useLoaderData, useLocation, useRevalidator } from 'react-router'
import {
  GlobalContextProvider,
  useActiveOrganization,
  useGlobalCtx,
  withRestoredOrganization,
  type RestoredOrganization,
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
import { requireSession } from '../../session/session-middleware.server'

/**
 * Every page below this layout needs a user. `requireSession` acts on the session verdict before
 * any loader here runs: a signed-out or unknown request never reaches this loader or its
 * children's, and the user is always present when they do.
 */
export const middleware = [requireSession]

// Runs only for a signed-in request (`requireSession`). A failure reading the organizations is
// never an empty list: an outage reaches the root ErrorBoundary as the recovering screen, any other
// error as the error screen with a retry; `[]` means only that the API answered with none.
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

  const sessionUser = contextUser ?? null
  const revalidator = useRevalidator()

  // The organization shown, and every request's `x-organization-id`: the server's active one (from
  // Me), else the first, identical in the server render and the hydrating one. A choice this browser stored is restored after hydration, through the shared
  // switch, and the loaders run again for it; organization-scoped content waits meanwhile.
  const organizations = orgsData?.myOrganizations || []
  // A restored organization must reach the user the pages get too, so `user.activeOrganizationId`
  // and `activeOrganization.id` agree. The cached Me follows the switch's cache write by itself; the
  // verdict's user (rendered until the cache has it) does not, so the restore is applied here, for the user it was restored for, and only while that user's own active
  // organization is unknown or not theirs: one the server knows always wins.
  const [restored, setRestored] = useState<RestoredOrganization | null>(null)
  // Memoized: a new object on every render would re-render every consumer of the shell's context.
  const user = useMemo(
    () => withRestoredOrganization(sessionUser, organizations, restored),
    [sessionUser, organizations, restored],
  )
  const { activeOrganization, reconciling } = useActiveOrganization(
    organizations,
    user?.activeOrganizationId,
    {
      enabled: !!user,
      sessionKey: user?.id,
      afterSwitch: () => revalidator.revalidate(),
      onRestored: (organizationId, userId) => setRestored({ userId, organizationId }),
    },
  )

  // `requireSession` guarantees a signed-in verdict, and App renders its user; nothing to show
  // without one.
  if (!user) return null

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

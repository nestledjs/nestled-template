import { useState, type ReactNode } from 'react'
import { CombinedGraphQLErrors } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { ORGANIZATION_CONTEXT_REQUIRED_CODE } from '@nestled-template/shared/apollo'
import {
  MyOrganizations,
  SwitchActiveOrganization,
  type MyOrganizationsQuery,
  type SwitchActiveOrganizationMutation,
  type SwitchActiveOrganizationMutationVariables,
} from '@nestled-template/shared/sdk'
import { isRouteErrorResponse, Link } from 'react-router'

type ErrorWithGraphQLErrors = {
  graphQLErrors?: Array<{ extensions?: { code?: unknown } }>
}

export const ORGANIZATION_PICKER_TITLE = 'Choose an organization'
export const NO_ORGANIZATIONS_TITLE = 'You are not a member of any organization'
export const SWITCH_FAILED_MESSAGE =
  'We couldn’t switch to that organization. Please try again, or choose another one.'
export const ORGANIZATIONS_UNAVAILABLE_MESSAGE = 'We couldn’t load your organizations.'

/**
 * The server render's answer when a loader's query was refused with `ORGANIZATION_CONTEXT_REQUIRED`
 * (entry.server.tsx). In production React Router replaces a loader's error with a bare
 * "Unexpected Server Error" before the render, so the code would be lost and the root
 * ErrorBoundary would show the generic error page. `handleRequest` rejects with this instead, and
 * React Router renders the ErrorBoundary for it as a route error response: a 403 whose data is the
 * code alone, never the API's message.
 */
export function organizationRequiredResponse(): Response {
  return Response.json(
    { code: ORGANIZATION_CONTEXT_REQUIRED_CODE },
    { status: 403, statusText: 'Forbidden' },
  )
}

/**
 * Whether the API refused the request because it has no active organization (a 403
 * `ORGANIZATION_CONTEXT_REQUIRED`): the user is signed in, so this is never a logout. Recognises the
 * Apollo error, and the route error response the server render turns it into
 * (`organizationRequiredResponse`).
 */
export function isOrganizationContextRequired(error: unknown): boolean {
  if (isRouteErrorResponse(error)) {
    const data = error.data as { code?: unknown } | null | undefined
    return error.status === 403 && data?.code === ORGANIZATION_CONTEXT_REQUIRED_CODE
  }
  const errors = CombinedGraphQLErrors.is(error)
    ? error.errors
    : (error as ErrorWithGraphQLErrors | null)?.graphQLErrors
  return !!errors?.some?.(e => e?.extensions?.code === ORGANIZATION_CONTEXT_REQUIRED_CODE)
}

/**
 * Makes `organizationId` the active organization for this browser and reloads, so every query runs
 * again under it. The Apollo client sends the stored id as `X-Organization-ID`, which the API reads
 * before the user's active organization, so a stale stored id would keep the old refusal.
 */
function activateAndReload(organizationId: string): void {
  try {
    localStorage.setItem('activeOrganizationId', organizationId)
  } catch {
    // Storage blocked: the user's active organization, just switched on the API, still applies.
  }
  globalThis.location.reload()
}

function Panel({
  eyebrow,
  title,
  children,
}: Readonly<{ eyebrow: string; title: string; children: ReactNode }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-bold">{title}</h1>
        {children}
      </section>
    </main>
  )
}

const buttonClass =
  'inline-flex justify-center rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60'

/**
 * Shown when a page needs an organization and the account has none active, or is no longer a member
 * of the one it had. The session is kept throughout. It lists the user's organizations; choosing one
 * makes it active (`switchActiveOrganization`) and reloads. With none, it says so and offers a
 * normal sign-out.
 */
export function OrganizationRequired() {
  const organizations = useQuery<MyOrganizationsQuery>(MyOrganizations, {
    fetchPolicy: 'network-only',
  })
  const [switchOrganization] = useMutation<
    SwitchActiveOrganizationMutation,
    SwitchActiveOrganizationMutationVariables
  >(SwitchActiveOrganization, {
    // The app client's default is `errorPolicy: 'all'`, under which the API refusing the switch (a
    // GraphQL error) resolves instead of throwing. This must throw, so the catch below shows the
    // failure and the refused id is never stored or reloaded into.
    errorPolicy: 'none',
  })
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [switchFailed, setSwitchFailed] = useState(false)

  const choose = async (organizationId: string) => {
    setSwitchFailed(false)
    setSwitchingTo(organizationId)
    try {
      await switchOrganization({ variables: { input: { organizationId } } })
    } catch {
      setSwitchingTo(null)
      setSwitchFailed(true)
      return
    }
    activateAndReload(organizationId)
  }

  if (organizations.loading && !organizations.data) {
    return (
      <Panel eyebrow="No organization selected" title={ORGANIZATION_PICKER_TITLE}>
        <p className="mt-4 text-zinc-600 dark:text-zinc-300">Loading your organizations…</p>
      </Panel>
    )
  }

  if (organizations.error && !organizations.data) {
    return (
      <Panel eyebrow="No organization selected" title={ORGANIZATION_PICKER_TITLE}>
        <p role="alert" className="mt-4 text-zinc-600 dark:text-zinc-300">
          {ORGANIZATIONS_UNAVAILABLE_MESSAGE} You are still signed in.
        </p>
        <button
          type="button"
          className={`mt-6 ${buttonClass}`}
          onClick={() => void organizations.refetch()}
        >
          Try again
        </button>
      </Panel>
    )
  }

  const list = organizations.data?.myOrganizations ?? []

  if (list.length === 0) {
    return (
      <Panel eyebrow="No organization" title={NO_ORGANIZATIONS_TITLE}>
        <p className="mt-4 text-zinc-600 dark:text-zinc-300">
          This page needs an organization, and your account does not belong to one. Ask an
          organization owner to invite you, or sign out.
        </p>
        <Link to="/logout" className={`mt-6 ${buttonClass}`}>
          Sign out
        </Link>
      </Panel>
    )
  }

  return (
    <Panel eyebrow="No organization selected" title={ORGANIZATION_PICKER_TITLE}>
      <p className="mt-4 text-zinc-600 dark:text-zinc-300">
        You are still signed in, but this page needs an active organization. Choose one to continue.
      </p>
      {switchFailed && (
        <p role="alert" className="mt-4 font-medium text-red-600 dark:text-red-400">
          {SWITCH_FAILED_MESSAGE}
        </p>
      )}
      <ul className="mt-6 flex flex-col gap-3">
        {list.map(organization => (
          <li key={organization.id}>
            <button
              type="button"
              className={`w-full ${buttonClass}`}
              disabled={switchingTo !== null}
              onClick={() => void choose(organization.id)}
            >
              {switchingTo === organization.id
                ? `Switching to ${organization.name}…`
                : organization.name}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

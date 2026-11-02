import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
} from 'react-router'
import type { ReactNode } from 'react'
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { getCookie, getSessionCookieName } from '@nestled-template/shared/utils'
import { toApiBase } from './settings/_mcp-shared'

/**
 * MCP OAuth consent page. The API's /api/mcp/authorize never issues a code by itself: it stores
 * the request as a pending authorization bound to the caller's session and sends them here. This
 * page shows which client is asking, where the code would go and what would be granted, and
 * nothing is issued until the user presses Approve. The form posts to this route's action, which
 * forwards the decision to the API with the pending record's CSRF token.
 */

export interface McpConsentDetails {
  request: string
  csrfToken: string
  expiresAt: string
  client: { name: string; verified: boolean }
  redirectUri: string
  redirectHost: string
  account: { name: string | null; email: string | null }
  organizations: Array<{ id: string; name: string }>
  selectedOrganizationId: string | null
}

type LoaderData =
  { status: 'ready'; consent: McpConsentDetails } | { status: 'error'; message: string }

type ActionData = { error: string }

const EXPIRED_MESSAGE =
  'This connection request has expired or was already used. Return to your AI assistant and start the connection again.'

// Loaders and actions run on the server, where the API is reached directly.
function serverApiBase(): string {
  return toApiBase(process.env['VITE_API_URL'] || (import.meta.env.VITE_API_URL as string))
}

function loginRedirect(url: URL) {
  // Same-origin relative path, consistent with every other return_url producer.
  return redirect(`/login?return_url=${encodeURIComponent(url.pathname + url.search)}`)
}

function sessionCookieHeader(request: Request): string | null {
  const token = getCookie(request.headers, getSessionCookieName())
  return token ? `${getSessionCookieName()}=${token}` : null
}

async function readError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error_description?: unknown }
    return typeof body.error_description === 'string' ? body.error_description : null
  } catch {
    return null
  }
}

export function headers() {
  return {
    // The consent page must never be framed (clickjacking) or cached, and must not leak its URL.
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Cache-Control': 'no-store',
    // same-origin, not no-referrer: the URL (with its request id) still never goes to another
    // site, but under no-referrer Chrome sends `Origin: null` on this page's own form POST, and
    // React Router's action CSRF check rejects that as a foreign origin (400 "Bad Request" on
    // Approve, so the connector never gets its code).
    'Referrer-Policy': 'same-origin',
  }
}

export async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  const url = new URL(request.url)
  const requestId = url.searchParams.get('request')
  if (!requestId) throw redirect('/')

  const cookie = sessionCookieHeader(request)
  if (!cookie) throw loginRedirect(url)

  const response = await fetch(
    `${serverApiBase()}/api/mcp/authorize/pending?request=${encodeURIComponent(requestId)}`,
    { headers: { cookie, accept: 'application/json' } },
  )
  if (response.status === 401) throw loginRedirect(url)
  if (!response.ok) {
    const message = response.status === 404 ? EXPIRED_MESSAGE : await readError(response)
    return { status: 'error', message: message ?? EXPIRED_MESSAGE }
  }
  return { status: 'ready', consent: (await response.json()) as McpConsentDetails }
}

export async function action({ request }: ActionFunctionArgs): Promise<ActionData | Response> {
  const cookie = sessionCookieHeader(request)
  if (!cookie) return loginRedirect(new URL(request.url))

  const form = await request.formData()
  const field = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : undefined
  }

  const response = await fetch(`${serverApiBase()}/api/mcp/authorize/decision`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      request: field('request'),
      csrf_token: field('csrf_token'),
      decision: field('decision'),
      organization_id: field('organization_id'),
    }),
  })

  if (response.ok) {
    const body = (await response.json()) as { redirect_to?: unknown }
    if (typeof body.redirect_to === 'string') return redirect(body.redirect_to)
  }
  return { error: (await readError(response)) ?? EXPIRED_MESSAGE }
}

function Card({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="min-h-dvh bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-xl">
        <div className="p-8">{children}</div>
      </div>
    </main>
  )
}

function ErrorState({ message }: Readonly<{ message: string }>) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="h-6 w-6 flex-shrink-0 text-amber-400"
        />
        <div>
          <h1 className="text-base font-semibold text-white">Can't connect AI assistant</h1>
          <p className="mt-1 text-sm text-zinc-400">{message}</p>
        </div>
      </div>
    </Card>
  )
}

function OrganizationChoice({ consent }: Readonly<{ consent: McpConsentDetails }>) {
  const { organizations, selectedOrganizationId } = consent

  if (organizations.length === 0) {
    return (
      <p className="text-sm text-zinc-300">
        Your account only. You don't belong to an organization.
      </p>
    )
  }

  if (organizations.length === 1) {
    const [org] = organizations
    return (
      <>
        <input type="hidden" name="organization_id" value={org.id} />
        <p className="text-sm font-medium text-white">{org.name}</p>
      </>
    )
  }

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Organization</legend>
      {organizations.map(org => (
        <label
          key={org.id}
          className="flex w-full cursor-pointer items-center gap-4 rounded-lg px-4 py-3 ring-1 ring-white/10 transition hover:ring-white/20 hover:bg-white/5 has-[:checked]:ring-emerald-500"
        >
          <input
            type="radio"
            name="organization_id"
            value={org.id}
            required
            defaultChecked={org.id === selectedOrganizationId}
            className="h-4 w-4 accent-emerald-500"
          />
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold text-zinc-300">
            {org.name.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 text-sm font-medium text-white truncate">{org.name}</span>
        </label>
      ))}
    </fieldset>
  )
}

export default function McpConnectPage() {
  const data = useLoaderData<typeof loader>()
  const actionData = useActionData<ActionData>()

  // A failed decision has already used the request up, so its reason comes before the loader's.
  if (actionData?.error) return <ErrorState message={actionData.error} />
  if (data.status === 'error') return <ErrorState message={data.message} />

  const { consent } = data
  const accountLabel = consent.account.email ?? consent.account.name ?? 'your account'

  return (
    <Card>
      <div className="flex items-center gap-3">
        <ShieldCheckIcon aria-hidden="true" className="h-6 w-6 flex-shrink-0 text-emerald-400" />
        <h1 className="text-base font-semibold text-white">Connect AI Assistant</h1>
      </div>

      <p className="mt-4 text-sm text-zinc-300">
        <span className="font-semibold text-white">{consent.client.name}</span> wants access to your
        account.
      </p>
      {!consent.client.verified && (
        <p className="mt-1 text-xs text-amber-400">
          Unverified: this name was supplied by the application itself and has not been checked.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-300">
          Access will be sent to
        </p>
        <p className="mt-1 break-all text-lg font-semibold text-white">{consent.redirectHost}</p>
        <p className="mt-1 break-all text-xs text-zinc-400">{consent.redirectUri}</p>
        <p className="mt-2 text-xs text-zinc-400">
          Only approve if you started this connection and recognise this address.
        </p>
      </div>

      <form method="post" className="mt-6 space-y-6">
        <input type="hidden" name="request" value={consent.request} />
        <input type="hidden" name="csrf_token" value={consent.csrfToken} />

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Signed in as</p>
          <p className="mt-1 text-sm font-medium text-white">{accountLabel}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Organization it can access
          </p>
          <OrganizationChoice consent={consent} />
        </div>

        <p className="text-xs text-zinc-500">
          Approving creates an API token that can act as you in this organization. You can revoke it
          at any time in your settings.
        </p>

        <div className="flex gap-3">
          <button
            type="submit"
            name="decision"
            value="deny"
            formNoValidate
            className="flex-1 rounded-md px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/5 focus:outline-2 focus:outline-offset-2 focus:outline-zinc-400"
          >
            Deny
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-500"
          >
            Approve
          </button>
        </div>
      </form>
    </Card>
  )
}

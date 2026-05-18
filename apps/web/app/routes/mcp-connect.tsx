import { LoaderFunctionArgs, redirect, useLoaderData } from 'react-router'
import { useQuery } from '@apollo/client/react'
import { getCookie, getSessionCookieName } from '@nestled-template/shared/utils'
import { MyOrganizations, type MyOrganizationsQuery } from '@nestled-template/shared/sdk'

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const back = url.searchParams.get('back')

  if (!back) throw redirect('/')

  const token = getCookie(request.headers, getSessionCookieName())
  if (!token) throw redirect(`/login?redirect=${encodeURIComponent(request.url)}`)

  return { back }
}

export default function McpConnectPage() {
  const { back } = useLoaderData<typeof loader>()
  const { data, loading } = useQuery<MyOrganizationsQuery>(MyOrganizations)

  const organizations = data?.myOrganizations ?? []

  function selectOrg(orgId: string) {
    const separator = back.includes('?') ? '&' : '?'
    globalThis.location.href = `${back}${separator}org=${encodeURIComponent(orgId)}`
  }

  return (
    <main className="min-h-dvh bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-xl">
        <div className="p-8">
          <h1 className="text-base font-semibold text-white">Connect AI Assistant</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Choose which organization to give your AI assistant access to.
          </p>

          <div className="mt-6 space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
                Loading organizations…
              </div>
            )}

            {!loading && organizations.length === 0 && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-sm text-zinc-400 text-center">
                No organizations found. Create one first.
              </div>
            )}

            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => selectOrg(org.id)}
                className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left ring-1 ring-white/10 transition hover:ring-white/20 hover:bg-white/5 focus:outline-2 focus:-outline-offset-1 focus:outline-emerald-500"
              >
                {org.logo?.publicUrl ? (
                  <img
                    src={org.logo.publicUrl}
                    alt={org.name}
                    className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold text-zinc-300">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <p className="flex-1 text-sm font-medium text-white truncate">{org.name}</p>
                <svg
                  className="h-4 w-4 flex-shrink-0 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

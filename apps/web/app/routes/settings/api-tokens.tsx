import { useState } from 'react'
import { useLoaderData } from 'react-router'
import { ClipboardIcon, KeyIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  GenerateApiToken,
  ListApiTokens,
  RevokeApiToken,
  type GenerateApiTokenMutation,
  type ListApiTokensQuery,
  type RevokeApiTokenMutation,
} from '@nestled-template/shared/sdk'
import { useMutation, useReadQuery, type QueryRef } from '@apollo/client/react'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const tokensQueryRef = preloadQuery<ListApiTokensQuery>(ListApiTokens)
  return { tokensQueryRef }
})

type ApiTokenListItem = ListApiTokensQuery['listApiTokens'][number]

function formatDate(value?: string | null): string | null {
  if (!value) return null

  return new Date(value).toLocaleDateString()
}

function TokenMeta({ token }: Readonly<{ token: ApiTokenListItem }>) {
  const createdAt = formatDate(token.createdAt)
  const lastUsedAt = formatDate(token.lastUsedAt)
  const expiresAt = formatDate(token.expiresAt)

  return (
    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
      {createdAt ? `Created ${createdAt}` : 'Created date unavailable'}
      {lastUsedAt && <span className="ml-3">Last used {lastUsedAt}</span>}
      {expiresAt && <span className="ml-3">Expires {expiresAt}</span>}
    </p>
  )
}

export default function ApiTokensSettings() {
  const loaderData = useLoaderData() as {
    tokensQueryRef: QueryRef<ListApiTokensQuery>
  }
  const { data } = useReadQuery(loaderData.tokensQueryRef)
  const tokens = data?.listApiTokens || []

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [generateApiToken, { loading: generating }] =
    useMutation<GenerateApiTokenMutation>(GenerateApiToken)
  const [revokeApiToken] = useMutation<RevokeApiTokenMutation>(RevokeApiToken)

  const personalTokens = tokens.filter(token => !token.organizationId)
  const activeTokens = personalTokens.filter(token => !token.revoked)
  const revokedTokens = personalTokens.filter(token => token.revoked)

  async function handleCreateToken() {
    const name = tokenName.trim()
    if (!name) {
      setError('Token name is required')
      return
    }

    try {
      const result = await generateApiToken({
        variables: { input: { name } },
        refetchQueries: [{ query: ListApiTokens }],
      })

      if (result.data?.generateApiToken.token) {
        setNewToken(result.data.generateApiToken.token)
        setTokenName('')
        setError(null)
      }
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to create token')
    }
  }

  async function handleRevokeToken(tokenId: string, name: string) {
    if (
      !globalThis.confirm(
        `Revoke "${name}"? Any clients using this token will immediately lose access.`,
      )
    ) {
      return
    }

    try {
      await revokeApiToken({
        variables: { tokenId },
        refetchQueries: [{ query: ListApiTokens }],
      })
    } catch (err) {
      alert((err as Error)?.message ?? 'Failed to revoke token')
    }
  }

  async function handleCopyToken() {
    if (!newToken) return

    await navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function closeModal() {
    setShowCreateModal(false)
    setNewToken(null)
    setError(null)
    setCopied(false)
  }

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base/7 font-semibold text-zinc-950 dark:text-white">API Tokens</h2>
          <p className="mt-1 max-w-2xl text-sm/6 text-zinc-600 dark:text-zinc-400">
            Personal tokens authenticate as your user account. Organization-scoped MCP tokens live
            under AI &amp; MCP settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <PlusIcon className="h-4 w-4" />
          Create Token
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-white">
            Active Personal Tokens
          </h3>
          {activeTokens.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-center dark:border-white/10 dark:bg-white/5">
              <KeyIcon className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No active personal API tokens.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTokens.map(token => (
                <div
                  key={token.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                      {token.name}
                    </p>
                    <TokenMeta token={token} />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeToken(token.id, token.name)}
                    className="rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    title="Revoke token"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {revokedTokens.length > 0 && (
          <details className="border-t border-zinc-950/5 pt-4 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
              Revoked Personal Tokens ({revokedTokens.length})
            </summary>
            <div className="mt-3 space-y-2">
              {revokedTokens.map(token => (
                <div
                  key={token.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200/70 bg-zinc-100/60 p-4 opacity-70 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-700 line-through dark:text-zinc-300">
                      {token.name}
                    </p>
                    <TokenMeta token={token} />
                  </div>
                  <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    Revoked
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {showCreateModal && !newToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Create API Token
            </h3>
            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}
            <label
              htmlFor="api-token-name"
              className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Token Name
            </label>
            <input
              id="api-token-name"
              type="text"
              value={tokenName}
              onChange={event => setTokenName(event.target.value)}
              placeholder="MacBook Pro CLI"
              autoFocus
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-800 dark:text-white"
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleCreateToken}
                disabled={generating}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-emerald-300"
              >
                {generating ? 'Creating...' : 'Create Token'}
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-white dark:hover:bg-zinc-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {newToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/10">
                <CheckIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Token Created</h3>
            </div>
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              Copy this token now. It will not be shown again.
            </p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-zinc-100 p-3 font-mono text-sm text-zinc-900 dark:bg-zinc-800 dark:text-white">
                {newToken}
              </code>
              <button
                type="button"
                onClick={handleCopyToken}
                className="rounded-lg bg-zinc-200 p-3 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                title="Copy token"
              >
                {copied ? (
                  <CheckIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ClipboardIcon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="mt-4 w-full rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-white dark:hover:bg-zinc-600"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

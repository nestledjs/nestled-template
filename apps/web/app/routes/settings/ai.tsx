import { useCallback, useState } from 'react'
import { useLoaderData } from 'react-router'
import { KeyIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  GenerateApiToken,
  ListApiTokens,
  RevokeApiToken,
  type GenerateApiTokenMutation,
  type GenerateApiTokenMutationVariables,
  type ListApiTokensQuery,
  type RevokeApiTokenMutation,
  type RevokeApiTokenMutationVariables,
} from '@nestled-template/shared/sdk'
import { useGlobalCtx } from '@nestled-template/web'
import { useMutation, useReadQuery, type QueryRef } from '@apollo/client/react'
import { CreateTokenModal, McpSetupCards, NewTokenDisplay, TokenMeta } from './_mcp-shared'

const AVAILABLE_TOOLS = [
  { name: 'get_profile', description: 'Read the authenticated user profile' },
  { name: 'get_organization', description: 'Read the scoped organization profile and members' },
] as const

export const loader = apolloLoader()(({ preloadQuery }) => {
  const tokensQueryRef = preloadQuery<ListApiTokensQuery>(ListApiTokens)
  return { tokensQueryRef }
})

export default function AiSettingsPage() {
  const loaderData = useLoaderData() as {
    tokensQueryRef: QueryRef<ListApiTokensQuery>
  }
  const { user, activeOrganization, activeOrganizationMember } = useGlobalCtx()
  const { data } = useReadQuery(loaderData.tokensQueryRef)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newToken, setNewToken] = useState<{ token: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [generateApiToken, { loading: generating }] = useMutation<
    GenerateApiTokenMutation,
    GenerateApiTokenMutationVariables
  >(GenerateApiToken)
  const [revokeApiToken] = useMutation<RevokeApiTokenMutation, RevokeApiTokenMutationVariables>(
    RevokeApiToken,
  )

  const canManageAi =
    user?.isSuperAdmin ||
    !!activeOrganizationMember?.role?.permissions?.some(
      p => p.subject === 'organization' && p.action === 'update',
    )

  const tokens = data?.listApiTokens || []
  const orgTokens = tokens.filter(token => token.organizationId === activeOrganization?.id)
  const activeTokens = orgTokens.filter(token => !token.revoked)

  const handleGenerate = useCallback(
    async (name: string) => {
      if (!activeOrganization?.id) {
        setError('Select an organization before generating an MCP token')
        return
      }

      setError(null)
      try {
        const result = await generateApiToken({
          variables: { input: { name, organizationId: activeOrganization.id } },
          refetchQueries: [{ query: ListApiTokens }],
        })

        if (result.data?.generateApiToken.token) {
          setNewToken({ token: result.data.generateApiToken.token, name })
          setIsModalOpen(false)
        }
      } catch (err) {
        setError((err as Error)?.message ?? 'Failed to generate token')
      }
    },
    [activeOrganization?.id, generateApiToken],
  )

  const handleRevoke = useCallback(
    async (tokenId: string, name: string) => {
      if (
        !globalThis.confirm(
          `Revoke "${name}"? Any AI assistants using this token will immediately lose access.`,
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
    },
    [revokeApiToken],
  )

  if (!canManageAi) {
    return (
      <section>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You don't have permission to manage AI &amp; MCP settings. Contact an Owner or Admin.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base/7 font-semibold text-zinc-950 dark:text-white">AI &amp; MCP</h2>
          <p className="mt-1 max-w-2xl text-sm/6 text-zinc-600 dark:text-zinc-400">
            Generate organization-scoped tokens for AI assistants that connect over the Model
            Context Protocol.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setIsModalOpen(true)
          }}
          disabled={!activeOrganization}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
        >
          <PlusIcon className="h-4 w-4" />
          Generate Token
        </button>
      </div>

      {activeOrganization ? (
        <>
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/20">
            <h3 className="mb-1 text-sm font-semibold text-emerald-900 dark:text-emerald-300">
              Scoped to {activeOrganization.name}
            </h3>
            <p className="text-sm text-emerald-800 dark:text-emerald-400">
              Tokens generated here are bound to this organization and are shown only once.
            </p>
          </div>

          {newToken && (
            <NewTokenDisplay
              token={newToken.token}
              name={newToken.name}
              onDismiss={() => setNewToken(null)}
              tokenLabel="Your MCP Token"
              verb="Generated"
            />
          )}

          <div className="mb-6 rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-4 border-b border-zinc-200 p-4 dark:border-white/10">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                  MCP Tokens
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Active tokens for {activeOrganization.name}.
                </p>
              </div>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-white/10">
              {activeTokens.length === 0 ? (
                <div className="p-8 text-center">
                  <KeyIcon className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">No active MCP tokens.</p>
                </div>
              ) : (
                activeTokens.map(token => (
                  <div key={token.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                        {token.name}
                      </p>
                      <TokenMeta token={token} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(token.id, token.name)}
                      className="rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                      title="Revoke token"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <McpSetupCards tools={AVAILABLE_TOOLS} />
        </>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          Join or create an organization before generating organization-scoped MCP tokens.
        </div>
      )}

      <CreateTokenModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleGenerate}
        generating={generating}
        error={error}
        title="Generate MCP Token"
        description="This token gives AI assistants access to the selected organization as your user account."
        placeholder="Claude Desktop"
        submitLabel="Generate Token"
        loadingLabel="Generating..."
      />
    </section>
  )
}

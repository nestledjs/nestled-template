import { useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'

export const apiBase = (
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000'
)
  .replace(/\/graphql\/?$/, '')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '')

export const MCP_SERVER_URL = `${apiBase}/api/mcp`

export function buildClaudeConfig(token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        nestled: {
          type: 'http',
          url: MCP_SERVER_URL,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  )
}

export function formatDate(value?: string | null): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString()
}

interface TokenMetaData {
  createdAt?: string | null
  lastUsedAt?: string | null
  expiresAt?: string | null
}

export function TokenMeta({ token }: Readonly<{ token: TokenMetaData }>) {
  const createdAt = formatDate(token.createdAt)
  const lastUsedAt = formatDate(token.lastUsedAt)
  const expiresAt = formatDate(token.expiresAt)

  return (
    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
      {createdAt ? `Created ${createdAt}` : 'Created date unavailable'}
      {lastUsedAt && <span className="ml-3">Last used {lastUsedAt}</span>}
      {expiresAt && <span className="ml-3">Expires {expiresAt}</span>}
    </p>
  )
}

export function NewTokenDisplay({
  token,
  name,
  onDismiss,
  tokenLabel = 'Your Token',
  verb = 'Generated',
}: Readonly<{
  token: string
  name: string
  onDismiss: () => void
  tokenLabel?: string
  verb?: string
}>) {
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedConfig, setCopiedConfig] = useState(false)
  const config = buildClaudeConfig(token)

  async function copyToken() {
    await navigator.clipboard.writeText(token)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }

  async function copyConfig() {
    await navigator.clipboard.writeText(config)
    setCopiedConfig(true)
    setTimeout(() => setCopiedConfig(false), 2000)
  }

  return (
    <div className="mb-6 rounded-xl border border-emerald-400 bg-white p-6 dark:border-emerald-600 dark:bg-white/5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Token {verb}: {name}
          </h2>
          <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">
            Copy this token now. It will not be shown again.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          aria-label="Dismiss generated token"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{tokenLabel}</p>
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-zinc-200 bg-zinc-100 p-3 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
            {token}
          </code>
          <button
            type="button"
            onClick={copyToken}
            className="rounded-lg bg-zinc-200 p-3 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
            title="Copy token"
          >
            {copiedToken ? (
              <CheckIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ClipboardIcon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            )}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Claude Desktop Configuration
        </p>
        <div className="relative">
          <pre className="overflow-x-auto whitespace-pre rounded-lg bg-zinc-900 p-4 text-xs text-emerald-300">
            {config}
          </pre>
          <button
            type="button"
            onClick={copyConfig}
            className="absolute right-2 top-2 rounded-lg bg-zinc-700 p-2 text-white transition-colors hover:bg-zinc-600"
            title="Copy Claude Desktop configuration"
          >
            {copiedConfig ? (
              <CheckIcon className="h-4 w-4 text-emerald-300" />
            ) : (
              <ClipboardIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export function McpSetupCards({
  tools,
}: Readonly<{ tools: readonly { name: string; description: string }[] }>) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-white">
          Claude Desktop Template
        </h3>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-zinc-900 p-4 text-xs text-emerald-300">
          {JSON.stringify(
            {
              mcpServers: {
                nestled: {
                  type: 'http',
                  url: MCP_SERVER_URL,
                  headers: { Authorization: 'Bearer YOUR_TOKEN' },
                },
              },
            },
            null,
            2,
          )}
        </pre>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          MCP server URL:{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{MCP_SERVER_URL}</code>
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">
          Available Tools
        </h3>
        <div className="space-y-3">
          {tools.map(tool => (
            <div key={tool.name} className="flex gap-3">
              <code className="self-start whitespace-nowrap rounded bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                {tool.name}
              </code>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CreateTokenModal({
  isOpen,
  onClose,
  onSubmit,
  generating,
  error,
  title,
  description,
  placeholder,
  submitLabel,
  loadingLabel,
}: Readonly<{
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string) => void
  generating: boolean
  error: string | null
  title: string
  description: string
  placeholder: string
  submitLabel: string
  loadingLabel: string
}>) {
  const [name, setName] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setName('')
  }

  function handleClose() {
    setName('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
        <h3 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-white">{title}</h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}
          <label
            htmlFor="token-name"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Token Name
          </label>
          <input
            id="token-name"
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={placeholder}
            required
            autoFocus
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-800 dark:text-white"
          />
          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={generating || !name.trim()}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {generating ? loadingLabel : submitLabel}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={generating}
              className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-white dark:hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

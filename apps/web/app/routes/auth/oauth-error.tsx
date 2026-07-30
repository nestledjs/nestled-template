import React from 'react'
import { Link, useSearchParams } from 'react-router'
import { AuthLayout } from '@nestled-template/web'

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
}

// Codes the API callback emits itself, plus the standard OAuth 2.0 error codes a provider can
// hand back on the redirect. Anything unrecognised falls through to a generic message rather than
// being echoed to the page — the value is attacker-controllable, so it is never rendered raw.
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You cancelled the sign-in, or the permission request was declined.',
  authentication_failed:
    'We could not complete the sign-in. The link may have expired — please try again.',
  server_error: 'The provider reported a temporary problem. Please try again in a moment.',
  temporarily_unavailable: 'The provider is temporarily unavailable. Please try again in a moment.',
  invalid_request: 'The sign-in request was malformed. Please start again from the login page.',
  invalid_scope: 'The sign-in request asked for permissions that are not available.',
  unauthorized_client: 'This application is not authorised to sign you in with that provider.',
  unsupported_response_type: 'The provider does not support this sign-in method.',
}

const GENERIC_MESSAGE = 'Something went wrong while signing you in. Please try again.'

export function resolveProviderLabel(provider: string | null): string | null {
  if (!provider) return null
  return PROVIDER_LABELS[provider] ?? null
}

export function resolveErrorMessage(error: string | null): string {
  if (!error) return GENERIC_MESSAGE
  return ERROR_MESSAGES[error] ?? GENERIC_MESSAGE
}

/**
 * Landing route for the API's Google/GitHub callbacks when sign-in fails
 * (`/auth/oauth-error?provider=...&error=...`). Both params come from an untrusted redirect, so
 * they are mapped through known-value lookups and never interpolated into the page directly.
 */
export default function OAuthErrorPage() {
  const [params] = useSearchParams()
  const providerLabel = resolveProviderLabel(params.get('provider'))
  const message = resolveErrorMessage(params.get('error'))

  return (
    <AuthLayout
      title="Sign-in failed"
      subtitle={providerLabel ? `We could not sign you in with ${providerLabel}.` : undefined}
    >
      <div className="text-center">
        <div className="mb-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 p-4 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
          <p>{message}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
          >
            Back to sign in
          </Link>
          <Link
            to="/"
            className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            Return home
          </Link>
        </div>
      </div>
    </AuthLayout>
  )
}

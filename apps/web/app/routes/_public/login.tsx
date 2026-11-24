import React, { useEffect, useState } from 'react'
import {
  Link,
  LoaderFunctionArgs,
  redirect,
  useLoaderData,
  useLocation,
  useSearchParams,
} from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout } from '@nestled-template/web'
import { getJsonCookie } from '@nestled-template/shared/utils'
import { getSession } from '../../session'
import { DEFAULT_POST_LOGIN, safeReturnUrl } from '../../session/return-url'
import { LoginInput, Login, Complete2FaLogin } from '@nestled-template/shared/sdk'
import { formTheme } from '@nestled-template/shared/styles'
import { signInNotice } from '../../session/sign-in-notice'
import {
  clearActiveOrganizationForSessionChange,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import { useMutation } from '@apollo/client/react'

// A request the session middleware judged signed in goes straight on; any other verdict (signed
// out, or unknown during an outage) renders the form. The verdict is the API's own answer, so this
// cannot loop with a sign-out the way a cookie check could.
//
// Except after a sign-out: /force-logout appends `expired=1`, and then the form always renders,
// whatever the verdict. Clearing the session cookie can fail (a parent-domain cookie the web
// host cannot expire); if that cookie still authenticates, redirecting would skip the form and
// the stored-organization cleanup the page does for `expired=1`.
export function loader({ request, context }: LoaderFunctionArgs) {
  const afterSignOut = new URL(request.url).searchParams.has('expired')
  if (!afterSignOut && getSession(context).kind === 'signed-in') {
    throw redirect(DEFAULT_POST_LOGIN)
  }
  const isRemembered = getJsonCookie<{ email: string }>(request.headers, '_nestled_remember')
  return isRemembered ?? {}
}

export { safeReturnUrl }

export const ForgotPasswordWrapper = (children: React.ReactNode) => (
  <div key={'remember'} className="flex items-center justify-between">
    {children}
    <div className="text-sm">
      <Link to="/forgot-password" className="font-medium text-emerald-600 hover:text-emerald-500">
        Forgot your password?
      </Link>
    </div>
  </div>
)

export default function LoginPage() {
  const isRemembered = useLoaderData()
  const notice = signInNotice(useLocation().state)
  const [searchParams, setSearchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)

  // OAuth hand-off: a 2FA-enabled user who authenticated with Google/GitHub is redirected here
  // by the provider callback with a short-lived temp token instead of a session cookie, so the
  // second factor is collected before any session exists. Open straight into the 2FA step.
  const oauth2FAToken = searchParams.get('oauth_2fa')
  const [requires2FA, setRequires2FA] = useState(!!oauth2FAToken)
  const [tempToken, setTempToken] = useState<string | null>(oauth2FAToken)
  const [twoFACode, setTwoFACode] = useState('')

  // A form opened from a rejected session: /force-logout (a server redirect, which cannot reach
  // localStorage) and the server render's sign-out land here with `expired=1`, and the session they
  // ended left its organization stored for `x-organization-id`. Forget it, as /logout does. Any
  // other visit keeps it: only a sign-in (`signedIn()`) replaces the session.
  const openedFromRejectedSession = searchParams.has('expired')
  useEffect(() => {
    if (openedFromRejectedSession) storeActiveOrganizationId(null)
  }, [openedFromRejectedSession])

  // Once the token is held in component state, strip it from the address bar. It is a
  // credential — short-lived and still gated on the second factor, but it should not persist in
  // browser history, bookmarks, or a Referer header sent to a third party.
  useEffect(() => {
    if (!oauth2FAToken) return
    const next = new URLSearchParams(searchParams)
    next.delete('oauth_2fa')
    setSearchParams(next, { replace: true })
  }, [oauth2FAToken, searchParams, setSearchParams])

  // Accept `return_url` (standard) or the legacy/absolute `redirect` param; both go
  // through the same open-redirect guard.
  const redirectUrl = safeReturnUrl(searchParams.get('return_url') ?? searchParams.get('redirect'))

  // Throw on a GraphQL error so the catch below sees it (also the client default; kept explicit).
  const [loginMutation] = useMutation(Login, { errorPolicy: 'none' })
  const [complete2FALoginMutation] = useMutation(Complete2FaLogin, {
    errorPolicy: 'none',
  })

  // A new session starts here, in a new document: a client navigation would keep this document's
  // Apollo cache, and with it whatever it holds of whoever was signed in before (a shared browser, a
  // session that expired without a logout). The organization stored for `x-organization-id`
  // belonged to them too: the API refuses one the new user is not a member of, but the browser must
  // not send it, nor store it again before the new document loads.
  function signedIn() {
    clearActiveOrganizationForSessionChange()
    globalThis.location.assign(redirectUrl)
  }

  async function processLogin(input: LoginInput) {
    console.log('Login Clicked')
    setFormError(null)
    try {
      const { data } = await loginMutation({ variables: { input } })
      const loginInfo = data?.login

      // Check if 2FA is required
      if (loginInfo?.requires2FA && loginInfo?.tempToken) {
        setRequires2FA(true)
        setTempToken(loginInfo.tempToken)
        return
      }

      // Normal login without 2FA
      if (loginInfo?.user?.id) {
        // The backend already sets the __session cookie via the GraphQL mutation
        // We should not set our own cookies here, just load the page
        signedIn()
      } else {
        setFormError('Invalid login credentials')
      }
    } catch (error) {
      setFormError((error as Error)?.message || 'Something went wrong')
    }
  }

  async function handleComplete2FA(e: React.FormEvent) {
    e.preventDefault()
    if (!tempToken || !twoFACode) {
      setFormError('Please enter the 6-digit code')
      return
    }

    setFormError(null)
    try {
      const { data } = await complete2FALoginMutation({
        variables: { tempToken, code: twoFACode },
      })

      if (data?.complete2FALogin?.user?.id) {
        signedIn()
      } else {
        setFormError('Invalid 2FA code')
      }
    } catch (error) {
      setFormError((error as Error)?.message ?? 'Invalid 2FA code. Please try again.')
    }
  }

  const fields = [
    FormFieldClass.email('email', {
      label: 'Email',
      required: true,
      defaultValue: isRemembered?.email ?? '',
    }),
    FormFieldClass.password('password', { label: 'Password', required: true }),
    FormFieldClass.checkbox('remember', {
      label: 'Remember me',
      defaultValue: !!isRemembered?.email,
      customWrapper: ForgotPasswordWrapper,
    }),
    FormFieldClass.button('submit', { fullWidth: true, text: 'Log In', type: 'submit' }),
  ]

  // If 2FA is required, show 2FA verification form
  if (requires2FA) {
    return (
      <AuthLayout
        title="Two-Factor Authentication"
        subtitle="Enter the code from your authenticator app"
      >
        <div className="space-y-6">
          {formError && (
            <div className="text-center text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg p-3 text-sm">
              {formError}
            </div>
          )}
          <form onSubmit={handleComplete2FA} className="space-y-4">
            <div>
              <label
                htmlFor="twoFACode"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
              >
                Authentication Code
              </label>
              <input
                type="text"
                id="twoFACode"
                value={twoFACode}
                onChange={e => setTwoFACode(e.target.value.replaceAll(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                className="w-full px-4 py-3 bg-white dark:bg-white border border-zinc-300 dark:border-zinc-300 rounded-lg text-zinc-900 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 text-center">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
            <button
              type="submit"
              disabled={twoFACode.length !== 6}
              className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-300 disabled:cursor-not-allowed text-zinc-950 rounded-lg font-medium transition-colors"
            >
              Verify and Login
            </button>
          </form>
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setRequires2FA(false)
                setTempToken(null)
                setTwoFACode('')
                setFormError(null)
              }}
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              ← Back to login
            </button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // Normal login form
  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your account">
      <div className="space-y-6">
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-emerald-600 hover:text-emerald-500">
            Sign up
          </Link>
        </p>
        {notice && (
          <div className="text-center text-sky-900 dark:text-sky-100 bg-sky-50 dark:bg-sky-400/10 border border-sky-200 dark:border-sky-400/20 rounded-lg p-3 text-sm">
            {notice}
          </div>
        )}
        {formError && (
          <div className="text-center text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg p-3 text-sm">
            {formError}
          </div>
        )}
        <Form id="login-form" theme={formTheme} fields={fields} submit={processLogin} />

        {/* FUTURE: Add OAuth providers (Google, GitHub) when ready */}
      </div>
    </AuthLayout>
  )
}

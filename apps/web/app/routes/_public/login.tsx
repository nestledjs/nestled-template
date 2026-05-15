import React, { useState } from 'react'
import {
  Link,
  LoaderFunctionArgs,
  redirect,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout } from '@nestled-template/web'
import { getCookie, getJsonCookie, getSessionCookieName } from '@nestled-template/shared/utils'
import {
  LoginInput,
  Login,
  Complete2FaLogin,
  type LoginMutation,
  type Complete2FaLoginMutation,
} from '@nestled-template/shared/sdk'
import { formTheme } from '@nestled-template/shared/styles'
import { useMutation } from '@apollo/client/react'

export async function loader({ request }: LoaderFunctionArgs) {
  const token = getCookie(request.headers, getSessionCookieName())
  if (token) {
    throw redirect('/members/dashboard')
  }
  const isRemembered = getJsonCookie<{ email: string }>(request.headers, '_nestled_remember')
  return isRemembered ?? {}
}

export const ForgotPasswordWrapper = (children: React.ReactNode) => (
  <div key={'remember'} className="flex items-center justify-between">
    {children}
    <div className="text-sm">
      <Link to="/forgot-password" className="font-medium text-emerald-400 hover:text-emerald-300">
        Forgot your password?
      </Link>
    </div>
  </div>
)

export default function LoginPage() {
  const isRemembered = useLoaderData()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const [twoFACode, setTwoFACode] = useState('')

  const redirectUrl = searchParams.get('redirect') || '/members/dashboard'

  const [loginMutation] = useMutation<LoginMutation>(Login)
  const [complete2FALoginMutation] = useMutation<Complete2FaLoginMutation>(Complete2FaLogin)

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
        // We should not set our own cookies here, just navigate
        navigate(redirectUrl)
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
        navigate(redirectUrl)
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
            <div className="text-center text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-sm">
              {formError}
            </div>
          )}
          <form onSubmit={handleComplete2FA} className="space-y-4">
            <div>
              <label htmlFor="twoFACode" className="block text-sm font-medium text-zinc-300 mb-2">
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
                className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
            <button
              type="submit"
              disabled={twoFACode.length !== 6}
              className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
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
              className="text-sm text-zinc-400 hover:text-zinc-300"
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
        <p className="text-center text-sm text-zinc-400">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-emerald-400 hover:text-emerald-300">
            Sign up
          </Link>
        </p>
        {formError && (
          <div className="text-center text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-sm">
            {formError}
          </div>
        )}
        <Form id="login-form" theme={formTheme} fields={fields} submit={processLogin} />

        {/* TODO: Add OAuth providers (Google, GitHub) when ready */}
      </div>
    </AuthLayout>
  )
}

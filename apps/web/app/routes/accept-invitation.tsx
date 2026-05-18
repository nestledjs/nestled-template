import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import {
  GetInvitationDetails,
  AcceptOrganizationInvitation,
  Login,
  RegisterWithInvitation,
  type GetInvitationDetailsQuery,
  type AcceptOrganizationInvitationMutation,
  type LoginMutation,
  type RegisterWithInvitationMutation,
} from '@nestled-template/shared/sdk'
import { useGlobalCtx } from '@nestled-template/web'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { formTheme } from '@nestled-template/shared/styles'
import { useQuery, useMutation } from '@apollo/client/react'

type Tab = 'login' | 'signup'

type SignupInput = {
  firstName: string
  lastName: string
  email?: string
  password: string
}

export function buildRegisterWithInvitationInput(
  invitationToken: string,
  invitationEmail: string,
  input: SignupInput,
) {
  return {
    invitationToken,
    email: invitationEmail.trim().toLowerCase(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    password: input.password,
  }
}

function extractValidationMessages(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []

  const maybeError = value as {
    extensions?: { originalError?: { message?: string | string[] } }
    graphQLErrors?: Array<{ extensions?: { originalError?: { message?: string | string[] } } }>
    errors?: Array<{ extensions?: { originalError?: { message?: string | string[] } } }>
  }
  const directMessage = maybeError.extensions?.originalError?.message
  if (Array.isArray(directMessage)) return directMessage
  if (typeof directMessage === 'string') return [directMessage]

  const graphQLErrors = maybeError.graphQLErrors ?? maybeError.errors ?? []

  return graphQLErrors.flatMap(error => {
    const message = error.extensions?.originalError?.message
    if (Array.isArray(message)) return message
    if (typeof message === 'string') return [message]
    return []
  })
}

export function getInvitationErrorMessage(error: unknown, fallback: string): string {
  const validationMessages = extractValidationMessages(error)
  if (validationMessages.length > 0) return capitalizeSentence(validationMessages.join(' '))
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function capitalizeSentence(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return message
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
}

function getMutationResultErrorMessage(result: unknown, fallback: string): string {
  if (!result || typeof result !== 'object') return fallback

  const maybeResult = result as { error?: unknown; errors?: unknown }
  return getInvitationErrorMessage(maybeResult.error ?? maybeResult.errors ?? result, fallback)
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useGlobalCtx()
  const [activeTab, setActiveTab] = useState<Tab>('signup')
  const [formError, setFormError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const token = searchParams.get('token')

  // Fetch invitation details
  const {
    data: inviteData,
    loading: inviteLoading,
    error: inviteError,
  } = useQuery<GetInvitationDetailsQuery>(GetInvitationDetails, {
    variables: { token: token || '' },
    skip: !token,
  })

  const [acceptInvitation] = useMutation<AcceptOrganizationInvitationMutation>(
    AcceptOrganizationInvitation,
  )
  const [login] = useMutation<LoginMutation>(Login)
  const [registerWithInvitation] =
    useMutation<RegisterWithInvitationMutation>(RegisterWithInvitation)

  const invitationDetails = inviteData?.getInvitationDetails

  const acceptInvitationAsync = useCallback(async () => {
    if (!token) return

    try {
      setIsProcessing(true)
      await acceptInvitation({
        variables: {
          input: { token },
        },
      })

      // Redirect to members area
      setTimeout(() => {
        navigate('/members', { replace: true })
      }, 1500)
    } catch (error) {
      setFormError(
        getInvitationErrorMessage(error, 'Failed to accept invitation. Please try again.'),
      )
      setIsProcessing(false)
    }
  }, [acceptInvitation, navigate, token])

  // If user is already logged in, accept the invitation automatically
  useEffect(() => {
    if (user && token && invitationDetails) {
      acceptInvitationAsync()
    }
  }, [acceptInvitationAsync, invitationDetails, token, user])

  async function handleLogin(input: { email: string; password: string; remember?: boolean }) {
    if (!token) return

    setFormError(null)
    setIsProcessing(true)

    try {
      const { data } = await login({
        variables: { input },
      })

      if (data?.login?.user?.id) {
        // Login successful, now accept the invitation
        await acceptInvitation({
          variables: {
            input: { token },
          },
        })

        // Redirect to members area
        setTimeout(() => {
          navigate('/members', { replace: true })
        }, 1500)
      } else {
        setFormError('Invalid email or password')
        setIsProcessing(false)
      }
    } catch (error) {
      setFormError(getInvitationErrorMessage(error, 'Failed to login. Please try again.'))
      setIsProcessing(false)
    }
  }

  async function handleSignup(input: SignupInput) {
    if (!token || !invitationDetails) return

    setFormError(null)
    setIsProcessing(true)

    try {
      const result = await registerWithInvitation({
        variables: {
          input: buildRegisterWithInvitationInput(token, invitationDetails.email, input),
        },
      })
      const resultErrorMessage = getMutationResultErrorMessage(result, '')

      if (result.data?.registerWithInvitation?.user?.id) {
        // Registration successful, redirect to members area
        setTimeout(() => {
          navigate('/members', { replace: true })
        }, 1500)
      } else {
        setFormError(resultErrorMessage || 'Failed to create account')
        setIsProcessing(false)
      }
    } catch (error) {
      setFormError(getInvitationErrorMessage(error, 'Failed to create account. Please try again.'))
      setIsProcessing(false)
    }
  }

  // Show loading state
  if (!token) {
    return (
      <InvitationErrorState
        title="Invalid Invitation"
        message="No invitation token provided. Please check your invitation link."
      />
    )
  }

  if (inviteLoading) {
    return <InvitationLoadingState />
  }

  if (inviteError || !invitationDetails) {
    return (
      <InvitationErrorState
        title="Invitation Not Found"
        message={inviteError?.message || 'This invitation link is invalid or has expired.'}
      />
    )
  }

  // If user is logged in and processing, show accepting state
  if (user && isProcessing) {
    return <InvitationAcceptingState organizationName={invitationDetails.organizationName} />
  }

  const loginFields = [
    FormFieldClass.email('email', {
      label: 'Email Address',
      required: true,
      defaultValue: invitationDetails.email,
    }),
    FormFieldClass.password('password', {
      label: 'Password',
      required: true,
      validate: (value: unknown) =>
        typeof value === 'string' && value.length >= 8
          ? true
          : 'Password must be at least 8 characters',
    }),
    FormFieldClass.button('submit', {
      text: isProcessing ? 'Logging in...' : 'Login & Accept Invitation',
      type: 'submit',
      fullWidth: true,
      disabled: isProcessing,
    }),
  ]

  const signupFields = [
    FormFieldClass.email('email', {
      label: 'Email Address',
      required: true,
      defaultValue: invitationDetails.email,
      disabled: true,
    }),
    FormFieldClass.text('firstName', {
      label: 'First Name',
      required: true,
    }),
    FormFieldClass.text('lastName', {
      label: 'Last Name',
      required: true,
    }),
    FormFieldClass.password('password', {
      label: 'Password',
      required: true,
    }),
    FormFieldClass.button('submit', {
      text: isProcessing ? 'Creating Account...' : 'Sign Up & Accept Invitation',
      type: 'submit',
      fullWidth: true,
      disabled: isProcessing,
    }),
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 p-4">
      <div className="w-full max-w-md">
        {/* Invitation Header */}
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 backdrop-blur shadow-xl mb-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/10 mb-4">
              <EnvelopeIcon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
              You're Invited!
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {invitationDetails.inviterName} has invited you to join
            </p>
          </div>

          {/* Organization Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
              <BuildingOfficeIcon className="h-5 w-5 text-zinc-400" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Organization</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {invitationDetails.organizationName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
              <UserIcon className="h-5 w-5 text-zinc-400" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Your Role</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {invitationDetails.roleName}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Login/Signup Tabs */}
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 backdrop-blur shadow-xl">
          {/* Tab Headers */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('signup')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'signup'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'login'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              Login
            </button>
          </div>

          {formError && (
            <div className="mb-4 rounded-lg text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3">
              {formError}
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'signup' && (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Create a new account to join {invitationDetails.organizationName}
              </p>
              <Form
                id="signup-form"
                theme={formTheme}
                fields={signupFields}
                submit={handleSignup}
              />
            </div>
          )}

          {activeTab === 'login' && (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Sign in with your existing account to accept this invitation
              </p>
              <Form id="login-form" theme={formTheme} fields={loginFields} submit={handleLogin} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper Components

function InvitationLoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 backdrop-blur shadow-xl">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-100 dark:bg-sky-500/10 mb-4">
              <ArrowPathIcon className="h-8 w-8 text-sky-600 dark:text-sky-400 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
              Loading Invitation
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Please wait while we fetch your invitation details...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function InvitationAcceptingState({ organizationName }: { readonly organizationName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 backdrop-blur shadow-xl">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/10 mb-4">
              <CheckCircleIcon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Welcome!</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
              You've successfully joined <strong>{organizationName}</strong>
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Redirecting you to your dashboard...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function InvitationErrorState({
  title,
  message,
}: {
  readonly title: string
  readonly message: string
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 backdrop-blur shadow-xl">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-500/10 mb-4">
              <XCircleIcon className="h-8 w-8 text-rose-600 dark:text-rose-400" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">{title}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">{message}</p>
            <a
              href="/"
              className="inline-block px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
            >
              Go to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

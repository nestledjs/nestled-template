import React, { useState } from 'react'
import { Link } from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout, TurnstileWidget, turnstileSiteKey } from '@nestled-template/web'
import { RegisterInput, Register } from '@nestled-template/shared/sdk'
import { DEFAULT_POST_LOGIN } from '../../session/return-url'
import { formTheme } from '@nestled-template/shared/styles'
import { clearActiveOrganizationForSessionChange } from '@nestled-template/shared/apollo'
import { useMutation } from '@apollo/client/react'

interface RegisterFormInput extends RegisterInput {
  organizationName: string
}

export default function RegisterPage() {
  const [formError, setFormError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | undefined>()
  // Bumping this remounts the widget for a fresh challenge. A Turnstile token is single-use, so
  // every failed attempt — including the common "email already in use" — burns it, and without a
  // reset the retry would fail the captcha instead of showing the real error.
  const [captchaKey, setCaptchaKey] = useState(0)
  // Throw on a GraphQL error so the catch below sees it (also the client default; kept explicit).
  const [registerMutation, { loading }] = useMutation(Register, {
    errorPolicy: 'none',
  })
  const captchaRequired = Boolean(turnstileSiteKey())

  function failRegistration(message: string) {
    setFormError(message)
    setCaptchaToken(undefined)
    setCaptchaKey(key => key + 1)
  }

  async function processRegister(input: RegisterFormInput) {
    setFormError(null)

    if (captchaRequired && !captchaToken) {
      setFormError('Please complete the verification challenge below.')
      return
    }

    try {
      // Extract organization name from input
      const { organizationName, ...registerInput } = input

      const { data } = await registerMutation({
        variables: {
          input: {
            ...registerInput,
            organizationName, // Backend now handles this in register mutation
            captchaToken,
          },
        },
      })

      const token = data?.register?.token
      if (token) {
        // The new account is signed in: forget an organization stored for a previous user, so its
        // requests never carry another user's `x-organization-id`, and go to the dashboard in a new
        // document, so nothing cached for a previous user is left (see login.tsx `signedIn`).
        // Email verification can be handled separately if needed
        clearActiveOrganizationForSessionChange()
        globalThis.location.assign(DEFAULT_POST_LOGIN)
      } else {
        failRegistration('Unable to register. Please try again.')
      }
    } catch (error) {
      failRegistration((error as Error)?.message || 'Something went wrong')
    }
  }

  const fields = [
    FormFieldClass.text('firstName', { label: 'First Name', required: true }),
    FormFieldClass.text('lastName', { label: 'Last Name', required: true }),
    FormFieldClass.text('organizationName', {
      label: 'Organization Name',
      required: true,
      placeholder: 'Acme Inc.',
      helpText: 'You can invite team members after signing up',
    }),
    FormFieldClass.email('email', { label: 'Email', required: true }),
    FormFieldClass.password('password', {
      label: 'Password',
      required: true,
      helpText: 'Must be at least 8 characters',
    }),
    FormFieldClass.button('submit', {
      fullWidth: true,
      text: loading ? 'Creating Account...' : 'Create Account',
      type: 'submit',
      disabled: loading,
    }),
  ]

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Get started with your organization in minutes"
    >
      <div className="space-y-6">
        <p className="text-center text-sm text-zinc-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-emerald-400 hover:text-emerald-300">
            Log in
          </Link>
        </p>
        {formError && (
          <div className="text-center text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-sm">
            {formError}
          </div>
        )}
        <Form id="register-form" theme={formTheme} fields={fields} submit={processRegister} />
        <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />
        <p className="text-xs text-center text-zinc-500">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="text-emerald-400 hover:text-emerald-300">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-emerald-400 hover:text-emerald-300">
            Privacy Policy
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

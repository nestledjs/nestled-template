import React, { useState } from 'react'
import { Link } from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout, TurnstileWidget, turnstileSiteKey } from '@nestled-template/web'
import {
  ForgotPasswordInput,
  ForgotPassword,
  type ForgotPasswordMutation,
} from '@nestled-template/shared/sdk'
import { formTheme } from '@nestled-template/shared/styles'
import { useMutation } from '@apollo/client/react'

export default function ForgotPasswordPage() {
  const [formMessage, setFormMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | undefined>()
  // A Turnstile token is single-use, so a failed attempt must remount the widget for a fresh
  // challenge — otherwise the retry fails the captcha instead of surfacing the real error.
  const [captchaKey, setCaptchaKey] = useState(0)
  const [forgotPasswordMutation, { loading }] = useMutation<ForgotPasswordMutation>(ForgotPassword)
  const captchaRequired = Boolean(turnstileSiteKey())

  async function handleForgotPassword(input: ForgotPasswordInput) {
    setFormMessage(null)

    if (captchaRequired && !captchaToken) {
      setFormMessage({ type: 'error', text: 'Please complete the verification challenge below.' })
      return
    }

    try {
      const { data } = await forgotPasswordMutation({
        variables: { input: { ...input, captchaToken } },
      })
      if (data?.forgotPassword) {
        // Deliberately the same message whether or not the address is registered — saying "no
        // account found" here would confirm to anyone whether an address has an account.
        setFormMessage({
          type: 'success',
          text: 'If that email address has an account, a password reset link is on its way. Please check your inbox.',
        })
      } else {
        setFormMessage({
          type: 'error',
          text: 'Something went wrong. Please try again.',
        })
      }
    } catch (error) {
      setFormMessage({
        type: 'error',
        text: (error as Error).message || 'Something went wrong',
      })
    } finally {
      setCaptchaToken(undefined)
      setCaptchaKey(key => key + 1)
    }
  }

  const fields = [
    FormFieldClass.email('email', { label: 'Email', required: true }),
    FormFieldClass.button('submit', {
      text: loading ? 'Requesting...' : 'Request Password Reset Token',
      type: 'submit',
      loading,
    }),
  ]

  return (
    <AuthLayout
      title="Forgot Your Password?"
      subtitle="Enter your email to request a password reset"
    >
      <div className="space-y-6">
        <p className="text-center text-sm text-zinc-400">
          <Link to="/login" className="font-semibold text-emerald-400 hover:text-emerald-300">
            Back to Login
          </Link>
        </p>
        {formMessage && (
          <div
            className={`text-center rounded-lg p-3 text-sm border ${
              formMessage.type === 'success'
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                : 'text-rose-300 bg-rose-500/10 border-rose-500/20'
            }`}
          >
            {formMessage.text}
          </div>
        )}
        <Form
          theme={formTheme}
          id="forgot-password-form"
          fields={fields}
          submit={handleForgotPassword}
        />
        <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />
      </div>
    </AuthLayout>
  )
}

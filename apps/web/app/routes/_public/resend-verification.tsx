import React, { useState } from 'react'
import { Link } from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout, TurnstileWidget, turnstileSiteKey } from '@nestled-template/web'
import {
  ResendVerificationEmail,
  type ResendVerificationEmailMutation,
} from '@nestled-template/shared/sdk'
import { formTheme } from '@nestled-template/shared/styles'
import { useMutation } from '@apollo/client/react'

export default function ResendVerification() {
  const [formMessage, setFormMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | undefined>()
  // Bumping this remounts the widget for a fresh challenge — a Turnstile token is single-use, so any
  // failed/retried resend must not reuse a spent token. See register.tsx for the same pattern.
  const [captchaKey, setCaptchaKey] = useState(0)
  const [resendMutation, { loading }] =
    useMutation<ResendVerificationEmailMutation>(ResendVerificationEmail)
  const captchaRequired = Boolean(turnstileSiteKey())

  function resetCaptcha() {
    setCaptchaToken(undefined)
    setCaptchaKey(key => key + 1)
  }

  async function handleResend({ email }: { email: string }) {
    setFormMessage(null)

    if (captchaRequired && !captchaToken) {
      setFormMessage({ type: 'error', text: 'Please complete the verification challenge below.' })
      return
    }

    try {
      const { data } = await resendMutation({ variables: { email, captchaToken } })
      if (data?.resendVerificationEmail) {
        setFormMessage({
          type: 'success',
          text: 'Verification email sent. Please check your inbox.',
        })
      } else {
        setFormMessage({
          type: 'error',
          text: 'Unable to send verification email. Please try again.',
        })
      }
    } catch (error) {
      setFormMessage({ type: 'error', text: (error as Error).message || 'Something went wrong' })
    } finally {
      // The page stays put after a resend (unlike register, which navigates away), and a Turnstile
      // token is single-use — so reset the widget on every outcome, including success, or a second
      // resend would send a spent token and fail the captcha.
      resetCaptcha()
    }
  }

  const fields = [
    FormFieldClass.email('email', { label: 'Email', required: true }),
    FormFieldClass.button('submit', {
      text: loading ? 'Sending...' : 'Resend Verification Email',
      type: 'submit',
      loading,
      fullWidth: true,
    }),
  ]

  return (
    <AuthLayout
      title="Resend Verification"
      subtitle="Enter your email to receive a new verification link"
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
          id="resend-verification-form"
          fields={fields}
          submit={handleResend}
        />
        <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />
      </div>
    </AuthLayout>
  )
}

import React, { useState } from 'react'
import { Link } from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout } from '@nestled-template/web'
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
  const [resendMutation, { loading }] =
    useMutation<ResendVerificationEmailMutation>(ResendVerificationEmail)

  async function handleResend({ email }: { email: string }) {
    setFormMessage(null)
    try {
      const { data } = await resendMutation({ variables: { email } })
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
      </div>
    </AuthLayout>
  )
}

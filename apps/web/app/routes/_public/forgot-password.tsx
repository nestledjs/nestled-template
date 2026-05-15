import React, { useState } from 'react'
import { Link } from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout } from '@nestled-template/web'
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
  const [forgotPasswordMutation, { loading }] = useMutation<ForgotPasswordMutation>(ForgotPassword)

  async function handleForgotPassword(input: ForgotPasswordInput) {
    setFormMessage(null)
    try {
      const { data } = await forgotPasswordMutation({ variables: { input } })
      if (data?.forgotPassword) {
        setFormMessage({
          type: 'success',
          text: 'Password reset email sent. Please check your email and follow the instructions to reset your password.',
        })
      } else {
        setFormMessage({
          type: 'error',
          text: 'There was an error finding your account. Please check that your email is correct.',
        })
      }
    } catch (error) {
      setFormMessage({
        type: 'error',
        text: (error as Error).message || 'Something went wrong',
      })
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
      </div>
    </AuthLayout>
  )
}

import React, { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout } from '@nestled-template/web'
import {
  ResetPasswordInput,
  ResetPassword,
  type ResetPasswordMutation,
} from '@nestled-template/shared/sdk'
import { formTheme } from '@nestled-template/shared/styles'
import { useMutation } from '@apollo/client/react'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [formMessage, setFormMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [resetPasswordMutation, { loading }] = useMutation<ResetPasswordMutation>(ResetPassword)
  const token = params.get('token') || ''

  // Validate token exists
  useEffect(() => {
    if (!token) {
      setFormMessage({
        type: 'error',
        text: 'Invalid or missing reset token. Please request a new password reset.',
      })
    }
  }, [token])

  async function handleReset(input: Omit<ResetPasswordInput, 'token'>) {
    if (!token) {
      setFormMessage({ type: 'error', text: 'Invalid reset token' })
      return
    }

    setFormMessage(null)
    try {
      const { data } = await resetPasswordMutation({ variables: { input: { ...input, token } } })
      if (data?.resetPassword?.id) {
        setFormMessage({
          type: 'success',
          text: 'Your password has been reset. Redirecting to login...',
        })
        // Redirect to login after 2 seconds
        setTimeout(() => navigate('/login'), 2000)
      } else {
        setFormMessage({
          type: 'error',
          text: 'Unable to reset password. The token may have expired.',
        })
      }
    } catch (error) {
      setFormMessage({ type: 'error', text: (error as Error).message || 'Something went wrong' })
    }
  }

  const fields = [
    FormFieldClass.password('password', {
      label: 'New Password',
      required: true,
      helpText: 'Must be at least 8 characters',
    }),
    FormFieldClass.button('submit', {
      text: loading ? 'Resetting...' : 'Reset Password',
      type: 'submit',
      loading,
      disabled: !token || loading,
    }),
  ]

  return (
    <AuthLayout title="Reset Password" subtitle="Enter your new password">
      <div className="space-y-6">
        <p className="text-center text-sm text-zinc-400">
          <Link to="/login" className="font-semibold text-emerald-400 hover:text-emerald-300">
            Back to Login
          </Link>
        </p>
        {formMessage && (
          <div
            className={`text-center rounded-lg p-3 text-sm border ${formMessage.type === 'success' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-300 bg-rose-500/10 border-rose-500/20'}`}
          >
            {formMessage.text}
          </div>
        )}
        <Form theme={formTheme} id="reset-password-form" fields={fields} submit={handleReset} />
      </div>
    </AuthLayout>
  )
}

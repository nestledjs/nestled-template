import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation } from '@apollo/client/react'
import {
  VerifyEmail,
  VerifyEmailChange,
  type VerifyEmailMutation,
  type VerifyEmailChangeMutation,
} from '@nestled-template/shared/sdk'
import { AuthLayout } from '@nestled-template/web'

type VerificationType = 'initial' | 'change'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string>('Verifying your email...')
  const [verifyEmailMutation] = useMutation<VerifyEmailMutation>(VerifyEmail)
  const [verifyEmailChangeMutation] = useMutation<VerifyEmailChangeMutation>(VerifyEmailChange)

  // A link without a token fails at once: derived while rendering, with no request to wait for.
  const missingToken = !params.get('token')
  const shownStatus = missingToken ? 'error' : status
  const shownMessage = missingToken ? 'Missing verification token.' : message

  useEffect(() => {
    const token = params.get('token') || ''
    const verificationType = params.get('type') as VerificationType | null
    if (!token) return

    const verifyInitialEmail = () =>
      verifyEmailMutation({ variables: { input: { token } } }).then(({ data }) => {
        if (data?.verifyEmail?.id) {
          setStatus('success')
          setMessage('Your email has been verified. You can now log in.')
        } else {
          setStatus('error')
          setMessage('Invalid or expired verification token.')
        }
      })

    const verifyEmailChange = () =>
      verifyEmailChangeMutation({ variables: { token } }).then(({ data }) => {
        if (data?.verifyEmailChange?.id) {
          setStatus('success')
          setMessage(
            'Your email has been verified successfully! You can now log in with your new email address.',
          )
        }
      })

    if (verificationType === 'change') {
      verifyEmailChange().catch(err => {
        setStatus('error')
        setMessage(err?.message || 'Invalid or expired verification token.')
      })
      return
    }

    verifyInitialEmail().catch(initialError => {
      if (verificationType === 'initial') {
        setStatus('error')
        setMessage(initialError?.message || 'Invalid or expired verification token.')
        return
      }

      // Older email-change links did not include a type marker.
      verifyEmailChange().catch(changeError => {
        setStatus('error')
        setMessage(
          changeError?.message || initialError?.message || 'Invalid or expired verification token.',
        )
      })
    })
  }, [params, verifyEmailMutation, verifyEmailChangeMutation])

  return (
    <AuthLayout
      title="Email Verification"
      subtitle={shownStatus === 'idle' ? 'Verifying your email address...' : undefined}
    >
      <div className="text-center">
        {shownStatus === 'success' && (
          <div className="mb-6 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
            <p>{shownMessage}</p>
          </div>
        )}

        {shownStatus === 'error' && (
          <div className="mb-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 p-4 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
            <p>{shownMessage}</p>
          </div>
        )}

        {shownStatus === 'idle' && (
          <div className="mb-6 rounded-lg bg-sky-50 dark:bg-sky-500/10 p-4 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <p>{shownMessage}</p>
          </div>
        )}

        <Link
          to="/login"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
        >
          Go to Login
        </Link>
      </div>
    </AuthLayout>
  )
}

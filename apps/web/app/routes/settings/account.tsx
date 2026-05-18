import React, { useState } from 'react'
import { useLoaderData } from 'react-router'
import { CalendarIcon, CheckCircleIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  Me,
  type MeQuery,
  ResendVerificationEmail,
  type ResendVerificationEmailMutation,
} from '@nestled-template/shared/sdk'
import { useReadQuery, QueryRef, useMutation } from '@apollo/client/react'
import { ExportDataSection, TransferOwnershipSection, DangerZoneSection } from './_shared-sections'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const meQueryRef = preloadQuery<MeQuery>(Me)
  return { meQueryRef }
})

export default function AccountSettings() {
  const loaderData = useLoaderData() as { meQueryRef: QueryRef<MeQuery> }
  const { data } = useReadQuery(loaderData.meQueryRef)
  const user = data?.me
  const [isResendingEmail, setIsResendingEmail] = useState(false)
  const [emailResendSuccess, setEmailResendSuccess] = useState(false)

  const [resendVerificationEmail] =
    useMutation<ResendVerificationEmailMutation>(ResendVerificationEmail)

  const handleResendVerificationEmail = async () => {
    const primaryEmail = user?.emails?.find(e => e.primary)?.email
    if (!primaryEmail) {
      alert('No primary email found')
      return
    }

    setIsResendingEmail(true)
    setEmailResendSuccess(false)

    try {
      await resendVerificationEmail({
        variables: { email: primaryEmail },
      })

      setEmailResendSuccess(true)
      setTimeout(() => setEmailResendSuccess(false), 5000)
    } catch (error) {
      alert('Failed to resend verification email: ' + (error as Error).message)
    } finally {
      setIsResendingEmail(false)
    }
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-sky-100 dark:bg-sky-500/10 p-3">
            <UserCircleIcon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Account Settings</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Manage your personal account information and preferences
            </p>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Personal Information
        </h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Full Name</p>
            <div className="text-sm text-zinc-900 dark:text-white bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2">
              {user.firstName} {user.lastName}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Email Address
            </p>
            <div className="text-sm text-zinc-900 dark:text-white bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2">
              {user.emails?.find(e => e.primary)?.email || 'No email set'}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              To change your email, use the Security settings page
            </p>
          </div>

          {user.isSuperAdmin && (
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Super Admin Status
              </p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                <span className="text-sm text-zinc-900 dark:text-white">
                  Yes - You have super admin privileges
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account Information */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-violet-100 dark:bg-violet-500/10 p-2">
            <CalendarIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Account Information
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">Account Created</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {new Date(user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">Last Updated</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {new Date(user.updatedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">Email Verified</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {user.emailValidated ? 'Yes' : 'No'}
              </p>
            </div>
            {!user.emailValidated && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={isResendingEmail}
                  className="px-3 py-1.5 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {isResendingEmail ? 'Sending...' : 'Verify Email'}
                </button>
                {emailResendSuccess && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircleIcon className="h-3 w-3" />
                    <span>Verification email sent! Check your inbox.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ExportDataSection />
      <TransferOwnershipSection />
      <DangerZoneSection />
    </div>
  )
}

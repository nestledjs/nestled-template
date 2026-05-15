import React, { useState } from 'react'
import { useLoaderData, useNavigate } from 'react-router'
import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  Me,
  type MeQuery,
  DeleteUserAccount,
  ExportUserData,
  ResendVerificationEmail,
  type DeleteUserAccountMutation,
  type ExportUserDataQuery,
  type ResendVerificationEmailMutation,
} from '@nestled-template/shared/sdk'
import { useReadQuery, QueryRef, useMutation, useLazyQuery } from '@apollo/client/react'
import { TransferOwnershipModal } from '@nestled-template/web'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const meQueryRef = preloadQuery<MeQuery>(Me)
  return { meQueryRef }
})

export default function AccountSettings() {
  const loaderData = useLoaderData() as { meQueryRef: QueryRef<MeQuery> }
  const { data } = useReadQuery(loaderData.meQueryRef)
  const user = data?.me
  const navigate = useNavigate()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [isResendingEmail, setIsResendingEmail] = useState(false)
  const [emailResendSuccess, setEmailResendSuccess] = useState(false)

  const [deleteAccountMutation] = useMutation<DeleteUserAccountMutation>(DeleteUserAccount)
  const [exportUserData] = useLazyQuery<ExportUserDataQuery>(ExportUserData)
  const [resendVerificationEmail] =
    useMutation<ResendVerificationEmailMutation>(ResendVerificationEmail)

  const handleExportData = async () => {
    if (isExporting) return

    setIsExporting(true)
    setExportError(null)
    setExportSuccess(false)

    try {
      const result = await exportUserData()

      if (result.error) {
        throw new Error(result.error.message || 'Failed to export data')
      }

      const exportData = result.data?.exportUserData

      if (!exportData) {
        throw new Error('No export data returned')
      }

      // Download as JSON file
      const dataStr = JSON.stringify(exportData.userData, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `user-data-export-${new Date().toISOString().split('T')[0]}.json`
      link.click()

      // Show success feedback
      setExportSuccess(true)
      // Hide success message after 5 seconds
      setTimeout(() => setExportSuccess(false), 5000)
    } catch (error) {
      setExportError((error as Error).message)
      // Hide error message after 8 seconds
      setTimeout(() => setExportError(null), 8000)
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      alert('Please type DELETE to confirm account deletion')
      return
    }

    try {
      await deleteAccountMutation()

      alert('Your account has been deleted. You will be logged out now.')
      // Redirect to login page
      window.location.href = '/login'
    } catch (error) {
      alert('Failed to delete account: ' + (error as Error).message)
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
    }
  }

  const handleTransferOwnership = () => {
    setShowTransferModal(true)
  }

  const handleTransferSuccess = () => {
    // Optionally refresh data or show success message
    // The modal will handle the success alert
  }

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
      // Hide success message after 5 seconds
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
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Full Name
            </label>
            <div className="text-sm text-zinc-900 dark:text-white bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2">
              {user.firstName} {user.lastName}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Email Address
            </label>
            <div className="text-sm text-zinc-900 dark:text-white bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2">
              {user.emails?.find(e => e.primary)?.email || 'No email set'}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              To change your email, use the Security settings page
            </p>
          </div>

          {user.isSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Super Admin Status
              </label>
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

      {/* Data Export (GDPR) */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-blue-100 dark:bg-blue-500/10 p-2">
            <ArrowDownTrayIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Export Your Data</h3>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Download a copy of all your personal data in JSON format. This includes your profile
          information, security events, preferences, and organization memberships.
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleExportData}
            disabled={isExporting}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export Personal Data'}
          </button>

          {exportSuccess && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircleIcon className="h-4 w-4" />
              <span>Your data has been exported successfully!</span>
            </div>
          )}

          {exportError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <XCircleIcon className="h-4 w-4" />
              <span>Failed to export data: {exportError}</span>
            </div>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            GDPR Compliance: You have the right to access and export your personal data at any time.
          </p>
        </div>
      </div>

      {/* Organization Ownership Transfer */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-2">
            <ArrowsRightLeftIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Transfer Organization Ownership
          </h3>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          If you are the owner of an organization, you can transfer ownership to another member.
          This action cannot be undone.
        </p>

        <button
          type="button"
          onClick={handleTransferOwnership}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Transfer Ownership
        </button>
      </div>

      {/* Danger Zone - Delete Account */}
      <div className="rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-rose-100 dark:bg-rose-500/10 p-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          </div>
          <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-400">Danger Zone</h3>
        </div>

        <p className="text-sm text-rose-700 dark:text-rose-300 mb-4">
          <strong>Delete your account:</strong> Once you delete your account, there is no going
          back. This will permanently delete your account and all associated data. You will be
          removed from all organizations.
        </p>

        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Delete My Account
          </button>
        ) : (
          <div className="space-y-3">
            <div className="p-4 border-2 border-rose-300 dark:border-rose-500/30 rounded-lg bg-white dark:bg-rose-500/5">
              <p className="text-sm font-medium text-rose-900 dark:text-rose-300 mb-2">
                Are you absolutely sure?
              </p>
              <p className="text-sm text-rose-700 dark:text-rose-400 mb-3">
                This action <strong>cannot be undone</strong>. Please type <strong>DELETE</strong>{' '}
                to confirm.
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3 py-2 border border-rose-300 dark:border-rose-500/30 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE'}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                I understand, delete my account
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                }}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transfer Ownership Modal */}
      <TransferOwnershipModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={handleTransferSuccess}
      />
    </div>
  )
}

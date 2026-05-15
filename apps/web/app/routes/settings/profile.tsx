import React, { useState } from 'react'
import { useLoaderData } from 'react-router'
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
  UpdateUser,
  ChangeEmail,
  ResendVerificationEmail,
  DeleteUserAccount,
  ExportUserData,
  UploadUserAvatar,
  DeleteFile,
  type UpdateUserMutation,
  type ChangeEmailMutation,
  type ResendVerificationEmailMutation,
  type DeleteUserAccountMutation,
  type ExportUserDataQuery,
  type UploadUserAvatarMutation,
  type DeleteFileMutation,
} from '@nestled-template/shared/sdk'
import { useApolloClient, useReadQuery, type QueryRef, useLazyQuery, useMutation } from '@apollo/client/react'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { formTheme } from '@nestled-template/shared/styles'
import { AvatarUpload } from '@nestled-template/web-ui'
import { TransferOwnershipModal } from '@nestled-template/web'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const meQueryRef = preloadQuery<MeQuery>(Me)
  return { meQueryRef }
})

// Helper function to validate username
function validateUsername(username: string): { valid: boolean; error?: string } {
  const cleanedUsername = username.toLowerCase().replaceAll(/[^a-z0-9.]/g, '')
  if (cleanedUsername !== username) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, and periods' }
  }
  if (cleanedUsername.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' }
  }
  return { valid: true }
}

// Helper function to get error message based on error type
function getErrorMessage(error: Error): string {
  if (error.message?.includes('Template email send failed')) {
    return 'Email service is not configured. Profile updates saved but verification email could not be sent.'
  }
  if (error.message?.includes('Template') && error.message?.includes('not found')) {
    return 'Email templates are not properly configured. Please contact support.'
  }
  if (error.message?.includes('Unique constraint') || error.message?.includes('displayName')) {
    return 'This username is already taken. Please choose another.'
  }
  return error.message || 'Failed to update profile'
}

// Helper function to collect user updates
function collectUserUpdates(
  values: { firstName?: string; lastName?: string; displayName?: string },
  user: any,
): Record<string, string | undefined> {
  const updates: Record<string, string | undefined> = {}
  if (values.firstName !== user?.firstName) updates.firstName = values.firstName
  if (values.lastName !== user?.lastName) updates.lastName = values.lastName
  if (values.displayName && values.displayName !== user?.displayName) {
    updates.displayName = values.displayName.toLowerCase().replace(/[^a-z0-9.]/g, '')
  }
  return updates
}

function downloadJsonFile(data: unknown, filename: string) {
  const dataStr = JSON.stringify(data, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

type UserAvatar = {
  id: string
  publicUrl?: string | null
  url?: string | null
}

export default function ProfileSettings() {
  const loaderData = useLoaderData() as { meQueryRef: QueryRef<MeQuery> }
  const { data } = useReadQuery(loaderData.meQueryRef)
  const user = data?.me
  const client = useApolloClient()

  const [updateUser] = useMutation<UpdateUserMutation>(UpdateUser)
  const [changeEmail] = useMutation<ChangeEmailMutation>(ChangeEmail)
  const [resendVerificationEmail] =
    useMutation<ResendVerificationEmailMutation>(ResendVerificationEmail)
  const [deleteAccountMutation] = useMutation<DeleteUserAccountMutation>(DeleteUserAccount)
  const [exportUserData] = useLazyQuery<ExportUserDataQuery>(ExportUserData)
  const [uploadUserAvatar] = useMutation<UploadUserAvatarMutation>(UploadUserAvatar)
  const [deleteFile] = useMutation<DeleteFileMutation>(DeleteFile)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [isResendingEmail, setIsResendingEmail] = useState(false)
  const [emailResendSuccess, setEmailResendSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [avatarMessage, setAvatarMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (!user) {
    return <div>Loading...</div>
  }

  const primaryEmail = user.emails?.find(e => e.primary)

  const userAvatar = user.avatar as UserAvatar | undefined | null

  const handleAvatarUpload = async (file: File) => {
    try {
      const result = await uploadUserAvatar({
        variables: { file },
      })

      if (result.data?.uploadUserAvatar) {
        // Refresh user data to show new avatar
        await client.refetchQueries({ include: [Me] })
        setAvatarMessage({ type: 'success', text: 'Avatar uploaded successfully!' })
        setTimeout(() => setAvatarMessage(null), 3000)
      }
    } catch (error) {
      console.error('Avatar upload failed:', error)
      setAvatarMessage({ type: 'error', text: (error as Error).message || 'Failed to upload avatar' })
      setTimeout(() => setAvatarMessage(null), 5000)
    }
  }

  const handleAvatarRemove = async () => {
    if (!userAvatar) {
      setAvatarMessage({ type: 'error', text: 'No avatar to remove' })
      setTimeout(() => setAvatarMessage(null), 3000)
      return
    }

    try {
      await deleteFile({ variables: { uploadId: userAvatar.id } })
      await client.refetchQueries({ include: [Me] })
      setAvatarMessage({ type: 'success', text: 'Avatar removed' })
    } catch (error) {
      console.error('Avatar removal failed:', error)
      setAvatarMessage({ type: 'error', text: (error as Error).message || 'Failed to remove avatar' })
    }
    setTimeout(() => setAvatarMessage(null), 3000)
  }

  const handleResendVerificationEmail = async () => {
    const primaryEmail = user.emails?.find(e => e.primary)?.email
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

  const AvatarSection = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-6">
        <AvatarUpload
          currentImageUrl={userAvatar?.publicUrl ?? userAvatar?.url ?? undefined}
          fallbackText={
            `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName || 'User'
          }
          onUpload={handleAvatarUpload}
          onRemove={userAvatar ? handleAvatarRemove : undefined}
          size="xl"
        />
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Profile Picture</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
            Upload a photo to personalize your account
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Recommended: Square image, at least 200x200px. Max file size: 5MB.
          </p>
        </div>
      </div>
      {avatarMessage && (
        <div
          className={`rounded-lg p-3 text-sm ${
            avatarMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
              : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
          }`}
        >
          {avatarMessage.text}
        </div>
      )}
    </div>
  )

  const editProfileFields = [
    FormFieldClass.text('firstName', {
      label: 'First Name',
      required: false,
    }),
    FormFieldClass.text('lastName', {
      label: 'Last Name',
      required: false,
    }),
    FormFieldClass.text('displayName', {
      label: 'Username',
      required: false,
      helpText: 'Your unique username (lowercase, alphanumeric only)',
    }),
    FormFieldClass.email('email', {
      label: 'Email',
      required: true,
    }),
    FormFieldClass.content('emailVerificationStatus', {
      content: primaryEmail && !user.emailValidated && (
        <div className="-mt-2 mb-4">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <span aria-hidden="true">⚠️</span> Email not verified
          </p>
          <button
            type="button"
            onClick={handleResendVerificationEmail}
            disabled={isResendingEmail}
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline mt-1 disabled:opacity-50"
          >
            {isResendingEmail ? 'Sending...' : 'Click here to resend verification email'}
          </button>
          {emailResendSuccess && (
            <p className="text-sm mt-1 text-emerald-600 dark:text-emerald-400">
              Verification email sent! Please check your inbox.
            </p>
          )}
        </div>
      ),
    }),
    FormFieldClass.content('buttons', {
      content: (
        <div className="flex gap-4 pt-6">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors bg-emerald-500 text-zinc-950 hover:bg-emerald-400 focus-visible:outline-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      ),
    }),
  ]

  function defaultValues() {
    return {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      displayName: user?.displayName || '',
      email: primaryEmail?.email || '',
    }
  }

  async function handleSubmit(values: {
    firstName?: string
    lastName?: string
    displayName?: string
    email: string
    bio?: string
    password?: string
    newPassword?: string
    confirmPassword?: string
  }) {
    setLoading(true)
    setMessage(null)

    try {
      // Validate username if changed
      if (values.displayName && values.displayName !== user?.displayName) {
        const validation = validateUsername(values.displayName)
        if (!validation.valid) {
          setMessage({ type: 'error', text: validation.error! })
          setLoading(false)
          return
        }
      }

      // Update user fields if changed
      const updates = collectUserUpdates(values, user)
      if (Object.keys(updates).length > 0 && user?.id) {
        await updateUser({
          variables: {
            userId: user.id,
            input: updates,
          },
        })
      }

      // Handle email change with verification
      const emailChanged = values.email !== primaryEmail?.email
      if (emailChanged) {
        await changeEmail({
          variables: {
            input: {
              newEmail: values.email,
            },
          },
        })
      }

      await client.refetchQueries({ include: [Me] })

      setMessage({
        type: 'success',
        text: emailChanged
          ? 'Profile updated! A verification email has been sent to your new address. Please verify to complete the email change.'
          : 'Profile updated successfully!',
      })
    } catch (error) {
      console.error('Profile update error:', error)
      setMessage({ type: 'error', text: getErrorMessage(error as Error) })
    } finally {
      setLoading(false)
    }
  }

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
      const filename = `user-data-export-${new Date().toISOString().split('T')[0]}.json`
      downloadJsonFile(exportData.userData, filename)

      // Show success feedback
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 5000)
    } catch (error) {
      setExportError((error as Error).message)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-sky-100 dark:bg-sky-500/10 p-3">
            <UserCircleIcon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Profile Settings</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Manage your personal information, avatar, and account details
            </p>
          </div>
        </div>
      </div>

      {/* Avatar Section */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <AvatarSection />
      </div>

      {/* Personal Information Form */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Personal Information
        </h3>

        {message && (
          <div
            className={`mb-6 rounded-lg p-4 ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
            }`}
          >
            {message.text}
          </div>
        )}

        <Form
          theme={formTheme}
          id="edit-profile-form"
          fields={editProfileFields}
          submit={handleSubmit}
          defaultValues={defaultValues()}
          key={user.id}
        />
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

          {user.isSuperAdmin && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-white/5">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                  Super Admin Status
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Yes - You have super admin privileges
                </p>
              </div>
            </div>
          )}
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

import React, { useState } from 'react'
import { useLoaderData } from 'react-router'
import { CalendarIcon, CheckCircleIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  Me,
  type MeQuery,
  UpdateUser,
  ChangeEmail,
  ResendVerificationEmail,
  UploadUserAvatar,
  RemoveUserAvatar,
  type UpdateUserMutation,
  type ChangeEmailMutation,
  type ResendVerificationEmailMutation,
  type UploadUserAvatarMutation,
  type RemoveUserAvatarMutation,
} from '@nestled-template/shared/sdk'
import { useApolloClient, useReadQuery, type QueryRef, useMutation } from '@apollo/client/react'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { formTheme } from '@nestled-template/shared/styles'
import { AvatarUpload } from '@nestled-template/web-ui'
import { ExportDataSection, TransferOwnershipSection, DangerZoneSection } from './_shared-sections'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const meQueryRef = preloadQuery<MeQuery>(Me)
  return { meQueryRef }
})

// Helper function to validate username
function validateUsername(username: string): { valid: boolean; error?: string } {
  const cleanedUsername = username.toLowerCase().replaceAll(/[^a-z0-9.]/g, '')
  if (cleanedUsername !== username) {
    return {
      valid: false,
      error: 'Username can only contain lowercase letters, numbers, and periods',
    }
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
  user: MeQuery['me'],
): Record<string, string | undefined> {
  const updates: Record<string, string | undefined> = {}
  if (values.firstName !== user?.firstName) updates.firstName = values.firstName
  if (values.lastName !== user?.lastName) updates.lastName = values.lastName
  if (values.displayName && values.displayName !== user?.displayName) {
    updates.displayName = values.displayName.toLowerCase().replaceAll(/[^a-z0-9.]/g, '')
  }
  return updates
}

type UserAvatar = NonNullable<NonNullable<MeQuery['me']>['avatar']>

function writeUserAvatarToMeCache(
  client: ReturnType<typeof useApolloClient>,
  avatar: UserAvatar | null,
) {
  client.cache.updateQuery<MeQuery>({ query: Me }, existing => {
    if (!existing?.me) {
      return existing
    }

    return {
      ...existing,
      me: {
        ...existing.me,
        avatar,
      },
    }
  })
}

function uploadedFileToUserAvatar(uploadedFile: UploadUserAvatarMutation['uploadUserAvatar']) {
  return {
    __typename: 'StoredFile' as const,
    id: uploadedFile.id,
    url: uploadedFile.url,
    publicUrl: uploadedFile.publicUrl,
    filename: uploadedFile.filename,
    mimeType: uploadedFile.mimeType,
    createdAt: uploadedFile.createdAt,
  }
}

interface AvatarSectionProps {
  readonly userAvatar: UserAvatar | undefined | null
  readonly user: {
    firstName?: string | null
    lastName?: string | null
    displayName?: string | null
  }
  readonly onUpload: (file: File) => Promise<void>
  readonly onRemove: (() => Promise<void>) | undefined
  readonly avatarMessage: { type: 'success' | 'error'; text: string } | null
}

function AvatarSection({
  userAvatar,
  user,
  onUpload,
  onRemove,
  avatarMessage,
}: AvatarSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6">
        <AvatarUpload
          currentImageUrl={userAvatar?.publicUrl ?? userAvatar?.url ?? undefined}
          fallbackText={
            `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName || 'User'
          }
          onUpload={onUpload}
          onRemove={userAvatar ? onRemove : undefined}
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
  const [uploadUserAvatar] = useMutation<UploadUserAvatarMutation>(UploadUserAvatar)
  const [removeUserAvatar] = useMutation<RemoveUserAvatarMutation>(RemoveUserAvatar)

  const [isResendingEmail, setIsResendingEmail] = useState(false)
  const [emailResendSuccess, setEmailResendSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [avatarMessage, setAvatarMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  if (!user) {
    return <div>Loading...</div>
  }

  const primaryEmail = user.emails?.find(e => e.primary)

  const userAvatar = user.avatar

  const handleAvatarUpload = async (file: File) => {
    try {
      const result = await uploadUserAvatar({
        variables: { file },
      })

      if (result.data?.uploadUserAvatar) {
        writeUserAvatarToMeCache(client, uploadedFileToUserAvatar(result.data.uploadUserAvatar))
        await client.refetchQueries({ include: [Me] })
        setAvatarMessage({ type: 'success', text: 'Avatar uploaded successfully!' })
        setTimeout(() => setAvatarMessage(null), 3000)
      }
    } catch (error) {
      console.error('Avatar upload failed:', error)
      setAvatarMessage({
        type: 'error',
        text: (error as Error).message || 'Failed to upload avatar',
      })
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
      await removeUserAvatar()
      writeUserAvatarToMeCache(client, null)
      await client.refetchQueries({ include: [Me] })
      setAvatarMessage({ type: 'success', text: 'Avatar removed' })
    } catch (error) {
      console.error('Avatar removal failed:', error)
      setAvatarMessage({
        type: 'error',
        text: (error as Error).message || 'Failed to remove avatar',
      })
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
          setMessage({ type: 'error', text: validation.error ?? 'Invalid username' })
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
        <AvatarSection
          userAvatar={userAvatar}
          user={user}
          onUpload={handleAvatarUpload}
          onRemove={handleAvatarRemove}
          avatarMessage={avatarMessage}
        />
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

      <ExportDataSection />
      <TransferOwnershipSection />
      <DangerZoneSection />
    </div>
  )
}

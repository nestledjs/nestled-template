import React, { useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import {
  DeviceTabletIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { formTheme } from '@nestled-template/shared/styles'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  GetUserSessions,
  type GetUserSessionsQuery,
  Me,
  type MeQuery,
  MySecurityEvents,
  type MySecurityEventsQuery,
  ChangePassword,
  InvalidateSession,
  InvalidateAllSessions,
  Setup2Fa,
  Enable2Fa,
  Disable2Fa,
  type ChangePasswordMutation,
  type InvalidateSessionMutation,
  type InvalidateAllSessionsMutation,
  type Setup2FaMutation,
  type Enable2FaMutation,
  type Disable2FaMutation,
} from '@nestled-template/shared/sdk'
import { useReadQuery, type QueryRef, useMutation } from '@apollo/client/react'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const meQueryRef = preloadQuery<MeQuery>(Me)
  const securityEventsQueryRef = preloadQuery<MySecurityEventsQuery>(MySecurityEvents, {
    variables: {
      input: {
        take: 3,
        orderBy: 'createdAt',
        orderDirection: 'desc',
      },
    },
  })
  const userSessionsQueryRef = preloadQuery<GetUserSessionsQuery>(GetUserSessions)
  return { meQueryRef, securityEventsQueryRef, userSessionsQueryRef }
})

export default function SecuritySettings() {
  const loaderData = useLoaderData() as {
    meQueryRef: QueryRef<MeQuery>
    securityEventsQueryRef: QueryRef<MySecurityEventsQuery>
    userSessionsQueryRef: QueryRef<GetUserSessionsQuery>
  }
  const { data } = useReadQuery(loaderData.meQueryRef)
  const { data: securityEventsData } = useReadQuery(loaderData.securityEventsQueryRef)
  const { data: userSessionsData } = useReadQuery(loaderData.userSessionsQueryRef)

  const user = data?.me
  const securityEvents = securityEventsData?.mySecurityEvents || []
  const userSessions = userSessionsData?.getUserSessions || []

  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  // 2FA state
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [show2FADisable, setShow2FADisable] = useState(false)
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  const [changePassword] = useMutation<ChangePasswordMutation>(ChangePassword)
  const [invalidateSession] = useMutation<InvalidateSessionMutation>(InvalidateSession)
  const [invalidateAllSessions] = useMutation<InvalidateAllSessionsMutation>(InvalidateAllSessions)
  const [setup2FA] = useMutation<Setup2FaMutation>(Setup2Fa)
  const [enable2FA] = useMutation<Enable2FaMutation>(Enable2Fa)
  const [disable2FA] = useMutation<Disable2FaMutation>(Disable2Fa)

  const showSuccess = (message: string) => {
    setFormSuccess(message)
    setFormError(null)
    setTimeout(() => setFormSuccess(null), 3000)
  }

  const showError = (message: string) => {
    setFormError(message)
    setFormSuccess(null)
  }

  async function handleChangePassword(input: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }) {
    setFormError(null)
    setFormSuccess(null)

    if (input.newPassword !== input.confirmPassword) {
      setFormError('New passwords do not match')
      return
    }

    if (input.newPassword.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }

    try {
      const { data } = await changePassword({
        variables: {
          input: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
        },
      })

      if (data?.changePassword) {
        showSuccess('Password changed successfully!')
      } else {
        setFormError('Failed to change password')
      }
    } catch (error) {
      setFormError((error as Error)?.message ?? 'Failed to change password')
    }
  }

  async function handleInvalidateSession(sessionId: string) {
    if (!globalThis.confirm('Are you sure you want to log out of this session?')) {
      return
    }

    try {
      await invalidateSession({
        variables: { sessionId },
        refetchQueries: [{ query: GetUserSessions }],
      })
    } catch (error) {
      alert((error as Error)?.message ?? 'Failed to invalidate session')
    }
  }

  async function handleInvalidateAllSessions() {
    if (
      !globalThis.confirm(
        'Are you sure you want to log out of all other sessions? This will not affect your current session.',
      )
    ) {
      return
    }

    try {
      const { data } = await invalidateAllSessions({
        refetchQueries: [{ query: GetUserSessions }],
      })
      const count = data?.invalidateAllSessions ?? 0
      alert(`Successfully logged out of ${count} session${count === 1 ? '' : 's'}`)
    } catch (error) {
      alert((error as Error)?.message ?? 'Failed to invalidate sessions')
    }
  }

  async function handleSetup2FA() {
    try {
      const { data } = await setup2FA()

      if (data?.setup2FA) {
        setQrCode(data.setup2FA.qrCode)
        setSecret(data.setup2FA.secret)
        setShow2FASetup(true)
      }
    } catch (error) {
      showError((error as Error)?.message ?? 'Failed to setup 2FA')
    }
  }

  async function handleVerifyAndEnable2FA() {
    if (verificationCode?.length !== 6) {
      showError('Please enter a valid 6-digit code')
      return
    }

    try {
      const { data } = await enable2FA({
        variables: {
          input: { code: verificationCode },
        },
        refetchQueries: [{ query: Me }],
      })

      if (data?.enable2FA?.success) {
        setBackupCodes(data.enable2FA.backupCodes || [])
        setShow2FASetup(false)
        setShowBackupCodes(true)
        setVerificationCode('')
        showSuccess('2FA enabled successfully!')
      }
    } catch (error) {
      showError((error as Error)?.message ?? 'Failed to enable 2FA. Please check your code.')
    }
  }

  async function handleDisable2FA() {
    if (!disablePassword) {
      showError('Please enter your password')
      return
    }

    try {
      await disable2FA({
        variables: {
          input: { password: disablePassword },
        },
        refetchQueries: [{ query: Me }],
      })

      setShow2FADisable(false)
      setDisablePassword('')
      showSuccess('2FA disabled successfully')
    } catch (error) {
      showError((error as Error)?.message ?? 'Failed to disable 2FA. Please check your password.')
    }
  }

  function handleCopyBackupCodes() {
    const text = backupCodes.join('\n')
    navigator.clipboard.writeText(text)
    showSuccess('Backup codes copied to clipboard!')
  }

  function handleDownloadBackupCodes() {
    const text = backupCodes.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '2fa-backup-codes.txt'
    link.click()
    showSuccess('Backup codes downloaded!')
  }

  const passwordFields = [
    FormFieldClass.password('currentPassword', {
      label: 'Current Password',
      required: true,
    }),
    FormFieldClass.password('newPassword', {
      label: 'New Password',
      required: true,
      helpText: 'Must be at least 8 characters',
    }),
    FormFieldClass.password('confirmPassword', {
      label: 'Confirm New Password',
      required: true,
    }),
    FormFieldClass.button('submit', {
      text: 'Change Password',
      type: 'submit',
      fullWidth: false,
    }),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 dark:bg-emerald-500/10 p-3">
            <ShieldCheckIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Security Settings</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Manage your account security and authentication
            </p>
          </div>
        </div>
      </div>

      {formError && (
        <div className="rounded-lg text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3">
          {formError}
        </div>
      )}

      {formSuccess && (
        <div className="rounded-lg text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-3">
          {formSuccess}
        </div>
      )}

      {/* Change Password */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-sky-100 dark:bg-sky-500/10 p-2">
            <KeyIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Change Password</h3>
        </div>

        <Form
          id="change-password-form"
          theme={formTheme}
          fields={passwordFields}
          submit={handleChangePassword}
        />
      </div>

      {/* Two-Factor Authentication */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-violet-100 dark:bg-violet-500/10 p-2">
            <DeviceTabletIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Two-Factor Authentication
          </h3>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Add an extra layer of security to your account by requiring a verification code in
          addition to your password.
        </p>

        <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${user?.twoFactorEnabled ? 'bg-emerald-500' : 'bg-zinc-400'}`}
            ></div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {user?.twoFactorEnabled
                  ? 'Two-factor authentication is active'
                  : 'Two-factor authentication is not enabled'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
            onClick={() => {
              if (user?.twoFactorEnabled) {
                setShow2FADisable(true)
              } else {
                handleSetup2FA()
              }
            }}
          >
            {user?.twoFactorEnabled ? 'Disable' : 'Enable'} 2FA
          </button>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Active Sessions
        </h3>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Manage your active sessions across all devices. You can log out of any session you don't
          recognize.
        </p>

        <div className="space-y-3">
          {userSessions.length === 0 ? (
            <div className="text-sm text-zinc-600 dark:text-zinc-400 p-3">
              No active sessions found
            </div>
          ) : (
            userSessions.map(session => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {session.deviceInfo || 'Unknown Device'}
                    </p>
                    {session.isCurrent && (
                      <div className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
                        Current
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                    Last active: {new Date(session.lastActiveAt).toLocaleString()}
                    {session.ipAddress && <span className="ml-2">• IP: {session.ipAddress}</span>}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    type="button"
                    className="ml-4 px-3 py-1.5 text-sm text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors font-medium"
                    onClick={() => handleInvalidateSession(session.id)}
                  >
                    Log out
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {userSessions.some(s => !s.isCurrent) && (
          <button
            type="button"
            className="mt-4 text-sm text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium"
            onClick={handleInvalidateAllSessions}
          >
            Log out of all other sessions
          </button>
        )}
      </div>

      {/* Security Events */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Recent Security Events
          </h3>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          View recent security-related activities on your account.
        </p>

        <div className="space-y-3">
          {securityEvents.length === 0 ? (
            <div className="text-sm text-zinc-600 dark:text-zinc-400 p-3">
              No recent security events
            </div>
          ) : (
            securityEvents.map(event => (
              <div
                key={event.id}
                className="flex items-start gap-3 text-sm p-3 rounded-lg bg-zinc-50 dark:bg-white/5"
              >
                <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5"></div>
                <div className="flex-1">
                  <p className="font-medium text-zinc-900 dark:text-white">
                    {event.eventType
                      ?.replaceAll('_', ' ')
                      .toLowerCase()
                      .replaceAll(/\b\w/g, l => l.toUpperCase()) || 'Security event'}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                    {new Date(event.createdAt).toLocaleString()}
                    {event.ipAddress && <span className="ml-2">• IP: {event.ipAddress}</span>}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <Link
          to="/settings/security/events"
          className="mt-4 inline-block text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
        >
          View all security events →
        </Link>
      </div>

      {/* 2FA Setup Modal */}
      {show2FASetup && qrCode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-white/10 max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Setup Two-Factor Authentication
              </h3>
              <button
                onClick={() => {
                  setShow2FASetup(false)
                  setQrCode(null)
                  setSecret(null)
                  setVerificationCode('')
                }}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                <p className="mb-2">
                  1. Scan this QR code with your authenticator app (Google Authenticator, Authy,
                  etc.)
                </p>
              </div>

              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>

              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                <p className="mb-2">Or enter this secret key manually:</p>
                <code className="block p-2 bg-zinc-100 dark:bg-zinc-800 rounded text-xs font-mono break-all">
                  {secret}
                </code>
              </div>

              <div>
                <label
                  htmlFor="totp-code"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  2. Enter the 6-digit code from your app
                </label>
                <input
                  id="totp-code"
                  type="text"
                  value={verificationCode}
                  onChange={e =>
                    setVerificationCode(e.target.value.replaceAll(/\D/g, '').slice(0, 6))
                  }
                  placeholder="000000"
                  className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleVerifyAndEnable2FA}
                  disabled={verificationCode.length !== 6}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Verify and Enable
                </button>
                <button
                  onClick={() => {
                    setShow2FASetup(false)
                    setQrCode(null)
                    setSecret(null)
                    setVerificationCode('')
                  }}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Disable Modal */}
      {show2FADisable && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-white/10 max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Disable Two-Factor Authentication
              </h3>
              <button
                onClick={() => {
                  setShow2FADisable(false)
                  setDisablePassword('')
                }}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Disabling 2FA will make your account less secure. You'll only need your password to
                log in.
              </p>

              <div>
                <label
                  htmlFor="disable-2fa-password"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Enter your password to confirm
                </label>
                <input
                  id="disable-2fa-password"
                  type="password"
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDisable2FA}
                  disabled={!disablePassword}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Disable 2FA
                </button>
                <button
                  onClick={() => {
                    setShow2FADisable(false)
                    setDisablePassword('')
                  }}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && backupCodes.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-white/10 max-w-md w-full p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                Save Your Backup Codes
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                These backup codes can be used to access your account if you lose your authenticator
                device.{' '}
                <strong className="text-amber-600 dark:text-amber-400">
                  Save them in a safe place!
                </strong>
              </p>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-zinc-900 dark:text-white">
                {backupCodes.map(code => (
                  <div
                    key={code}
                    className="bg-white dark:bg-zinc-900 px-3 py-2 rounded border border-zinc-200 dark:border-white/10 text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handleCopyBackupCodes}
                  className="flex-1 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Copy Codes
                </button>
                <button
                  onClick={handleDownloadBackupCodes}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Download Codes
                </button>
              </div>

              <button
                onClick={() => {
                  setShowBackupCodes(false)
                  setBackupCodes([])
                }}
                className="w-full px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
              >
                I've Saved My Codes
              </button>

              <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                <span role="img" aria-label="warning">
                  ⚠️
                </span>{' '}
                You won't be able to see these codes again!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

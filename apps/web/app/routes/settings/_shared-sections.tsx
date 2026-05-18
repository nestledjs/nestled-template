import React, { useState } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import {
  DeleteUserAccount,
  ExportUserData,
  type DeleteUserAccountMutation,
  type ExportUserDataQuery,
} from '@nestled-template/shared/sdk'
import { useMutation, useLazyQuery } from '@apollo/client/react'
import { TransferOwnershipModal } from '@nestled-template/web'

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

export function ExportDataSection() {
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportUserData] = useLazyQuery<ExportUserDataQuery>(ExportUserData)

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
      downloadJsonFile(
        exportData.userData,
        `user-data-export-${new Date().toISOString().split('T')[0]}.json`,
      )
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 5000)
    } catch (error) {
      setExportError((error as Error).message)
      setTimeout(() => setExportError(null), 8000)
    } finally {
      setIsExporting(false)
    }
  }

  return (
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
  )
}

function noop() {
  // intentional no-op for TransferOwnershipModal's onSuccess
}

export function TransferOwnershipSection() {
  const [showTransferModal, setShowTransferModal] = useState(false)

  return (
    <>
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
          onClick={() => setShowTransferModal(true)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Transfer Ownership
        </button>
      </div>

      <TransferOwnershipModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={noop}
      />
    </>
  )
}

export function DangerZoneSection() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteAccountMutation] = useMutation<DeleteUserAccountMutation>(DeleteUserAccount)

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      alert('Please type DELETE to confirm account deletion')
      return
    }

    try {
      await deleteAccountMutation()
      alert('Your account has been deleted. You will be logged out now.')
      globalThis.location.href = '/login'
    } catch (error) {
      alert('Failed to delete account: ' + (error as Error).message)
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
    }
  }

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/5 p-6 backdrop-blur">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-rose-100 dark:bg-rose-500/10 p-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        </div>
        <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-400">Danger Zone</h3>
      </div>

      <p className="text-sm text-rose-700 dark:text-rose-300 mb-4">
        <strong>Delete your account:</strong> Once you delete your account, there is no going back.
        This will permanently delete your account and all associated data. You will be removed from
        all organizations.
      </p>

      {showDeleteConfirm ? (
        <div className="space-y-3">
          <div className="p-4 border-2 border-rose-300 dark:border-rose-500/30 rounded-lg bg-white dark:bg-rose-500/5">
            <p className="text-sm font-medium text-rose-900 dark:text-rose-300 mb-2">
              Are you absolutely sure?
            </p>
            <p className="text-sm text-rose-700 dark:text-rose-400 mb-3">
              This action <strong>cannot be undone</strong>. Please type <strong>DELETE</strong> to
              confirm.
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
      ) : (
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Delete My Account
        </button>
      )}
    </div>
  )
}

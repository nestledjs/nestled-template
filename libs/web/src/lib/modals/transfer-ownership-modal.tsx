import React, { useState } from 'react'
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'
import { useQuery, useMutation } from '@apollo/client/react'
import {
  MyOrganizationsWithMembers,
  TransferOrganizationOwnership,
  Me,
  type MyOrganizationsWithMembersQuery,
  type TransferOrganizationOwnershipMutation,
  type MeQuery,
} from '@nestled-template/shared/sdk'

interface TransferOwnershipModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function TransferOwnershipModal({
  isOpen,
  onClose,
  onSuccess,
}: Readonly<TransferOwnershipModalProps>) {
  const [selectedOrganization, setSelectedOrganization] = useState<string>('')
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>('')
  const [confirmText, setConfirmText] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)

  const { data: meData } = useQuery<MeQuery>(Me)
  const { data: organizationsData, loading } = useQuery<MyOrganizationsWithMembersQuery>(
    MyOrganizationsWithMembers,
  )
  const [transferOwnershipMutation] = useMutation<TransferOrganizationOwnershipMutation>(
    TransferOrganizationOwnership,
  )

  const currentUserId = meData?.me?.id

  // Filter organizations where current user is the owner
  const ownedOrganizations =
    organizationsData?.myOrganizations?.filter(org =>
      org.members?.some(
        member => member.role?.name === 'Owner' && member.user?.id === currentUserId,
      ),
    ) || []

  // Get members of selected organization (excluding current user as owner)
  const selectedOrgMembers = selectedOrganization
    ? ownedOrganizations
        .find(org => org.id === selectedOrganization)
        ?.members?.filter(
          member => member.user?.id !== currentUserId, // Can't transfer to yourself
        ) || []
    : []

  const handleTransfer = async () => {
    if (!selectedOrganization || !selectedNewOwner || confirmText !== 'TRANSFER') {
      alert('Please fill all fields and type TRANSFER to confirm')
      return
    }

    setIsTransferring(true)
    try {
      await transferOwnershipMutation({
        variables: {
          input: {
            organizationId: selectedOrganization,
            newOwnerUserId: selectedNewOwner,
          },
        },
      })

      alert('Organization ownership transferred successfully!')
      onSuccess()
      handleClose()
    } catch (error) {
      alert('Failed to transfer ownership: ' + (error as Error).message)
    } finally {
      setIsTransferring(false)
    }
  }

  const handleClose = () => {
    setSelectedOrganization('')
    setSelectedNewOwner('')
    setConfirmText('')
    setIsTransferring(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 py-6">
        {/* Backdrop */}
        <button
          type="button"
          className="fixed inset-0 w-full h-full bg-black/50 backdrop-blur-sm transition-opacity cursor-default"
          onClick={handleClose}
          aria-label="Close dialog"
        />

        {/* Modal */}
        <div className="relative w-full max-w-md rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-2">
                <ArrowsRightLeftIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                Transfer Ownership
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
            >
              <XMarkIcon className="h-5 w-5 text-zinc-500" />
            </button>
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Loading organizations...
              </div>
            </div>
          )}
          {!loading && ownedOrganizations.length === 0 && (
            <div className="text-center py-8">
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                You don't own any organizations to transfer.
              </div>
            </div>
          )}
          {!loading && ownedOrganizations.length > 0 && (
            <div className="space-y-4">
              {/* Organization Selection */}
              <div>
                <label
                  htmlFor="transfer-organization"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Select Organization to Transfer
                </label>
                <select
                  id="transfer-organization"
                  value={selectedOrganization}
                  onChange={e => {
                    setSelectedOrganization(e.target.value)
                    setSelectedNewOwner('') // Reset new owner when org changes
                  }}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Choose an organization...</option>
                  {ownedOrganizations.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* New Owner Selection */}
              {selectedOrganization && (
                <div>
                  <label
                    htmlFor="transfer-new-owner"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                  >
                    Select New Owner
                  </label>
                  {selectedOrgMembers.length === 0 ? (
                    <div className="text-sm text-zinc-500 dark:text-zinc-400 py-2">
                      No other members available to transfer ownership to.
                    </div>
                  ) : (
                    <select
                      id="transfer-new-owner"
                      value={selectedNewOwner}
                      onChange={e => setSelectedNewOwner(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Choose new owner...</option>
                      {selectedOrgMembers.map(member => (
                        <option key={member.id} value={member.user?.id}>
                          {member.user?.firstName} {member.user?.lastName} ({member.role?.name})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Warning */}
              {selectedOrganization && selectedNewOwner && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 p-4">
                  <div className="flex gap-3">
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                        Warning: This action cannot be undone
                      </h4>
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        You will lose ownership privileges and the new owner will have full control
                        of the organization.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation */}
              {selectedOrganization && selectedNewOwner && (
                <div>
                  <label
                    htmlFor="transfer-confirm"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                  >
                    Type <strong>TRANSFER</strong> to confirm
                  </label>
                  <input
                    id="transfer-confirm"
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="Type TRANSFER to confirm"
                    className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleTransfer}
                  disabled={
                    !selectedOrganization ||
                    !selectedNewOwner ||
                    confirmText !== 'TRANSFER' ||
                    isTransferring ||
                    selectedOrgMembers.length === 0
                  }
                  className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isTransferring ? 'Transferring...' : 'Transfer Ownership'}
                </button>
                <button
                  onClick={handleClose}
                  disabled={isTransferring}
                  className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

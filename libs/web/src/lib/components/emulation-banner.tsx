import { useMutation } from '@apollo/client/react'
import { EndEmulation, type EndEmulationMutation } from '@nestled-template/shared/sdk'
import {
  ShieldExclamationIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid'
import { useGlobalCtx } from '../contexts'
import { useState } from 'react'

/**
 * Banner shown at the top of the page when admin is emulating a user
 * Allows the admin to exit emulation and return to their own session
 */
export function EmulationBanner() {
  const { user } = useGlobalCtx()
  const [showConfirm, setShowConfirm] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Check emulation status from user object (set server-side)
  const isEmulating = !!user?.isEmulating

  const [endEmulation, { loading }] = useMutation<EndEmulationMutation>(EndEmulation, {
    onCompleted: () => {
      // Reload page to switch back to admin session
      globalThis.location.href = '/admin/users'
    },
    onError: error => {
      setErrorMessage(error.message)
      setTimeout(() => setErrorMessage(null), 5000) // Auto-hide after 5s
    },
  })

  if (!isEmulating) {
    return null
  }

  const handleEndEmulation = () => {
    setShowConfirm(true)
  }

  const confirmEndEmulation = () => {
    setShowConfirm(false)
    endEmulation()
  }

  const cancelEndEmulation = () => {
    setShowConfirm(false)
  }

  return (
    <>
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 px-4 py-3 shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldExclamationIcon className="h-6 w-6 text-white animate-pulse" />
            <div className="text-white">
              <p className="font-semibold">Admin Emulation Mode</p>
              <p className="text-sm text-white/90">
                You are currently viewing the application as another user
              </p>
            </div>
          </div>

          <button
            onClick={handleEndEmulation}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-orange-600 shadow-md hover:bg-gray-100 disabled:opacity-50 transition"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-orange-600 border-r-transparent" />
            ) : (
              <XMarkIcon className="h-4 w-4" />
            )}
            Exit Emulation
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-zinc-900 rounded-lg shadow-xl max-w-md w-full mx-4 border border-zinc-800">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">End Emulation?</h3>
                  <p className="text-sm text-zinc-400">
                    This will return you to your admin account. Any unsaved changes in the current
                    session may be lost.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-800/50 px-6 py-4 flex gap-3 justify-end rounded-b-lg">
              <button
                onClick={cancelEndEmulation}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmEndEmulation}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Ending...' : 'End Emulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <div className="bg-red-900/90 border border-red-800 rounded-lg shadow-xl p-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white mb-1">Error</h4>
                <p className="text-sm text-red-200">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-red-300 transition"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

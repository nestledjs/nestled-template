import React, { useEffect, useState } from 'react'

export interface WebUiViteCacheErrorProps {
  autoRefresh?: boolean
  autoRefreshDelay?: number
  header?: React.ReactNode
}

export function WebUiViteCacheError({
  autoRefresh = true,
  autoRefreshDelay = 3000,
  header,
}: Readonly<WebUiViteCacheErrorProps>) {
  const [countdown, setCountdown] = useState(Math.ceil(autoRefreshDelay / 1000))

  useEffect(() => {
    if (!autoRefresh) return

    const timer = setTimeout(() => {
      window.location.reload()
    }, autoRefreshDelay)

    const countdownTimer = setInterval(() => {
      setCountdown(prev => prev - 1)
    }, 1000)

    return () => {
      clearTimeout(timer)
      clearInterval(countdownTimer)
    }
  }, [autoRefresh, autoRefreshDelay])

  const handleManualRefresh = () => {
    window.location.reload()
  }

  const content = (
    <div className="flex-grow text-gray-800 w-full p-10 flex flex-col justify-center items-center min-h-screen">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24">
        <path
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M3 16l2.26-2.26A9.75 9.75 0 0 0 12 21a9 9 0 0 0 9-9"
        />
      </svg>
      <h1 className="pt-6 text-3xl font-bold">Refreshing Build</h1>
      <div className="text-center pt-4 max-w-96">
        Development cache needs to be refreshed. The page will reload automatically.
      </div>
      {autoRefresh && countdown > 0 && (
        <div className="text-center pt-4 text-sm text-gray-600">
          Refreshing in {countdown} second{countdown !== 1 ? 's' : ''}...
        </div>
      )}
      <button
        onClick={handleManualRefresh}
        className="mt-6 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
      >
        Refresh Now
      </button>
    </div>
  )

  if (header) {
    return (
      <div className="min-h-screen flex flex-col">
        {header}
        {content}
      </div>
    )
  }

  return content
} 
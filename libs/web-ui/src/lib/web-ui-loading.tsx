import React, { useEffect, useState } from 'react'
import { cn } from '@nestled-template/shared/utils'

export function WebUiLoading({ className }: Readonly<{ className?: string }>) {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    // Set a timeout to show the loading element after 1 second
    const timer = setTimeout(() => {
      setShowLoading(true)
    }, 1000) // 1000 milliseconds = 1 second

    // Cleanup function to clear the timeout if the component unmounts
    // or if the loading element is no longer needed before the timeout completes.
    return () => clearTimeout(timer)
  }, [])

  if (!showLoading) {
    return null
  }

  return (
    <output
      aria-label="Loading"
      className={cn('w-full h-full flex items-center justify-center', className || '')}
    >
      <div className="flex space-x-2">
        <div
          aria-hidden="true"
          className="h-2.5 w-2.5 bg-blue-500 rounded-full animate-pulse"
        ></div>
        <div
          aria-hidden="true"
          className="h-2.5 w-2.5 bg-blue-500 rounded-full animate-pulse delay-150"
        ></div>
        <div
          aria-hidden="true"
          className="h-2.5 w-2.5 bg-blue-500 rounded-full animate-pulse delay-300"
        ></div>
      </div>
    </output>
  )
}

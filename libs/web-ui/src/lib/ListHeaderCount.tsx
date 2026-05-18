import React from 'react'
import { cn } from '@nestled-template/shared/utils'

export function ListHeaderCount({
  total,
  showing,
  loading,
  title,
  className,
}: Readonly<{
  total?: number
  showing?: number
  loading?: boolean
  title?: string
  className?: string
}>) {
  let text: string
  if (loading) {
    text = 'Loading...'
  } else if (total !== undefined && showing !== undefined) {
    text =
      total === showing
        ? `${total} ${title ?? ''}`.trim()
        : `Showing ${showing} of ${total} ${title ?? ''}`.trim()
  } else {
    text = title ?? ''
  }

  return (
    <div
      className={cn(
        'bg-sky-600 w-full rounded-md p-4 text-center text-base font-semibold text-white',
        className,
      )}
    >
      {text}
    </div>
  )
}

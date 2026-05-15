
import React from 'react'
import { cn } from '@nestled-template/shared/utils'

export interface WebUiContainerProps {
  children: React.ReactNode
  blur?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'
  hideOverflow?: boolean
  center?: boolean
  width?: string
  id?: string
  className?: string
}

export function WebUiContainer(props: Readonly<WebUiContainerProps>) {
  const horizontalBlur =
    props?.blur === 'top-right' || props?.blur === 'bottom-right' ? 'right-[-25%]' : 'left-[-25%]'
  const verticalBlur =
    props?.blur === 'bottom-left' || props?.blur === 'bottom-right' ? 'bottom-[-25%]' : 'top-[-25%]'
  const centerClasses = props?.center ? 'flex items-center justify-center' : ''
  const widthClasses = props?.width ? `${props.width}` : 'max-w-7xl'
  return (
    <div
      id={props?.id}
      className={cn(
        props?.className ?? '',
        'relative w-full',
        props?.hideOverflow ? 'overflow-hidden' : '',
      )}
    >
      {props?.blur ? (
        <div
          className={cn(
            'rounded-full z-0 absolute h-5/6 w-5/6 blur-3xl',
            'bg-radial-[at_50%_50%] from-sky-600 to-transparent to-75%',
            horizontalBlur,
            verticalBlur,
          )}
        />
      ) : null}
      <div className={`z-10 relative mx-auto ${widthClasses} ${centerClasses} p-6 lg:px-8`}>
        {props.children}
      </div>
    </div>
  )
}
